// Step 29: TOP 50 can grow past fifty places under a heading of their own.
//
//   node scripts/cms/29-top50-new-places.js [--apply --db=<database>]
//
// - the `top50` component gets "Nagłówek nowych obiektów" (`new_title`, text) and "Nowe
//   obiekty od numeru" (`new_from`, number; empty = 51). The full list shows the places from
//   that number on after the heading, in a list of their own; without a heading the route
//   runs on as before. The home page preview is not affected;
// - the TOP 50 list gets the heading "oraz nowo utworzone obiekty geoturystyczne:". Until a
//   place 51 exists in "Atrakcje TOP 50" nothing changes on the page.
// `updated` of the page stays.
//
// Idempotent: a list with a heading already is left alone.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions } = require("./lib");
const { top50NewTitle, top50NewFrom } = require("./definitions");

const HEADING = "oraz nowo utworzone obiekty geoturystyczne:";

/** Every row of `rows` with the nested rows of its component fields, at any depth. */
function mapRows(rows, fn) {
    const visit = value => {
        if (Array.isArray(value)) return value.map(visit);
        if (value && typeof value === "object") {
            if (typeof value.type === "string" && value.data && typeof value.data === "object") return fn({ ...value, data: visit(value.data) });
            return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, visit(v)]));
        }
        return value;
    };
    return rows.map(visit);
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "top50-new-places", ["pages", "components"])}`);

    const definitions = await upsertDefinitions(db, "components", [{ type: "top50", title: "TOP 50", fields: [top50NewTitle, top50NewFrom] }], { apply });
    printReport("Components", definitions.report, apply);

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({}).sort({ pageUrl: 1 }).toArray()) {
        let changed = false;
        const rows = mapRows(page.rows || [], row => {
            if (row.type !== "top50" || row.data.variant === "zapowiedź") return row;
            if (row.data.new_title) {
                report.push(`ok     ${page.pageUrl}: TOP 50 list has the heading "${row.data.new_title}"`);
                return row;
            }
            changed = true;
            report.push(`update ${page.pageUrl}: TOP 50 list heading of new places -> "${HEADING}" (from 51)`);
            return { ...row, data: { ...row.data, new_title: HEADING, new_from: "" } };
        });
        if (changed) updates.push({ _id: page._id, rows });
    }
    if (!report.length) report.push("skip   no TOP 50 list");
    printReport("Pages", report, apply);

    if (!apply) return;
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: { rows: update.rows } });
    if (definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
