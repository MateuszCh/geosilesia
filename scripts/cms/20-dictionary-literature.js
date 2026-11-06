// Step 20: the dictionary holds the component under its terms (needs frodo with "component" fields).
//
//   node scripts/cms/20-dictionary-literature.js [--apply --db=<database>]
//
// - the `dictionary` component ("Lista pojęć") gets a "component" field `below` ("Pod listą
//   pojęć"), drawn under the terms in their column;
// - a literature row right after a dictionary row – which the front end used to move under
//   the terms by itself – goes into that field, unchanged. That is "Słowa kluczowe".
// `updated` of the pages stays: their content does not change, only where it is kept.
//
// Idempotent: a dictionary that already holds a component, or has no literature after it,
// is left alone.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions } = require("./lib");
const { dictionaryComponent } = require("./definitions");

/** The rows with each literature row that follows a dictionary moved into the dictionary. */
function withLiteratureBelow(rows) {
    const result = [];
    for (let i = 0; i < rows.length; i++) {
        const current = rows[i];
        const next = rows[i + 1];
        if (current?.type === "dictionary" && !current.data?.below?.type && next?.type === "literature") {
            result.push({ ...current, data: { ...current.data, below: next } });
            i++;
        } else {
            result.push(current);
        }
    }
    return result;
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "dictionary-literature", ["pages", "components"])}`);

    const definitions = await upsertDefinitions(db, "components", [dictionaryComponent], { apply });
    printReport("Components", definitions.report, apply);

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({ "rows.type": "dictionary" }).sort({ pageUrl: 1 }).toArray()) {
        const rows = withLiteratureBelow(page.rows || []);
        if (rows.length === (page.rows || []).length) continue;
        updates.push({ _id: page._id, rows });
        const describe = r => (r?.type === "dictionary" && r.data?.below ? `dictionary[below: ${r.data.below.type}]` : r?.type);
        report.push(`update ${page.pageUrl}: ${(page.rows || []).map(r => r?.type).join(" → ")}  ⇒  ${rows.map(describe).join(" → ")}`);
    }
    if (!updates.length) report.push("ok     no literature right after a dictionary left");
    printReport("Pages", report, apply);

    if (!apply) return;
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: { rows: update.rows } });
    if (definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
