// Step 26: the previews of TOP 50 and events take posts chosen in the CMS (needs frodo with
// "post" fields).
//
//   node scripts/cms/26-preview-picks.js [--apply --db=<database>]
//
// - the `top50` component gets a "post" field `featured` ("Wyróżniona atrakcja", a `top50`
//   post): the place the preview shows beside the list until the pointer picks another; empty =
//   the first place with a photo, as before;
// - the `news` component gets a "post" field `picked` ("Wybrane wydarzenia w zapowiedzi",
//   `wydarzenie` posts): the events of the preview, in the chosen order; empty = the latest;
// - the TOP 50 preview of the home page gets the place it shows today, so the choice is
//   visible in the panel. The events preview stays empty: it keeps showing the latest.
// `updated` of the page stays.
//
// Idempotent: a preview with a featured place already is left alone.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions } = require("./lib");
const { top50Featured, newsPicked } = require("./definitions");

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
    if (apply) console.log(`backup: ${await backup(db, "preview-picks", ["pages", "components"])}`);

    const definitions = await upsertDefinitions(
        db,
        "components",
        [
            { type: "top50", title: "TOP 50", fields: [top50Featured] },
            { type: "news", title: "Wiadomości", fields: [newsPicked] }
        ],
        { apply }
    );
    printReport("Components", definitions.report, apply);

    // What the preview shows today: the first place, by number, with a photo.
    const places = await db.collection("posts").find({ type: "top50" }).sort({ "data.number": 1 }).toArray();
    const shown = places.find(place => place.data?.image) || places[0];

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({}).sort({ pageUrl: 1 }).toArray()) {
        let changed = false;
        const rows = mapRows(page.rows || [], row => {
            if (row.type !== "top50" || row.data.variant !== "zapowiedź" || row.data.featured?.ids?.length || !shown) return row;
            changed = true;
            report.push(`update ${page.pageUrl || "/"}: TOP 50 preview featured -> ${shown.id} "${shown.data.number}. ${shown.title}"`);
            return { ...row, data: { ...row.data, featured: { ids: [shown.id] } } };
        });
        if (changed) updates.push({ _id: page._id, rows });
    }
    if (!updates.length) report.push("ok     every TOP 50 preview has its place");
    printReport("Pages", report, apply);

    if (!apply) return;
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: { rows: update.rows } });
    if (definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
