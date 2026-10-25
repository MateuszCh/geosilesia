// Step 13: the knowledge base lives on its section pages.
//
//   node scripts/cms/13-knowledge-base-sections.js [--apply --db=<database>]
//
// Every section page (a full `knowledge_base` row with one section) shows the whole base –
// the list of sections links to the other section pages – so it gets the header of the
// "baza-wiedzy" page: title, lead and photo (the section's name heads the list instead).
// That page itself is retired: shared/redirects.js sends it to the first section, and every
// link to it in the CMS (the menu, the home page preview, the rows' "Adres strony Bazy
// wiedzy") is pointed at the new address. The pages keep their own SEO title and description.
//
// Idempotent: headers that match and links already moved are left alone.

const { withDb, backup, bumpContentVersion, printReport, updatePageRows } = require("./lib");
const { REDIRECTS } = require("../../shared/redirects");
const seoMeta = require("../../shared/seo-meta");

const BASE_PAGE = "baza-wiedzy";
const HEADER_FIELDS = ["title", "lead", "image", "image_caption", "image_author", "author", "published", "updated"];

/** A string that is a link to a redirected address → the new address; anything else as it is. */
function moved(value) {
    if (typeof value !== "string" || !value.trim() || /^[a-z]+:|^\/\//i.test(value.trim())) return value;
    return REDIRECTS[seoMeta.normalizePath(value.trim())] || value;
}

/** Deep copy of `data` with every redirected link moved; `found` counts the moves. */
function withMovedLinks(data, found) {
    if (Array.isArray(data)) return data.map(item => withMovedLinks(item, found));
    if (data && typeof data === "object") {
        return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, withMovedLinks(value, found)]));
    }
    const next = moved(data);
    if (next !== data) found.push(`${data} → ${next}`);
    return next;
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const report = [];
    const pages = db.collection("pages");
    const posts = db.collection("posts");

    const base = await pages.findOne({ pageUrl: BASE_PAGE });
    const baseHero = base && base.rows.find(r => r && r.type === "page_hero");
    if (!baseHero) throw new Error(`no page_hero on "${BASE_PAGE}"`);

    const isSectionPage = page =>
        page.rows.some(r => r && r.type === "knowledge_base" && r.data.variant !== "zapowiedź" && r.data.section && r.data.section !== "wszystkie");

    const pageUpdates = [];
    for (const page of await pages.find({}).toArray()) {
        if (page.pageUrl === BASE_PAGE) continue;
        const notes = [];
        let rows = page.rows;

        // The base's header on every section page.
        if (isSectionPage(page)) {
            rows = rows.map(r => {
                if (!r || r.type !== "page_hero") return r;
                const header = Object.fromEntries(HEADER_FIELDS.map(key => [key, baseHero.data[key] ?? ""]));
                const changed = HEADER_FIELDS.filter(key => (r.data[key] ?? "") !== header[key]);
                if (!changed.length) return r;
                notes.push(`header: ${changed.map(key => `${key} "${r.data[key] || ""}" → "${header[key]}"`).join(", ")}`);
                return { ...r, data: { ...r.data, ...header } };
            });
        }

        // Links to retired addresses.
        const found = [];
        rows = rows.map(r => (r ? { ...r, data: withMovedLinks(r.data, found) } : r));
        if (found.length) notes.push(`links: ${found.join(", ")}`);

        if (notes.length) {
            pageUpdates.push({ _id: page._id, rows });
            report.push(`page   "${page.pageUrl}"`);
            notes.forEach(note => report.push(`         ${note}`));
        }
    }

    const postUpdates = [];
    for (const post of await posts.find({ type: { $nin: ["zasob", "marker"] } }).toArray()) {
        const found = [];
        const data = withMovedLinks(post.data, found);
        if (found.length) {
            postUpdates.push({ _id: post._id, data });
            report.push(`post   ${post.type} "${post.title}": ${found.join(", ")}`);
        }
    }

    if (!pageUpdates.length && !postUpdates.length) report.push("ok     section pages carry the base's header; no links to retired addresses");
    report.push(`note   "${BASE_PAGE}" stays in the CMS; the site redirects it (shared/redirects.js)`);

    printReport("Knowledge base sections", report, apply);
    if (!apply || (!pageUpdates.length && !postUpdates.length)) return;

    console.log(`backup: ${await backup(db, "knowledge-base-sections", ["pages", "posts"])}`);
    const now = Date.now();
    for (const update of pageUpdates) await updatePageRows(db, update._id, update.rows);
    for (const update of postUpdates) await posts.updateOne({ _id: update._id }, { $set: { data: update.data, updated: now } });
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
