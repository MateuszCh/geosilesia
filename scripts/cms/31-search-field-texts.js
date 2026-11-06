// Step 31: the texts of the search field, which the front end held, go into the CMS.
//
//   node scripts/cms/31-search-field-texts.js [--apply --db=<database>]
//
// - "Wyszukiwarka atrakcji" (`map_search`) gets the placeholders of the field for both modes;
// - "Mapa atrakcji" (`map`) gets the same placeholders and the hints under the field: the name
//   mode, the location mode and the location mode before the map has loaded;
// - every such row, nested ones too, gets the texts the front end showed until now.
// `updated` of the pages stays.
//
// Idempotent: a field that is already filled is left alone.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions } = require("./lib");
const { mapSearchFieldTexts, mapFieldTexts } = require("./definitions");

const PLACEHOLDERS = {
    placeholder_location: "Skąd ruszasz? np. Zawiercie",
    placeholder_name: "Wpisz nazwę obiektu"
};
const TEXTS = {
    map_search: PLACEHOLDERS,
    map: {
        ...PLACEHOLDERS,
        hint_location: "Po zatwierdzeniu obiekty ułożą się od najbliższego.",
        hint_loading: "Wyszukiwanie miejsc zadziała po wczytaniu mapy.",
        hint_name: "Lista zawęża się podczas pisania. Polskie znaki są opcjonalne."
    }
};

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
    if (apply) console.log(`backup: ${await backup(db, "search-field-texts", ["pages", "components"])}`);

    const definitions = await upsertDefinitions(
        db,
        "components",
        [
            { type: "map_search", title: "Wyszukiwarka atrakcji", fields: mapSearchFieldTexts },
            { type: "map", title: "Mapa atrakcji", fields: mapFieldTexts }
        ],
        { apply }
    );
    printReport("Components", definitions.report, apply);

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({}).sort({ pageUrl: 1 }).toArray()) {
        let changed = false;
        const rows = mapRows(page.rows || [], row => {
            const texts = TEXTS[row.type];
            if (!texts) return row;
            const missing = Object.entries(texts).filter(([key]) => !row.data[key]);
            if (!missing.length) {
                report.push(`ok     ${page.pageUrl}: ${row.type} has its texts`);
                return row;
            }
            changed = true;
            missing.forEach(([key, value]) => report.push(`update ${page.pageUrl}: ${row.type}.${key} "${value}"`));
            return { ...row, data: { ...row.data, ...Object.fromEntries(missing) } };
        });
        if (changed) updates.push({ _id: page._id, rows });
    }
    if (!report.length) report.push("skip   no map or map search row");
    printReport("Pages", report, apply);

    if (!apply) return;
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: { rows: update.rows } });
    if (definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
