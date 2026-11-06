// Step 33: what the front end knew about TOP 50 goes into the CMS.
//
//   node scripts/cms/33-top50-settings.js [--apply --db=<database>]
//
// - a new post type `top50_settings` ("Ustawienia TOP 50") with one post: the route's page
//   (the front end found it by the menu section titled "TOP 50"), the label of a place on the
//   map ("TOP 50 nr {nr}") and on an album page ("TOP 50 · nr {nr}");
// - the `top50` component gets "Napis przycisku dalszych miejsc" ("Dalej: miejsca {od}–{do}");
//   every full list gets that text;
// - "Nowe obiekty od numeru" loses its default of 51: a list with a heading of new places and
//   no number gets 51, and the field's label says that empty means no group.
// The texts of the home page preview are all filled since step 17, so the front end drops its
// fallbacks without a change here. `updated` of the pages stays.
//
// Idempotent: the post is created once, filled fields are left alone.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions, insertPosts } = require("./lib");
const { top50SettingsPostType, top50MoreLabel, top50NewFromTitle } = require("./definitions");

const MORE_LABEL = "Dalej: miejsca {od}–{do}";
const NEW_FROM = 51;

/** The TOP 50 section of the menu, as the front end found it. */
function routeLink(nav) {
    const item = (nav || []).find(entry => /top\s*50/i.test(entry.title || ""));
    if (!item) return "";
    return item.link || ((item.subnav || []).find(sub => sub.link) || {}).link || "";
}

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
    if (apply) console.log(`backup: ${await backup(db, "top50-settings", ["pages", "posts", "post_types", "components", "counters"])}`);

    // The settings post.
    const types = await upsertDefinitions(db, "post_types", [top50SettingsPostType], { apply });
    printReport("Post types", types.report, apply);
    const posts = db.collection("posts");
    const existing = await posts.findOne({ type: "top50_settings" });
    const navigation = await posts.findOne({ type: "navigation" });
    const data = {
        route_link: routeLink(navigation && navigation.data && navigation.data.nav),
        place_label: "TOP 50 nr {nr}",
        album_label: "TOP 50 · nr {nr}"
    };
    if (!existing && !data.route_link) throw new Error('no menu section titled "TOP 50" – the route\'s page is unknown');
    printReport(
        "Posts",
        existing ? ["ok     the TOP 50 settings post exists"] : [`create post "Ustawienia TOP 50"`, ...Object.entries(data).map(([k, v]) => `         ${k}: "${v}"`)],
        apply
    );

    // The component.
    const components = db.collection("components");
    const definitions = await upsertDefinitions(db, "components", [{ type: "top50", title: "TOP 50", fields: [top50MoreLabel] }], { apply });
    const top50 = await components.findOne({ type: "top50" });
    const newFrom = top50 && top50.fields.find(f => f.id === "new_from");
    const retitle = !!newFrom && newFrom.title !== top50NewFromTitle;
    printReport("Components", [...definitions.report, retitle ? `update top50.new_from title -> "${top50NewFromTitle}"` : "ok     top50.new_from title"], apply);

    // The rows.
    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({}).sort({ pageUrl: 1 }).toArray()) {
        let changed = false;
        const rows = mapRows(page.rows || [], row => {
            if (row.type !== "top50" || row.data.variant === "zapowiedź") return row;
            const set = {};
            if (!row.data.more_label) set.more_label = MORE_LABEL;
            if (row.data.new_title && !row.data.new_from) set.new_from = NEW_FROM;
            if (!Object.keys(set).length) {
                report.push(`ok     ${page.pageUrl}: TOP 50 list has its texts`);
                return row;
            }
            changed = true;
            Object.entries(set).forEach(([k, v]) => report.push(`update ${page.pageUrl}: TOP 50 list ${k} "${v}"`));
            return { ...row, data: { ...row.data, ...set } };
        });
        if (changed) updates.push({ _id: page._id, rows });
    }
    if (!report.length) report.push("skip   no TOP 50 list");
    printReport("Pages", report, apply);

    if (!apply) return;
    if (!existing) await insertPosts(db, "top50_settings", [{ title: "Ustawienia TOP 50", data }]);
    if (retitle) {
        const fields = (await components.findOne({ type: "top50" })).fields.map(f => (f.id === "new_from" ? { ...f, title: top50NewFromTitle } : f));
        await components.updateOne({ type: "top50" }, { $set: { fields, updated: Date.now() } });
    }
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: { rows: update.rows } });
    if (!existing || types.changed || definitions.changed || retitle || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
