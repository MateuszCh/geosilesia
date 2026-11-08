// Visit statistics from the `visits` collection (written by visits.js). Read-only.
//
//   node scripts/stats.js [--days=30] [--top=10]
//
// Reads the database from config.json. Prints:
// - per day: entries (visits that started with a full page load), unique visitors and
//   in-app transitions (pages opened inside the app, without reloading);
// - landing pages, top external referrers, the device split and browser languages of entries;
// - the pages most often opened inside the app.
//
// Accuracy limits (see visits.js): one person on several devices counts several times, an
// IPv4 change during the day counts twice, identical devices behind one shared IP may merge
// into one. Unique visitors exist per day only: the salt rotates daily, so the "total" row
// is the sum of daily uniques, not the number of different people in the period.

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

function top(visits, match, field, limit) {
    return visits
        .aggregate([
            { $match: match },
            { $group: { _id: `$${field}`, count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: limit }
        ])
        .toArray()
        .then(rows => rows.map(row => ({ key: row._id ?? "(direct)", count: row.count })));
}

withDb(async db => {
    const days = numberArg("days", 30);
    const limit = numberArg("top", 10);
    const since = dayOf(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
    const visits = db.collection("visits");
    const inRange = { day: { $gte: since } };

    const perDay = await visits
        .aggregate([
            { $match: inRange },
            {
                $group: {
                    _id: "$day",
                    entries: { $sum: { $cond: [{ $and: [{ $eq: ["$source", "ssr"] }, "$entry"] }, 1, 0] } },
                    loads: { $sum: { $cond: [{ $eq: ["$source", "ssr"] }, 1, 0] } },
                    nav: { $sum: { $cond: [{ $eq: ["$source", "nav"] }, 1, 0] } },
                    visitors: { $addToSet: { $cond: [{ $eq: ["$source", "ssr"] }, "$visitor", null] } }
                }
            },
            { $project: { entries: 1, loads: 1, nav: 1, unique: { $size: { $setDifference: ["$visitors", [null]] } } } },
            { $sort: { _id: 1 } }
        ])
        .toArray();

    const totals = perDay.reduce(
        (sum, row) => ({
            entries: sum.entries + row.entries,
            unique: sum.unique + row.unique,
            loads: sum.loads + row.loads,
            nav: sum.nav + row.nav
        }),
        { entries: 0, unique: 0, loads: 0, nav: 0 }
    );

    console.log(`Visits since ${since} (${days} days)`);
    table(
        "Per day (entries and unique visitors from full page loads; transitions inside the app)",
        [...perDay.map(row => ({ day: row._id, ...row })), { day: "total*", ...totals }],
        [
            ["day", "day"],
            ["entries", "entries"],
            ["unique", "unique"],
            ["full loads", "loads"],
            ["in-app", "nav"]
        ]
    );
    console.log("  * unique in the total row is the sum of daily uniques, not different people");

    const entryMatch = { ...inRange, source: "ssr", entry: true };
    const columns = label => [
        [label, "key"],
        ["count", "count"]
    ];
    table("Landing pages", await top(visits, entryMatch, "path", limit), columns("page"));
    table("External referrers of entries", await top(visits, entryMatch, "referrer", limit), columns("referrer"));
    table("Devices of entries", await top(visits, entryMatch, "device", limit), columns("device"));
    table("Browser languages of entries", await top(visits, entryMatch, "lang", limit), columns("language"));
    table(
        "Pages opened inside the app",
        await top(visits, { ...inRange, source: "nav" }, "path", limit),
        columns("page")
    );
}).catch(err => {
    console.error(err);
    process.exitCode = 1;
});
