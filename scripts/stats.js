// Visit statistics from the `visits` collection (written by visits.js). Read-only.
//
//   node scripts/stats.js [--days=30] [--top=10]
//
// Reads the database from config.json. Counts as Frodo's Analytics tab and GA4/Plausible do:
// - visitors: different visitors of a day (any hit), summed over the days;
// - visits: one visitor's hits with no gap of 30 minutes or more (split here, from the
//   timestamps; the old `entry` flag is ignored);
// - views: all hits (full loads and pages opened inside the app).
// Prints these per day, the average visit and the single-page visits, then the landing
// pages, external referrers, devices and browser languages of the visits (each from the
// visit's first hit) and the most viewed pages.
//
// Only people are counted, as in Frodo: hits and events the site's own script reported
// (`confirmed`, everything visits.js writes now) and, of the older ones the server wrote on
// the document request, only those of visitors who ran the page's script that day (a page
// opened inside the app, or a visible-time or link-click event). The rest were scrapers.
//
// Accuracy limits (see visits.js): one person on several devices counts several times, an
// IPv4 change during the day counts twice, identical devices behind one shared IP may merge
// into one. Visitors exist per day only: the salt rotates daily, so the "total" row is the
// sum of daily visitors, not the number of different people in the period.

const { withDb } = require("./cms/lib");
const { dayOf } = require("../visits");

function numberArg(name, fallback) {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    const value = arg ? parseInt(arg.slice(name.length + 3), 10) : NaN;
    return value > 0 ? value : fallback;
}

function table(title, rows, columns) {
    console.log(`\n${title}`);
    if (!rows.length) {
        console.log("  (none)");
        return;
    }
    const widths = columns.map(([label, key]) =>
        Math.max(label.length, ...rows.map(row => String(row[key] ?? "").length))
    );
    const line = cells => "  " + cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ");
    console.log(line(columns.map(([label]) => label)));
    rows.forEach(row => console.log(line(columns.map(([, key]) => String(row[key] ?? "")))));
}

// A visit ends after 30 minutes without any hit – the GA/Plausible definition.
const VISIT_GAP_MS = 30 * 60 * 1000;

function count(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
}

function topOf(map, limit, unknown = "(unknown)") {
    return [...map]
        .map(([key, value]) => ({ key: key ?? unknown, count: value }))
        .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)))
        .slice(0, limit);
}

/** Splits hits sorted by visitor, then time, into visits (as Frodo's summarizeVisits). */
function splitVisits(hits) {
    const result = {
        perDay: new Map(),
        visits: 0,
        single: 0,
        durationMs: 0,
        landing: new Map(),
        referrers: new Map(),
        devices: new Map(),
        languages: new Map()
    };
    let visit = null;
    let previous = null;
    const close = () => {
        if (!visit) return;
        result.visits += 1;
        if (visit.pages.size === 1) result.single += 1;
        result.durationMs += visit.end - visit.start;
        count(result.perDay, visit.day);
        count(result.landing, visit.landing);
        visit = null;
    };
    for (const hit of hits) {
        const ts = new Date(hit.ts).getTime();
        const starts = !previous || hit.visitor !== previous.visitor || ts - previous.ts >= VISIT_GAP_MS;
        previous = { visitor: hit.visitor, ts };
        if (starts) {
            close();
            visit = { day: hit.day, landing: hit.path, pages: new Set([hit.path]), start: ts, end: ts };
            count(result.referrers, hit.source === "ssr" ? hit.referrer ?? null : null);
            count(result.devices, hit.device ?? null);
            count(result.languages, hit.lang ?? null);
            continue;
        }
        visit.pages.add(hit.path);
        visit.end = ts;
    }
    close();
    return result;
}

/** Events only a page's own script sends: proof the visitor of that day was a browser. */
const SCRIPT_EVENTS = ["engagement", "outbound", "download"];

/**
 * The match of the people's hits since `since`: confirmed ones, and older ones of visitors
 * who ran the page's script that day (visitor ids are per day, so the ids alone suffice).
 */
async function peopleSince(db, since) {
    const legacy = { day: { $gte: since }, confirmed: { $exists: false } };
    const [navigated, scripted] = await Promise.all([
        db.collection("visits").distinct("visitor", { ...legacy, source: "nav" }),
        db.collection("visit_events").distinct("visitor", { ...legacy, type: { $in: SCRIPT_EVENTS } })
    ]);
    return { $or: [{ confirmed: true }, { visitor: { $in: [...new Set([...navigated, ...scripted])] } }] };
}

withDb(async db => {
    const days = numberArg("days", 30);
    const limit = numberArg("top", 10);
    const since = dayOf(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
    const visits = db.collection("visits");
    const inRange = { day: { $gte: since }, ...(await peopleSince(db, since)) };

    const perDay = await visits
        .aggregate([
            { $match: inRange },
            { $group: { _id: "$day", visitors: { $addToSet: "$visitor" }, views: { $sum: 1 } } },
            { $project: { visitors: { $size: "$visitors" }, views: 1 } },
            { $sort: { _id: 1 } }
        ])
        .toArray();
    const hits = await visits
        .aggregate(
            [
                { $match: inRange },
                { $project: { _id: 0, day: 1, visitor: 1, ts: 1, path: 1, source: 1, referrer: 1, device: 1, lang: 1 } },
                { $sort: { visitor: 1, ts: 1 } }
            ],
            { allowDiskUse: true }
        )
        .toArray();
    const split = splitVisits(hits);

    const rows = perDay.map(row => ({
        day: row._id,
        visitors: row.visitors,
        visits: split.perDay.get(row._id) || 0,
        views: row.views
    }));
    const totals = rows.reduce(
        (sum, row) => ({
            visitors: sum.visitors + row.visitors,
            visits: sum.visits + row.visits,
            views: sum.views + row.views
        }),
        { visitors: 0, visits: 0, views: 0 }
    );

    console.log(`Visits since ${since} (${days} days)`);
    table(
        "Per day",
        [...rows, { day: "total*", ...totals }],
        [
            ["day", "day"],
            ["visitors", "visitors"],
            ["visits", "visits"],
            ["views", "views"]
        ]
    );
    console.log("  * visitors in the total row is the sum of daily visitors, not different people");
    const average = split.visits ? Math.round(split.durationMs / split.visits / 1000) : 0;
    const singleShare = split.visits ? Math.round((split.single / split.visits) * 100) : 0;
    console.log(`\nAverage visit: ${average} s; single-page visits: ${split.single} of ${split.visits} (${singleShare}%)`);

    const columns = label => [
        [label, "key"],
        ["visits", "count"]
    ];
    table("Landing pages", topOf(split.landing, limit), columns("page"));
    table("External referrers of visits", topOf(split.referrers, limit, "(direct or unknown)"), columns("referrer"));
    table("Devices of visits", topOf(split.devices, limit), columns("device"));
    table("Browser languages of visits", topOf(split.languages, limit), columns("language"));

    const pages = await visits
        .aggregate([
            { $match: inRange },
            { $group: { _id: "$path", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: limit }
        ])
        .toArray();
    table(
        "Most viewed pages",
        pages.map(row => ({ key: row._id, count: row.count })),
        [
            ["page", "key"],
            ["views", "count"]
        ]
    );
}).catch(err => {
    console.error(err);
    process.exitCode = 1;
});
