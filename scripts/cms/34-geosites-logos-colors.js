// Step 34: the databases of "Loga geostanowisk" pick the colour of their marks.
//
//   node scripts/cms/34-geosites-logos-colors.js [--apply --db=<database>]
//
// - an entry of `logos` gets "Kolor znacznika" (a select of the trail colours); the front end
//   gave the entries red, blue and green in turn, now each entry gets the colour it showed;
// - the front end drops its fallback headings ("Sprawdź w bazach PIG-PIB / danych"); every
//   row has its heading since step 17, and the run stops if one does not.
// `updated` of the pages stays: they look the same.
//
// Idempotent: an entry with a colour is left alone.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions } = require("./lib");
const { geositesLogosColor } = require("./definitions");

const IN_TURN = ["czerwony", "niebieski", "zielony"];

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
    if (apply) console.log(`backup: ${await backup(db, "geosites-logos-colors", ["pages", "components"])}`);

    const definitions = await upsertDefinitions(db, "components", [geositesLogosColor], { apply });
    printReport("Components", definitions.report, apply);

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    const untitled = [];
    for (const page of await pages.find({}).sort({ pageUrl: 1 }).toArray()) {
        let changed = false;
        const visit = rows =>
            mapRows(rows, row => {
                if (row.type !== "geosites_logos") return row;
                if (!(row.data.title || "").trim()) untitled.push(page.pageUrl);
                // The front end counted only the entries with a link.
                let index = 0;
                const logos = (row.data.logos || []).map(entry => {
                    if (!entry || !entry.link) return entry;
                    const color = IN_TURN[index++ % IN_TURN.length];
                    if (entry.color) return entry;
                    changed = true;
                    report.push(`update ${page.pageUrl}: "${entry.name || entry.link}" color "${color}"`);
                    return { ...entry, color };
                });
                return { ...row, data: { ...row.data, logos } };
            });
        const rows = visit(page.rows || []);
        const typeData = page.typeData ? visit([page.typeData])[0] : page.typeData;
        if (changed) updates.push({ _id: page._id, set: page.typeData ? { rows, typeData } : { rows } });
    }
    if (untitled.length) throw new Error(`"Loga geostanowisk" without a heading:\n  ${untitled.join("\n  ")}`);
    if (!report.length) report.push("ok     every database has its colour");
    printReport("Pages", report, apply);

    if (!apply) return;
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: update.set });
    if (definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
