// Step 37: the year filter of the events list goes into the CMS.
//
//   node scripts/cms/37-news-year-filter.js [--apply --db=<database>]
//
// - "Wiadomości" (`news`) gets "Lata z osobnym przyciskiem" (a number: how many of the latest
//   years get a button of their own, the rest go under "Starsze"; empty = 2, as the front end
//   did until now; 0 = every year) and "Przycisk „Wszystkie”" (a checkbox: a first button
//   showing every event, which the list opens on);
// - every events list (variant "lista"), nested ones too, gets 0: a button for each year, as
//   the user chose on 2026-11-05. "Wszystkie" stays off. Previews are left alone.
// `updated` of the pages stays.
//
// Idempotent: a list whose "Lata z osobnym przyciskiem" is already filled is left alone.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions } = require("./lib");
const { newsYearFilter } = require("./definitions");

const YEAR_BUTTONS = "0";

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
    if (apply) console.log(`backup: ${await backup(db, "news-year-filter", ["pages", "components"])}`);

    const definitions = await upsertDefinitions(
        db,
        "components",
        [{ type: "news", title: "Wiadomości", fields: newsYearFilter }],
        { apply }
    );
    printReport("Components", definitions.report, apply);

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({}).sort({ pageUrl: 1 }).toArray()) {
        let changed = false;
        const visit = rows =>
            mapRows(rows, row => {
                if (row.type !== "news" || row.data.variant === "zapowiedź") return row;
                if (String(row.data.year_buttons ?? "").trim()) {
                    report.push(`ok     ${page.pageUrl || "/"}: news.year_buttons "${row.data.year_buttons}"`);
                    return row;
                }
                changed = true;
                report.push(`update ${page.pageUrl || "/"}: news.year_buttons "${YEAR_BUTTONS}" (każdy rok)`);
                return { ...row, data: { ...row.data, year_buttons: YEAR_BUTTONS } };
            });
        const rows = visit(page.rows || []);
        const typeData = page.typeData ? visit([page.typeData])[0] : page.typeData;
        if (changed) updates.push({ _id: page._id, set: page.typeData ? { rows, typeData } : { rows } });
    }
    if (!report.length) report.push("skip   no events list");
    printReport("Pages", report, apply);

    if (!apply) return;
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: update.set });
    if (definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
