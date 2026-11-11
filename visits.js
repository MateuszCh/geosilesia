// Visit tracking: no cookies, no third-party tracker, no consent banner.
//
// Only what the site's own script reports is counted: a document request alone is not a
// view. Scrapers and vulnerability scanners fetch pages with a browser's user agent but do
// not run JavaScript, so counting the request itself filled the statistics with them (on
// the first days most "en" and every "zh" visitor, and every 404, were such bots). The
// user agent check below still drops the bots that name themselves.
//
// Each document is one page view (a hit), from one of two sources:
// - "ssr": a full load (a reload, a new tab, a page opened from another site), reported by
//   the front once the page is shown with a "view" beacon (POST /api/visit-event) that
//   carries `document.referrer`; only these keep the external referrer. A page Chrome
//   prerendered or prefetched is reported when it is shown, so it counts only if it is.
// - "nav": a GET /api/page call the front marks with `X-Page-View: 1` (the router resolver
//   and the page component's refresh): a page opened inside the app. The front leaves the
//   mark off while the document is loading, so the "view" beacon counts that page alone.
// Every hit and event carries `confirmed: true`: the readers (Frodo) tell them from the hits
// stored before, which the server wrote on the document request, bots included.
// Hits are stored raw. The readers (Frodo's Analytics tab, scripts/stats.js) count them the
// way GA4 and Plausible do: visitors (anyone with a hit that day), views (all hits) and
// visits, split by timestamps – one visitor's hits with no gap of 30 minutes or more, the
// first hit of a day or after such a gap starting a visit, a full load or a nav alike.
// Nothing here keeps visits in memory, so several processes and restarts count the same.
// (Older documents also carry an `entry` flag; the readers ignore it.)
//
// Each hit also keeps coarse facts about the browser: the device kind, the browser and the
// system family ("chrome", "ios"); the address and the full user agent are never stored.
//
// Events (`visit_events`, written by `event()`): what a page view alone does not say –
// - "notFound": an address that does not exist, opened directly (its "view" beacon) or by
//   a link inside the site ("nav"), with the page or site the visitor came from; the same
//   address of the same visitor again within DEDUP_MS is one 404 (the resolver and the
//   page component's refresh both ask for it);
// - "engagement": how long a page was really visible, sent by the front when the page is
//   hidden or left (navigator.sendBeacon, nothing stored in the browser);
// - "outbound" / "download": a click on a link to another site or to a document.
// None of it needs consent: nothing is stored on or read from the visitor's device beyond
// what every request carries, and no id outlives the day.
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
const EVENTS = "visit_events";
const EVENT_TYPES = new Set(["notFound", "engagement", "outbound", "download"]);
// an engagement beacon longer than this is a tab left open: it is cut, not dropped
const MAX_ENGAGEMENT_MS = 30 * 60 * 1000;
const MAX_TEXT = 300;
const SALT_ID = "visit-salt";
// A nav hit for the same visitor and page this soon after any hit is a duplicate: the
// page component refetching what the resolver has just shown. So is a second 404 of the
// same address.
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

/** The browser family, coarse: never the version or the full user agent. */
function browserOf(userAgent) {
    if (/edg(e|a|ios)?\//i.test(userAgent)) return "edge";
    if (/opr\/|opera/i.test(userAgent)) return "opera";
    if (/samsungbrowser/i.test(userAgent)) return "samsung";
    if (/firefox|fxios/i.test(userAgent)) return "firefox";
    if (/chrome|crios|chromium/i.test(userAgent)) return "chrome";
    if (/safari/i.test(userAgent)) return "safari";
    return null;
}

/** The system family, coarse: never the version. */
function osOf(userAgent) {
    if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
    if (/android/i.test(userAgent)) return "android";
    if (/windows/i.test(userAgent)) return "windows";
    if (/mac os x|macintosh/i.test(userAgent)) return "macos";
    if (/cros/i.test(userAgent)) return "chromeos";
    if (/linux/i.test(userAgent)) return "linux";
    return null;
}

/** A short text from the outside, or null: trimmed and cut so it cannot fill the database. */
function shortText(value) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text ? text.slice(0, MAX_TEXT) : null;
}

function hostOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch (err) {
        return null;
    }
}

function isOwnHost(host, req, ownHosts) {
    const requestHost = (req.hostname || "").replace(/^www\./, "").toLowerCase();
    return host === requestHost || ownHosts.has(host);
}

/**
 * The referrer a hit or event is about: the one the front reports (`document.referrer` in
 * a beacon, "" when there was none), or else the request's own Referer header.
 */
function referrerOf(req, reported) {
    return typeof reported === "string" ? reported : req.get("referer") || "";
}

/** The referring host, only when it is another site; links within the site give null. */
function externalReferrer(referrer, req, ownHosts) {
    const host = hostOf(referrer);
    return !host || isOwnHost(host, req, ownHosts) ? null : host;
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
 * Where a visitor came from to an address: a path of the site when a link inside it led
 * there, otherwise the other site's host; null when the browser did not say.
 */
function sourceOf(referrer, req, ownHosts) {
    const host = hostOf(referrer);
    if (!host) return null;
    if (isOwnHost(host, req, ownHosts)) {
        try {
            return shortText(decodeURIComponent(new URL(referrer).pathname));
        } catch (err) {
            return null;
        }
    }
    return host;
}

/**
 * Returns `{ track, event }`:
 * - `track(req, { path, source, referrer })` records a page view;
 * - `event(req, { type, path, ms, target, referrer })` records an event (see the top of the file).
 * Neither throws nor delays the response: the write happens in the background and errors
 * only end up in the log.
 */
function createVisitTracker(db, { siteUrl } = {}) {
    const visits = db.collection(COLLECTION);
    const events = db.collection(EVENTS);
    const meta = db.collection("meta");
    const ownHosts = new Set([hostOf(siteUrl || "")].filter(Boolean));
    // `${visitor}|${path}` -> ts of the last hit, `404|${visitor}|${path}` of the last 404
    const recent = new Map();
    let salt = { day: null, value: null, pending: null };

    Promise.all([
        visits.createIndex({ day: 1, visitor: 1 }),
        visits.createIndex({ day: 1, path: 1 }),
        visits.createIndex({ ts: 1 }),
        events.createIndex({ day: 1, type: 1 })
    ]).catch(err => console.log(new Date(), "[visits] index", err));

    const cleanup = setInterval(() => {
        const now = Date.now();
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

    /** The visitor id of a request on a day: the same for a page view and its events. */
    function visitorOf(req, day) {
        const userAgent = req.get("user-agent") || "";
        return saltFor(day).then(dailySalt =>
            crypto
                .createHash("sha256")
                .update(
                    [dailySalt, networkOf(req.ip), userAgent, req.get("accept-language") || ""].join("\n")
                )
                .digest("hex")
                .slice(0, 16)
        );
    }

    /** A request from a browser: not a bot that names itself, nor one without a user agent. */
    function isPerson(req) {
        const userAgent = req.get("user-agent") || "";
        return Boolean(userAgent) && !BOT_UA.test(userAgent);
    }

    /** Whether `key` was seen within DEDUP_MS; marks it seen now either way. */
    function seenRecently(key, ts) {
        const seen = ts - (recent.get(key) || 0) < DEDUP_MS;
        touch(recent, key, ts);
        return seen;
    }

    function record(req, { path, source, referrer }, now) {
        const userAgent = req.get("user-agent") || "";
        const day = dayOf(now);
        return visitorOf(req, day).then(visitor => {
            if (seenRecently(`${visitor}|${path}`, now.getTime()) && source === "nav") {
                return null;
            }

            return visits.insertOne({
                ts: now,
                day,
                path,
                visitor,
                source,
                referrer:
                    source === "ssr"
                        ? externalReferrer(referrerOf(req, referrer), req, ownHosts)
                        : null,
                device: deviceOf(userAgent),
                browser: browserOf(userAgent),
                os: osOf(userAgent),
                lang: languageOf(req.get("accept-language")),
                confirmed: true
            });
        });
    }

    /**
     * `referrer`: what the front reports for a full load ("ssr"), `document.referrer` of
     * its "view" beacon; a "nav" hit has none.
     */
    function track(req, { path, source, referrer }) {
        try {
            if (!isPerson(req)) return;
            record(req, { path, source, referrer }, new Date()).catch(err =>
                console.log(new Date(), "[visits]", err)
            );
        } catch (err) {
            console.log(new Date(), "[visits]", err);
        }
    }

    /**
     * `referrer` (notFound only): `document.referrer` of the "view" beacon of a 404 opened
     * directly; without it, the Referer header of the request (the page a link was on).
     */
    function event(req, { type, path, ms, target, referrer }) {
        try {
            if (!EVENT_TYPES.has(type) || !isPerson(req)) return false;
            const page = shortText(path);
            if (!page) return false;
            const doc = { type, path: page };
            if (type === "engagement") {
                const time = Math.round(Number(ms));
                if (!Number.isFinite(time) || time <= 0) return false;
                doc.ms = Math.min(time, MAX_ENGAGEMENT_MS);
            } else if (type === "notFound") {
                doc.from = sourceOf(referrerOf(req, referrer), req, ownHosts);
            } else {
                doc.target = shortText(target);
                if (!doc.target) return false;
            }
            const now = new Date();
            const day = dayOf(now);
            visitorOf(req, day)
                .then(visitor => {
                    if (type === "notFound" && seenRecently(`404|${visitor}|${doc.path}`, now.getTime())) {
                        return null;
                    }
                    return events.insertOne({ ts: now, day, visitor, ...doc, confirmed: true });
                })
                .catch(err => console.log(new Date(), "[visits] event", err));
            return true;
        } catch (err) {
            console.log(new Date(), "[visits] event", err);
            return false;
        }
    }

    return { track, event };
}

module.exports = {
    createVisitTracker,
    networkOf,
    deviceOf,
    browserOf,
    osOf,
    languageOf,
    dayOf
};
