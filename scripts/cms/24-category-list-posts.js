// Step 24: "Lista kategorii" picks its categories (needs frodo with "post" fields).
//
//   node scripts/cms/24-category-list-posts.js [--apply --db=<database>]
//
// - an entry of the `marker_category_list` component ("Kategorie") gets a "post" field
//   `category` ("Kategoria", posts of `icon`) in place of its icon file `icon`: the front end
//   used to find the category by that file, now it takes the icon and the colour from the post;
// - every entry gets the icon post whose `icon` is the entry's file, and loses the file.
// `updated` of the pages stays: they look the same.
//
// Idempotent: an entry that already has a category is left alone. An entry whose file is no
// category's icon stops the run, so nothing is lost.

const { withDb, backup, bumpContentVersion, printReport } = require("./lib");
const { categoryListCategory } = require("./definitions");

/** "uploads/x.svg" and "/uploads/x.svg" name the same file. */
const fileKey = src => {
    const path = String(src || "").trim();
    return path && !path.startsWith("/") ? `/${path}` : path;
};

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "category-list-posts", ["pages", "components"])}`);

    const components = db.collection("components");
    const list = await components.findOne({ type: "marker_category_list" });
    if (!list) throw new Error("no marker_category_list component");
    const entries = (list.fields || []).find(f => f.id === "categories");
    if (!entries || entries.type !== "repeater") throw new Error("marker_category_list has no categories repeater");
    const repeaterFields = [
        categoryListCategory,
        ...entries.repeaterFields.filter(f => f.id !== "icon" && f.id !== categoryListCategory.id)
    ];
    const definitionChanged =
        !entries.repeaterFields.some(f => f.id === categoryListCategory.id) || entries.repeaterFields.some(f => f.id === "icon");
    const fields = list.fields.map(f => (f.id === "categories" ? { ...f, repeaterFields } : f));
    printReport(
        "Components",
        definitionChanged
            ? [`update components:marker_category_list\n      + categories.category:post(icon)\n      - categories.icon:file`]
            : ["ok     components:marker_category_list (nothing to change)"],
        apply
    );

    const icons = await db.collection("posts").find({ type: "icon" }).toArray();
    const iconByFile = new Map(icons.filter(icon => icon.data?.icon).map(icon => [fileKey(icon.data.icon), icon]));

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    const unmatched = [];
    for (const page of await pages.find({ "rows.type": "marker_category_list" }).sort({ pageUrl: 1 }).toArray()) {
        let changed = false;
        const rows = page.rows.map(row => {
            if (row?.type !== "marker_category_list") return row;
            const categories = (row.data?.categories || []).map((entry, i) => {
                if (!entry || entry.category?.ids?.length) return entry;
                const { icon: file, ...rest } = entry;
                const icon = iconByFile.get(fileKey(file));
                if (!icon) {
                    if (file) unmatched.push(`${page.pageUrl} entry ${i + 1}: ${file}`);
                    return entry;
                }
                changed = true;
                report.push(`update ${page.pageUrl}: entry ${i + 1} ${file} -> icon post ${icon.id} "${icon.data.name}"`);
                return { category: { ids: [icon.id] }, ...rest };
            });
            return { ...row, data: { ...row.data, categories } };
        });
        if (changed) updates.push({ _id: page._id, rows });
    }
    if (unmatched.length) throw new Error(`entries whose icon file is no category's icon:\n  ${unmatched.join("\n  ")}`);
    if (!updates.length) report.push("ok     every entry has its category");
    printReport("Pages", report, apply);

    if (!apply) return;
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: { rows: update.rows } });
    if (definitionChanged) await components.updateOne({ _id: list._id }, { $set: { fields, updated: Date.now() } });
    if (definitionChanged || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
