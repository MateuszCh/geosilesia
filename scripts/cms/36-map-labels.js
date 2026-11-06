// Step 36: the texts of the map's search that step 35 moved for the search card go into the
// CMS too.
//
//   node scripts/cms/36-map-labels.js [--apply --db=<database>]
//
// - "Mapa atrakcji" (`map`) gets the labels of the two mode buttons (the field's hidden label
//   too), the text the field shows once the visitor's position is found and the names screen
//   readers hear for the search panel and the mode switch;
// - every such row, nested ones too, gets the texts the front end showed until now, except
//   the name mode, renamed to "Nazwa miejsca" as on the search card.
// `updated` of the pages stays.
//
// Idempotent: a field that is already filled is left alone.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions } = require("./lib");
const { mapLabels } = require("./definitions");

const TEXTS = {
    mode_location: "Lokalizacja",
    mode_name: "Nazwa miejsca",
    locate_label: "Moja lokalizacja",
    form_label: "Wyszukiwanie atrakcji",
    modes_label: "Tryb wyszukiwania"
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
    if (apply) console.log(`backup: ${await backup(db, "map-labels", ["pages", "components"])}`);

    const definitions = await upsertDefinitions(
        db,
        "components",
        [{ type: "map", title: "Mapa atrakcji", fields: mapLabels }],
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
                if (row.type !== "map") return row;
                const missing = Object.entries(TEXTS).filter(([key]) => !(row.data[key] || "").trim());
                if (!missing.length) {
                    report.push(`ok     ${page.pageUrl}: map has its texts`);
                    return row;
                }
                changed = true;
                missing.forEach(([key, value]) => report.push(`update ${page.pageUrl}: map.${key} "${value}"`));
                return { ...row, data: { ...row.data, ...Object.fromEntries(missing) } };
            });
        const rows = visit(page.rows || []);
        const typeData = page.typeData ? visit([page.typeData])[0] : page.typeData;
        if (changed) updates.push({ _id: page._id, set: page.typeData ? { rows, typeData } : { rows } });
    }
    if (!report.length) report.push("skip   no map row");
    printReport("Pages", report, apply);

    if (!apply) return;
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: update.set });
    if (definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
