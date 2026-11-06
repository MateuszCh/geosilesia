// Step 22: the size of the home page banner's title.
//
//   node scripts/cms/22-banner-title-size.js [--apply --db=<database>]
//
// - "Homepage banner" gets "Rozmiar tytułu" right under "Title": duży, średni or mały, each
//   with its desktop size in brackets; empty = duży, the size until now. The forest panel
//   narrows with the title, so a smaller one hides less of the photo;
// - the home page's banner is set to "mały".
// `updated` of the page stays.
//
// Idempotent: a banner with a size set keeps it.

const { withDb, backup, bumpContentVersion, printReport, mergeFields, describeFields } = require("./lib");
const { BANNER_TITLE_SIZES, bannerTitleSize } = require("./definitions");

const SMALL = BANNER_TITLE_SIZES[2];

/** The fields with `id` moved right after `after`. */
function placedAfter(fields, id, after) {
    const moved = fields.find(f => f.id === id);
    const rest = fields.filter(f => f.id !== id);
    const index = rest.findIndex(f => f.id === after);
    return moved && index >= 0 ? [...rest.slice(0, index + 1), moved, ...rest.slice(index + 1)] : fields;
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "banner-title-size", ["pages", "components"])}`);

    const components = db.collection("components");
    const banner = await components.findOne({ type: "homepage_banner" });
    if (!banner) throw new Error("no homepage_banner component");
    const merged = mergeFields(banner.fields, bannerTitleSize.fields);
    const fields = placedAfter(merged.fields, "title_size", "title");
    const definitionChanged = fields.some((f, i) => f.id !== (banner.fields[i] || {}).id);
    printReport(
        "Components",
        definitionChanged || merged.changes.length
            ? [`update components:homepage_banner\n      ${[...merged.changes, `order: ${describeFields(fields).map(d => d.split(/[:[]/)[0]).join(", ")}`].join("\n      ")}`]
            : ["ok     components:homepage_banner (nothing to add)"],
        apply
    );

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({ "rows.type": "homepage_banner" }).sort({ pageUrl: 1 }).toArray()) {
        if (!page.rows.some(r => r && r.type === "homepage_banner" && !r.data?.title_size)) continue;
        const rows = page.rows.map(r =>
            r && r.type === "homepage_banner" && !r.data?.title_size ? { ...r, data: { ...r.data, title_size: SMALL } } : r
        );
        updates.push({ _id: page._id, rows });
        report.push(`update ${page.pageUrl || "/"}: homepage_banner title_size = "${SMALL}"`);
    }
    if (!updates.length) report.push("ok     every banner has its title size");
    printReport("Pages", report, apply);

    if (!apply) return;
    if (definitionChanged) await components.updateOne({ _id: banner._id }, { $set: { fields, updated: Date.now() } });
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: { rows: update.rows } });
    if (definitionChanged || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
