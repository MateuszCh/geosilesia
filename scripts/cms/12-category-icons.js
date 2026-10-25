// Step 12: the map categories' line icons as CMS files in the `icon` field.
//
//   node scripts/cms/12-category-icons.js [--apply --db=<database>]
//
// Variant C draws each map category with a line icon from the design system ("Ikony",
// data/category-icons). They go into the CMS the way an upload through the panel does:
// the file into `uploads/` and a record into `files` (catalogue "ikony"). Each `icon` post
// then points its `icon` field at its SVG instead of the old map's PNG, and the
// `marker_category_list` rows that use those PNGs follow. The `line_icon` field, added for
// this in step 1, is dropped from the post type – `icon` holds the icon now.
//
// Run it where the site's `uploads/` folder is (on the server: in the deployed checkout),
// since the files have to land there. Idempotent: present files and records are kept, a
// file of the same name with other content stops the script.

const fs = require("fs");
const path = require("path");
const { ROOT, withDb, backup, bumpContentVersion, printReport, reserveIds, updatePageRows } = require("./lib");

const ICONS_DIR = path.join(__dirname, "data/category-icons");
const UPLOADS = path.join(ROOT, "uploads");
const CATALOGUE = "ikony";

/** The category key of an `icon` post (what markers refer to) → its icon in data/category-icons. */
const ICON_BY_CATEGORY = {
    "geostanowiska projektowane": "kategoria-geologiczne.svg",
    "geostanowiska inne": "kategoria-geomorfologiczne.svg",
    "geostanowiska międzynarodowe": "kategoria-wodne.svg",
    "obiekty poprzemysłowe": "kategoria-poprzemyslowe.svg",
    "trasy podziemne": "kategoria-podziemne.svg",
    "uzdrowiska i obiekty lecznicze": "kategoria-uzdrowiska.svg",
    "muzea, ośrodki edukacyjne i dinoparki": "kategoria-muzea.svg",
    "ścieżki tematyczne": "kategoria-szlaki.svg",
    "punkty widokowe": "kategoria-widokowe.svg",
    "imprezy tematyczne": "kategoria-wydarzenia.svg"
};

const srcOf = filename => `/uploads/${filename}`;
/** "uploads/x.png" and "/uploads/x.png" name the same file. */
const fileKey = src => {
    const value = String(src || "").trim();
    return value && !value.startsWith("/") ? `/${value}` : value;
};

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    console.log(`uploads:  ${UPLOADS}`);
    const report = [];
    const files = db.collection("files");
    const posts = db.collection("posts");
    const now = Date.now();

    // 1. Files: on disk and in the library.
    const copies = [];
    const records = [];
    const icons = await posts.find({ type: "icon" }).toArray();
    for (const icon of icons) {
        const filename = ICON_BY_CATEGORY[String(icon.data?.category || "").trim().toLowerCase()];
        if (!filename) {
            report.push(`skip   category "${icon.data?.name}" (${icon.data?.category}): no icon in data/category-icons`);
            continue;
        }
        const source = fs.readFileSync(path.join(ICONS_DIR, filename));
        const target = path.join(UPLOADS, filename);
        if (fs.existsSync(target)) {
            if (!fs.readFileSync(target).equals(source)) throw new Error(`${target} exists with other content – not overwritten`);
        } else if (!copies.some(copy => copy.target === target)) {
            copies.push({ source, target });
        }
        if (!(await files.findOne({ src: srcOf(filename) })) && !records.some(record => record.src === srcOf(filename))) {
            records.push({
                catalogues: [CATALOGUE],
                filename,
                src: srcOf(filename),
                title: icon.data?.name || "",
                type: "image/svg+xml",
                size: source.length
            });
        }
    }
    copies.forEach(copy => report.push(`copy   ${path.basename(copy.target)} → uploads/`));
    records.forEach(record => report.push(`file   ${record.src} (catalogue "${CATALOGUE}", "${record.title}")`));
    if (!copies.length && !records.length) report.push("ok     every icon file is in uploads/ and in the library");

    // 2. The `icon` field of each category.
    const iconUpdates = [];
    const replaced = new Map(); // old icon → new icon
    icons.forEach(icon => {
        const filename = ICON_BY_CATEGORY[String(icon.data?.category || "").trim().toLowerCase()];
        if (!filename || icon.data?.icon === srcOf(filename)) return;
        if (icon.data?.icon) replaced.set(fileKey(icon.data.icon), srcOf(filename));
        iconUpdates.push({ _id: icon._id, icon: srcOf(filename) });
        report.push(`icon   ${icon.data?.name}: ${icon.data?.icon || "(none)"} → ${srcOf(filename)}`);
    });
    if (!iconUpdates.length) report.push("ok     every category points at its SVG icon");

    // 3. Category descriptions that use the old icons.
    const pages = await db.collection("pages").find({ "rows.type": "marker_category_list" }).toArray();
    const pageUpdates = [];
    pages.forEach(page => {
        let changed = 0;
        const rows = page.rows.map(r => {
            if (!r || r.type !== "marker_category_list") return r;
            const categories = (r.data.categories || []).map(entry => {
                const next = replaced.get(fileKey(entry.icon));
                if (!next) return entry;
                changed++;
                return { ...entry, icon: next };
            });
            return { ...r, data: { ...r.data, categories } };
        });
        if (changed) {
            pageUpdates.push({ _id: page._id, rows });
            report.push(`page   "${page.pageUrl}": ${changed} category description icon(s) → SVG`);
        }
    });

    // 4. `line_icon` leaves the post type.
    const postType = await db.collection("post_types").findOne({ type: "icon" });
    const dropLineIcon = !!(postType && (postType.fields || []).some(field => field.id === "line_icon"));
    const lineIconValues = await posts.countDocuments({ type: "icon", "data.line_icon": { $exists: true, $nin: ["", null] } });
    if (dropLineIcon && lineIconValues) throw new Error(`${lineIconValues} icon post(s) have a line_icon – move it to icon first`);
    report.push(dropLineIcon ? 'field  post type "icon": remove "line_icon" (Ikona liniowa)' : 'ok     post type "icon" has no "line_icon"');

    printReport("Category icons", report, apply);
    const work = copies.length || records.length || iconUpdates.length || pageUpdates.length || dropLineIcon;
    if (!apply || !work) return;

    console.log(`backup: ${await backup(db, "category-icons", ["files", "posts", "post_types", "pages", "counters"])}`);
    copies.forEach(copy => fs.writeFileSync(copy.target, copy.source));
    if (records.length) {
        const ids = await reserveIds(db, records.length, true);
        await files.insertMany(records.map((record, i) => ({ ...record, created: now, id: ids[i], updated: now, __v: 0 })));
    }
    for (const update of iconUpdates) {
        await posts.updateOne({ _id: update._id }, { $set: { "data.icon": update.icon, updated: now } });
    }
    for (const update of pageUpdates) await updatePageRows(db, update._id, update.rows);
    if (dropLineIcon) {
        await db.collection("post_types").updateOne(
            { _id: postType._id },
            { $set: { fields: postType.fields.filter(field => field.id !== "line_icon"), updated: now } }
        );
        await posts.updateMany({ type: "icon" }, { $unset: { "data.line_icon": "" } });
    }
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
