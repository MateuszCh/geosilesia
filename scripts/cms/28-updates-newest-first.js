// Step 28: "Istotne aktualizacje" shows its entries newest first.
//
//   node scripts/cms/28-updates-newest-first.js [--apply --db=<database>]
//
// Frodo appends a new entry at the end of a list, so the order is not kept in the CMS: the
// front end sorts by the date each entry starts with ("2026-10-22 …").
// - the `title_and_text` component gets "Kolejność list" (`list_order`: empty = as in the
//   CMS, "od najnowszej daty");
// - the page's text is set to "od najnowszej daty";
// - its list is kept oldest first in the CMS, where new entries go at the end. An earlier
//   version of this step stored it newest first; a list in that order is reversed back.
// `updated` of the page stays.
//
// Idempotent: a page with the order set and its list oldest first is left alone. Stops if
// an entry has no date.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions } = require("./lib");
const { titleAndTextListOrder } = require("./definitions");

const PAGE_URL = "geosilesia-aktualizacje";
const ORDER = "od najnowszej daty";
const DATE = /^\s*(\d{4}-\d{2}-\d{2}) /;

const dateOf = entry => (DATE.exec(entry.item || "") || [])[1];
const ordered = (list, newer) => list.every((entry, i) => i === 0 || (newer ? dateOf(list[i - 1]) >= dateOf(entry) : dateOf(list[i - 1]) <= dateOf(entry)));

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "updates-newest-first", ["pages", "components"])}`);

    const definitions = await upsertDefinitions(db, "components", [{ type: "title_and_text", title: "Tytuł i tekst", fields: [titleAndTextListOrder] }], { apply });
    printReport("Components", definitions.report, apply);

    const pages = db.collection("pages");
    const page = await pages.findOne({ pageUrl: PAGE_URL });
    if (!page) throw new Error(`no page "${PAGE_URL}"`);

    const report = [];
    let changed = false;
    const rows = page.rows.map((row, r) => {
        if (row?.type !== "title_and_text") return row;
        let data = row.data;
        if (data.list_order !== ORDER) {
            changed = true;
            report.push(`update row ${r}: "Kolejność list" -> "${ORDER}"`);
            data = { ...data, list_order: ORDER };
        } else {
            report.push(`ok     row ${r}: "Kolejność list" is "${ORDER}"`);
        }
        const text = (data.text || []).map((block, b) => {
            const list = block.list;
            if (!Array.isArray(list) || list.length < 2) return block;
            const undated = list.find(entry => !dateOf(entry));
            if (undated) throw new Error(`row ${r}, list ${b}: an entry without a date: "${undated.item}"`);
            if (ordered(list, false)) {
                report.push(`ok     row ${r}, list ${b}: ${list.length} entries, oldest first in the CMS`);
                return block;
            }
            // Newest first (the earlier version of this step): reversing restores the order
            // the entries were added in. Anything else: by date, entries of one day as they are.
            const restored = ordered(list, true) ? [...list].reverse() : [...list].sort((a, c) => (dateOf(a) < dateOf(c) ? -1 : dateOf(a) > dateOf(c) ? 1 : 0));
            changed = true;
            report.push(`update row ${r}, list ${b}: ${list.length} entries oldest first in the CMS (${restored[0].item.slice(0, 10)} … ${restored[restored.length - 1].item.slice(0, 10)})`);
            return { ...block, list: restored };
        });
        return { ...row, data: { ...data, text } };
    });

    printReport(`Page ${PAGE_URL}`, report, apply);
    if (!apply) return;
    if (changed) await pages.updateOne({ _id: page._id }, { $set: { rows } });
    if (definitions.changed || changed) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
