// Step 17: headings the front end used to hold, now in the CMS fields step 1 adds for them.
//
//   node scripts/cms/17-fixed-headings.js [--apply --db=<database>]
//
// Needs the fields of step 1 (run 01-definitions.js again first): geosites_logos "Nagłówek",
// page_hero and top50 "Nadtytuł", timeline legend, navigation "Nagłówek innych albumów na
// stronie albumu". Each gets the text the front end showed until now, so the pages look the
// same and editors can change the texts in the panel.
//
// Idempotent: a field that is already filled is left alone.

const { withDb, backup, bumpContentVersion, printReport, updatePageRows } = require("./lib");

const TOP50_EYEBROW = "Szlak czerwony";
const TOP50_PREVIEW_EYEBROW = "Szlak czerwony · TOP 50";
const DATABASES_TITLE = "Sprawdź w bazach PIG-PIB";
const LEGEND = { legend_highlight: "województwo śląskie", legend_other: "Polska" };
const ALBUMS_MORE_TITLE = "Inne albumy";

/** Fills the empty ones of `fields` in a row's data; `note` records each. */
function fill(row, fields, label, note) {
    const missing = Object.entries(fields).filter(([key]) => !row.data[key]);
    if (!missing.length) return row;
    missing.forEach(([key, value]) => note(`${label}: ${key} "${value}"`));
    return { ...row, data: { ...row.data, ...Object.fromEntries(missing) } };
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const report = [];
    const pageUpdates = [];

    for (const page of await db.collection("pages").find({}).sort({ pageUrl: 1 }).toArray()) {
        const notes = [];
        const note = text => notes.push(text);
        const rows = page.rows || [];
        const heroAt = rows.findIndex(r => r && r.type === "page_hero");
        const afterHero = heroAt >= 0 ? rows[heroAt + 1] : undefined;
        const routePage = afterHero && afterHero.type === "top50" && afterHero.data.variant !== "zapowiedź" && afterHero.data.link;

        const next = rows.map((r, i) => {
            if (!r || !r.type) return r;
            if (i === heroAt && routePage) return fill(r, { eyebrow: TOP50_EYEBROW }, "page header", note);
            if (r.type === "top50" && r.data.variant === "zapowiedź") return fill(r, { eyebrow: TOP50_PREVIEW_EYEBROW }, "TOP 50 preview", note);
            if (r.type === "geosites_logos") return fill(r, { title: DATABASES_TITLE }, "databases", note);
            if (r.type === "timeline" && (r.data.items || []).some(item => item.highlight)) return fill(r, LEGEND, "timeline legend", note);
            return r;
        });
        if (notes.length) {
            report.push(`update page "${page.pageUrl}"`);
            notes.forEach(text => report.push(`         ${text}`));
            pageUpdates.push({ _id: page._id, rows: next });
        }
    }

    const posts = db.collection("posts");
    const nav = await posts.findOne({ type: "navigation" });
    const navMissing = nav && !(nav.data || {}).albums_more_title;
    if (!nav) report.push("skip   no navigation post");
    else if (navMissing) report.push(`update navigation: albums_more_title "${ALBUMS_MORE_TITLE}"`);
    if (!pageUpdates.length && !navMissing) report.push("ok     every heading is in the CMS");

    printReport("Fixed headings", report, apply);
    if (!apply || (!pageUpdates.length && !navMissing)) return;
    console.log(`backup: ${await backup(db, "fixed-headings", ["pages", "posts"])}`);
    for (const update of pageUpdates) await updatePageRows(db, update._id, update.rows);
    if (navMissing) {
        await posts.updateOne({ _id: nav._id }, { $set: { "data.albums_more_title": ALBUMS_MORE_TITLE, updated: Date.now() } });
    }
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
