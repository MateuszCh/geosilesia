// Step 4: album fields and the automatic album list.
//
//   node scripts/cms/04-albums.js [--apply --db=<database>]
//
// For every page with a `gallery` row:
// - `category` and `cover` from its entry in the manual `gallery_list` (only when empty);
// - `author`, `published`, `updated` from the trailing byline paragraph, which is removed;
// - `hidden` for albums missing from the manual list (see OFF_LIST).
// The `gallery_list` row switches to `mode: automatycznie`; its manual entries stay as they
// are, so switching back to "ręcznie" restores the old list.

const {
    withDb,
    backup,
    bumpContentVersion,
    printReport,
    updatePageRows,
    toCmsDate,
    parseByline
} = require("./lib");

/**
 * Albums that are not on the manual list today. true = hidden from the album list (as now),
 * false = shown. The first three are empty.
 */
const OFF_LIST = {
    "galeria/dg": true,
    "galeria/pogorze-slaskie": true,
    "galeria/wyzyna-czestochowska-2": true,
    "galeria/hutnictwo szkla": true,
    "galeria/skalki-beskidu-slaskiego": true
};

const normalize = link =>
    decodeURIComponent(String(link || "").replace(/^https?:\/\/[^/]+/, ""))
        .replace(/^\/+|\/+$/g, "")
        .trim();

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const pages = db.collection("pages");
    const report = [];
    const writes = [];

    const listPages = await pages.find({ "rows.type": "gallery_list" }).toArray();
    const listed = new Map();
    listPages.forEach(page =>
        page.rows
            .filter(r => r && r.type === "gallery_list")
            .forEach(r => (r.data.galleries || []).forEach(entry => listed.set(normalize(entry.link), entry)))
    );

    const albums = await pages.find({ "rows.type": "gallery" }).sort({ pageUrl: 1 }).toArray();
    for (const page of albums) {
        const key = normalize(page.pageUrl);
        const entry = listed.get(key);
        const changes = [];
        const rows = page.rows.map(r => {
            if (!r || r.type !== "gallery") return r;
            const data = { ...r.data };
            if (!data.category && entry && entry.category) {
                data.category = entry.category;
                changes.push(`category "${entry.category}"`);
            }
            if (!data.cover && entry && entry.image) {
                data.cover = entry.image;
                changes.push(`cover ${entry.image}`);
            }
            if (typeof data.hidden !== "boolean") {
                const hidden = entry ? false : OFF_LIST[key] !== false;
                data.hidden = hidden;
                if (hidden) changes.push("hidden");
            }
            const paragraphs = data.paragraphs || [];
            const index = paragraphs.findIndex(p => p && parseByline(p.paragraph));
            if (index !== -1) {
                const byline = parseByline(paragraphs[index].paragraph);
                data.author = data.author || byline.author;
                data.published = data.published || toCmsDate(byline.published);
                data.updated = data.updated || toCmsDate(byline.updated);
                data.paragraphs = paragraphs.filter((_, i) => i !== index);
                changes.push(`byline → ${byline.author}, ${byline.published || "–"}, ${byline.updated}`);
            }
            return { ...r, data };
        });
        if (changes.length) {
            report.push(`${page.pageUrl}: ${changes.join("; ")}`);
            writes.push(() => updatePageRows(db, page._id, rows));
        }
    }

    for (const page of listPages) {
        if (page.rows.some(r => r && r.type === "gallery_list" && r.data.mode !== "automatycznie")) {
            const rows = page.rows.map(r =>
                r && r.type === "gallery_list" ? { ...r, data: { ...r.data, mode: "automatycznie", intro: r.data.intro || "" } } : r
            );
            report.push(`${page.pageUrl}: gallery_list mode → automatycznie`);
            writes.push(() => updatePageRows(db, page._id, rows));
        }
    }

    printReport("albums", report.length ? report : ["nothing to change"], apply);
    if (apply && writes.length) {
        console.log(`backup: ${await backup(db, "albums", ["pages"])}`);
        for (const write of writes) await write();
        await bumpContentVersion(db);
    }
    console.log(`\n${writes.length} page(s) ${apply ? "written" : "would change"}`);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
