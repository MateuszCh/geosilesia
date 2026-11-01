// Step 28: "Istotne aktualizacje" lists its entries newest first.
//
//   node scripts/cms/28-updates-newest-first.js [--apply --db=<database>]
//
// Every entry of the page's list starts with its date ("2026-10-22 …"); the list ran from the
// oldest. It is sorted by that date, newest first; entries of one day keep the reverse of
// their order, so the one added last comes first. New entries then go at the top in the CMS.
// `updated` of the page stays.
//
// Idempotent: a list already newest first is left alone. Stops if an entry has no date.

const { withDb, backup, bumpContentVersion, printReport } = require("./lib");

const PAGE_URL = "geosilesia-aktualizacje";
const DATE = /^(\d{4}-\d{2}-\d{2}) /;

const dateOf = entry => (DATE.exec(entry.item || "") || [])[1];

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const pages = db.collection("pages");
    const report = [];

    const page = await pages.findOne({ pageUrl: PAGE_URL });
    if (!page) throw new Error(`no page "${PAGE_URL}"`);

    let changed = false;
    const rows = page.rows.map((row, r) => {
        if (row?.type !== "title_and_text") return row;
        const text = (row.data.text || []).map((block, b) => {
            if (!Array.isArray(block.list) || !block.list.length) return block;
            const undated = block.list.find(entry => !dateOf(entry));
            if (undated) throw new Error(`row ${r}, list ${b}: an entry without a date: "${undated.item}"`);
            const newestFirst = block.list.every((entry, i) => i === 0 || dateOf(block.list[i - 1]) >= dateOf(entry));
            if (newestFirst) {
                report.push(`ok     row ${r}, list ${b}: ${block.list.length} entries, already newest first`);
                return block;
            }
            const list = [...block.list].reverse().sort((a, c) => (dateOf(a) < dateOf(c) ? 1 : dateOf(a) > dateOf(c) ? -1 : 0));
            changed = true;
            report.push(`update row ${r}, list ${b}: ${list.length} entries newest first`);
            report.push(`         first: ${list[0].item}`);
            report.push(`         last:  ${list[list.length - 1].item}`);
            return { ...block, list };
        });
        return { ...row, data: { ...row.data, text } };
    });

    printReport(`Page ${PAGE_URL}`, report, apply);
    if (!apply || !changed) return;

    console.log(`backup: ${await backup(db, "updates-newest-first", ["pages"])}`);
    await pages.updateOne({ _id: page._id }, { $set: { rows } });
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
