// Step 19: the "Kolumny" component – columns of components (needs frodo with "component" fields).
//
//   node scripts/cms/19-columns.js [--apply --db=<database>]
//
// - defines the `columns` component: a repeater of columns, each a repeater of "component"
//   fields, whose values have the shape of a row;
// - the events preview followed by the knowledge base preview (news and knowledge_base,
//   both "zapowiedź") – which the front end used to set side by side by itself – become one
//   "Kolumny" row with a column for each, unchanged. That is the home page.
// `updated` of the pages stays: their content does not change, only where it is kept.
//
// Idempotent: a page without the pair is left alone.

const { withDb, backup, bumpContentVersion, printReport, componentTitles, row, upsertDefinitions } = require("./lib");
const { columnsComponent } = require("./definitions");

const isPreview = (r, type) => !!r && r.type === type && !!r.data && r.data.variant === "zapowiedź";

/** The rows with each events + knowledge base preview pair in one "Kolumny" row. */
function withColumns(rows, titles) {
    const result = [];
    for (let i = 0; i < rows.length; i++) {
        if (isPreview(rows[i], "news") && isPreview(rows[i + 1], "knowledge_base")) {
            const columns = [rows[i], rows[i + 1]].map(component => ({ components: [{ component }] }));
            result.push(row("columns", { columns }, titles));
            i++;
        } else {
            result.push(rows[i]);
        }
    }
    return result;
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "columns", ["pages", "components", "counters"])}`);

    const definitions = await upsertDefinitions(db, "components", [columnsComponent], { apply });
    printReport("Components", definitions.report, apply);

    const titles = { ...(await componentTitles(db)), columns: columnsComponent.title };
    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({ "rows.type": "knowledge_base" }).sort({ pageUrl: 1 }).toArray()) {
        const rows = withColumns(page.rows || [], titles);
        if (rows.length === (page.rows || []).length) continue;
        updates.push({ _id: page._id, rows });
        const describe = r => (r.type === "columns" ? `columns[${r.data.columns.map(c => c.components[0].component.type).join(" | ")}]` : r.type);
        report.push(`update ${page.pageUrl || "/"}: ${rows.filter(Boolean).map(describe).join(" → ")}`);
    }
    if (!updates.length) report.push("ok     no events + knowledge base preview pair left");
    printReport("Pages", report, apply);

    if (!apply) return;
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: { rows: update.rows } });
    if (definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
