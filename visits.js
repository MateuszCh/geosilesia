// Server-side visit tracking: no cookies, no client-side tracker, no consent banner.
//
// Two sources with separate roles:
// - "ssr": a document request (full load, reload, new tab) answered by the SSR catch-all.
//   The only basis for entries (visits), unique visitors per day and landing pages.
// - "nav": a GET /api/page call the front marks with `X-Page-View: 1` (the router resolver
//   and the page component's refresh). Records transitions inside the app only; it never
//   counts toward unique visitors or entries.
//
// The visitor id is sha256(daily salt + network + user agent + Accept-Language), cut to 16
// hex characters. The salt is random, rotates every day (Europe/Warsaw) and the previous one
// is overwritten, so ids cannot be linked across days and cannot be traced back to an IP.
// Neither the IP nor the user agent is stored; of Accept-Language only the primary language
// code of the browser ("pl", "de") is kept, which says nothing about one person.
//
// Known accuracy limits of the unique count:
// - one person on several devices or browsers counts several times;
// - an IPv4 change during the day (mobile networks, Wi-Fi <-> LTE) counts twice
//   (for IPv6 only the /64 prefix is used, which survives temporary address rotation);
// - identical devices behind one shared IP (CGNAT, offices) may merge into one;
// - unique visitors exist per day only – there is no weekly or monthly unique count.

const crypto = require("crypto");

const COLLECTION = "visits";
const SALT_ID = "visit-salt";
// A visit ends after 30 minutes without any hit – the GA/Plausible definition.
const VISIT_GAP_MS = 30 * 60 * 1000;
// A nav hit for the same visitor and page this soon after any hit is a duplicate: the
// page component refetching what the SSR load or the resolver has just shown.
const DEDUP_MS = 30 * 1000;
const MAX_ENTRIES = 50000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const BOT_UA = new RegExp(
    [
        "bot", "crawl", "spider", "slurp", "facebookexternalhit", "preview", "headless",
        "lighthouse", "pagespeed", "inspectiontool", "curl", "wget", "python", "java",
        "go-http", "axios", "node-fetch", "okhttp", "httpclient", "libwww", "scrapy",
        "monitor", "uptime", "ahrefs", "semrush", "yandex", "baidu", "bytespider", "petal",
        // "claude-" (Claude-User, Claude-SearchBot), not "claude": the Claude desktop app's
        // browser sends "Claude/<version>" and is a person browsing.
        "gptbot", "ccbot", "claude-", "perplexity"
    ].join("|"),
    "i"
);

const warsawDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});

/** "2026-11-07" in Polish time – the day a hit belongs to and the salt's lifetime. */
function dayOf(date) {
    return warsawDay.format(date);
}

/**
 * What identifies the visitor's network: the whole IPv4 address, or the /64 prefix of an
 * IPv6 one (the part the provider assigns; the rest rotates with privacy extensions).
 */
function networkOf(ip) {
    if (!ip) return "";
    const address = ip.replace(/^::ffff:/i, "").replace(/%.*$/, "");
    if (!address.includes(":")) return address;
    const [head, tail] = address.split("::");
    const headGroups = head ? head.split(":") : [];
    const tailGroups = tail !== undefined && tail ? tail.split(":") : [];
    const missing = 8 - headGroups.length - tailGroups.length;
    const groups =
        tail === undefined
            ? headGroups
            : [...headGroups, ...new Array(Math.max(missing, 0)).fill("0"), ...tailGroups];
    return groups
        .slice(0, 4)
        .map(group => (parseInt(group, 16) || 0).toString(16))
        .join(":");
}

/**
 * The browser's first language as a bare code ("pl", "de", "en"), without the region and
 * the weights; null when the header is missing or malformed.
 */
function languageOf(acceptLanguage) {
    const first = String(acceptLanguage || "").split(",")[0].split(";")[0].trim();
    const code = first.split("-")[0].toLowerCase();
    return /^[a-z]{2,3}$/.test(code) ? code : null;
}

function deviceOf(userAgent) {
    if (/ipad|tablet|android(?!.*mobile)/i.test(userAgent)) return "tablet";
    if (/mobi|iphone|ipod|android/i.test(userAgent)) return "mobile";
    return "desktop";
}

function hostOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch (err) {
        return null;
    }
}

/** The referring host, only when it is another site; links within the site give null. */
function externalReferrer(req, ownHosts) {
    const host = hostOf(req.get("referer") || "");
    if (!host) return null;
    const requestHost = (req.hostname || "").replace(/^www\./, "").toLowerCase();
    return host === requestHost || ownHosts.has(host) ? null : host;
}

function isPrefetch(req) {
    return /prefetch|prerender/i.test(`${req.get("sec-purpose") || ""} ${req.get("purpose") || ""}`);
}

/** Keeps a Map in insertion order of the last update, so the oldest entries come first. */
function touch(map, key, value) {
    map.delete(key);
    map.set(key, value);
    if (map.size > MAX_ENTRIES) {
        map.delete(map.keys().next().value);
    }
}

function prune(map, olderThan) {
    for (const [key, ts] of map) {
        if (ts >= olderThan) break;
        map.delete(key);
    }
}

/**
 * Returns `track(req, { path, source })`. It never throws and never delays the response:
 * the write happens in the background and errors only end up in the log.
 */
function createVisitTracker(db, { siteUrl } = {}) {
    const visits = db.collection(COLLECTION);
    const meta = db.collection("meta");
    const ownHosts = new Set([hostOf(siteUrl || "")].filter(Boolean));
    const lastSeen = new Map(); // visitor -> ts of the last hit of any source
    const recent = new Map(); // `${visitor}|${path}` -> ts of the last hit
    let salt = { day: null, value: null, pending: null };

    Promise.all([
        visits.createIndex({ day: 1, visitor: 1 }),
        visits.createIndex({ day: 1, path: 1 })
    ]).catch(err => console.log(new Date(), "[visits] index", err));

    const cleanup = setInterval(() => {
        const now = Date.now();
        prune(lastSeen, now - VISIT_GAP_MS);
        prune(recent, now - DEDUP_MS);
    }, CLEANUP_INTERVAL_MS);
    cleanup.unref();

    // One salt document, replaced on the first hit of a new day – the old salt is gone for
    // good. Stored rather than kept in memory so a restart does not split visitors in two.
    // If the document already holds today's salt, the filter misses and the upsert fails on
    // the duplicate _id; either way the document is read back afterwards.
    function saltFor(day) {
        if (salt.day === day && salt.value) return Promise.resolve(salt.value);
        if (salt.day === day && salt.pending) return salt.pending;
        const pending = meta
            .updateOne(
                { _id: SALT_ID, day: { $ne: day } },
                { $set: { day, salt: crypto.randomBytes(32).toString("hex") } },
                { upsert: true }
            )
            .catch(err => {
                if (err.code !== 11000) throw err;
            })
            .then(() => meta.findOne({ _id: SALT_ID }))
            .then(doc => {
                if (!doc || doc.day !== day) throw new Error("salt for the wrong day");
                salt = { day, value: doc.salt, pending: null };
                return doc.salt;
            });
        salt = { day, value: null, pending };
        pending.catch(() => {
            if (salt.pending === pending) salt = { day: null, value: null, pending: null };
        });
        return pending;
    }

    function record(req, path, source, now) {
        const userAgent = req.get("user-agent") || "";
        const day = dayOf(now);
        return saltFor(day).then(dailySalt => {
            const visitor = crypto
                .createHash("sha256")
                .update(
                    [dailySalt, networkOf(req.ip), userAgent, req.get("accept-language") || ""].join("\n")
                )
                .digest("hex")
                .slice(0, 16);
            const ts = now.getTime();
            const pairKey = `${visitor}|${path}`;

            if (source === "nav" && ts - (recent.get(pairKey) || 0) < DEDUP_MS) {
                touch(lastSeen, visitor, ts);
                return null;
            }
            const entry = source === "ssr" ? ts - (lastSeen.get(visitor) || 0) >= VISIT_GAP_MS : false;
            touch(lastSeen, visitor, ts);
            touch(recent, pairKey, ts);

            return visits.insertOne({
                ts: now,
                day,
                path,
                visitor,
                source,
                referrer: source === "ssr" ? externalReferrer(req, ownHosts) : null,
                device: deviceOf(userAgent),
                lang: languageOf(req.get("accept-language")),
                entry
            });
        });
    }

    return function track(req, { path, source }) {
        try {
            const userAgent = req.get("user-agent") || "";
            if (req.method !== "GET" || !userAgent || BOT_UA.test(userAgent) || isPrefetch(req)) {
                return;
            }
            record(req, path, source, new Date()).catch(err =>
                console.log(new Date(), "[visits]", err)
            );
        } catch (err) {
            console.log(new Date(), "[visits]", err);
        }
    };
}

module.exports = { createVisitTracker, networkOf, deviceOf, languageOf, dayOf };
