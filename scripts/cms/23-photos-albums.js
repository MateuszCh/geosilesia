// Step 23: "Zdjęcia" can show albums.
//
//   node scripts/cms/23-photos-albums.js [--apply --db=<database>]
//
// - "Źródło zdjęć" gets a third option, "albumy z galerii": the covers of the gallery's first
//   four albums, in the album list's order, each a link to its album (as "Inne albumy" on an
//   album page). It comes first and is what an empty field means; the label says so;
// - "Region w obiektywie" on the home page, which repeated the banner's first photos,
//   switches from "baner strony głównej" to it.
// `updated` of the page stays.
//
// Idempotent: the home page switches only in the run that adds the option, so a source an
// editor picks later stays.

const { withDb, backup, bumpContentVersion, printReport } = require("./lib");
const { PHOTO_SOURCES, photosSource } = require("./definitions");

const [ALBUMS, BANNER] = PHOTO_SOURCES;

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "photos-albums", ["pages", "components"])}`);

    const components = db.collection("components");
    const photos = await components.findOne({ type: "photos" });
    if (!photos) throw new Error("no photos component – run step 01 first");
    const source = (photos.fields || []).find(f => f.id === "source");
    if (!source) throw new Error("the photos component has no source field");
    const definitionChanged = source.selectOptions !== photosSource.selectOptions || source.title !== photosSource.title;
    const fields = photos.fields.map(f =>
        f.id === "source" ? { ...f, title: photosSource.title, selectOptions: photosSource.selectOptions } : f
    );
    printReport(
        "Components",
        definitionChanged
            ? [
                  `update components:photos\n      ~ source: "${source.title}" (${source.selectOptions}) -> "${photosSource.title}" (${photosSource.selectOptions})`
              ]
            : ["ok     components:photos (nothing to change)"],
        apply
    );

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    const home = await pages.findOne({ "rows.type": "homepage_banner" });
    const switches = r => r && r.type === "photos" && r.data && r.data.source === BANNER;
    if (definitionChanged && home && home.rows.some(switches)) {
        const rows = home.rows.map(r => (switches(r) ? { ...r, data: { ...r.data, source: ALBUMS } } : r));
        updates.push({ _id: home._id, rows });
        for (const r of home.rows.filter(switches)) {
            report.push(`update ${home.pageUrl || "/"}: photos "${r.data.title}" source "${BANNER}" -> "${ALBUMS}"`);
        }
    }
    if (!updates.length) report.push("ok     nothing to switch");
    printReport("Pages", report, apply);

    if (!apply) return;
    if (definitionChanged) await components.updateOne({ _id: photos._id }, { $set: { fields, updated: Date.now() } });
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: { rows: update.rows } });
    if (definitionChanged || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
