// Step 32: album categories become posts (needs frodo with "post" fields).
//
//   node scripts/cms/32-album-category-posts.js [--apply --db=<database>]
//
// - a new post type `album_category` ("Kategoria albumu"): name, slug of the album list's
//   filter ("?kategoria=…"), colour and order; one post per category the front end held, with
//   the same name, slug and colour, so the gallery looks the same;
// - the "Kategoria" field of the "album" page type and of an entry of "Lista galerii" turns
//   from a select into a "post" field of `album_category`;
// - every album and every entry gets the post whose name is its old option.
// `updated` of the pages stays: they look the same.
//
// Idempotent: the posts are created once, a value that is already a post is left alone. A
// value that names no category stops the run, so nothing is lost.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions, insertPosts } = require("./lib");
const { albumCategoryPostType, albumCategoryField } = require("./definitions");

const CATEGORIES = [
    { name: "Dziedzictwo Ziemi", slug: "dziedzictwo-ziemi", color: "zielony", order: 1 },
    { name: "Dziedzictwo geokulturowe", slug: "dziedzictwo-geokulturowe", color: "niebieski", order: 2 },
    { name: "Inne", slug: "inne", color: "żółty", order: 3 }
];

const keyOf = value => String(value || "").trim().toLowerCase();

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

/** The "Kategoria" field as a "post" field, keeping the stored field's _id and title. */
function asPostField(existing) {
    const { selectOptions, ...rest } = existing;
    return { ...rest, type: "post", postType: albumCategoryField.postType };
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "album-category-posts", ["pages", "posts", "post_types", "components", "settings", "counters"])}`);

    // The post type and its posts.
    const definitions = await upsertDefinitions(db, "post_types", [albumCategoryPostType], { apply });
    printReport("Post types", definitions.report, apply);

    const posts = db.collection("posts");
    let categories = await posts.find({ type: "album_category" }).toArray();
    const postReport = [];
    if (categories.length) postReport.push(`ok     ${categories.length} album categories exist`);
    else {
        CATEGORIES.forEach(c => postReport.push(`create post "${c.name}" (${c.slug}, ${c.color}, ${c.order})`));
        categories = apply
            ? await insertPosts(db, "album_category", CATEGORIES.map(data => ({ title: data.name, data })))
            : CATEGORIES.map(data => ({ id: `new "${data.name}"`, data }));
    }
    printReport("Posts", postReport, apply);
    const idByName = new Map(categories.map(post => [keyOf(post.data.name), post.id]));

    // The field definitions.
    const settings = db.collection("settings");
    const settingsDoc = await settings.findOne({ _id: "settings" });
    const pageTypes = ((settingsDoc && settingsDoc.pageTypes) || []).map(t => ({ ...t }));
    const album = pageTypes.find(t => t.type === "album");
    if (!album) throw new Error('no page type "album" – run step 18 first');
    const albumField = album.fields.find(f => f.id === "category");
    const albumTypeChanged = !albumField || albumField.type !== "post";
    if (albumTypeChanged) {
        album.fields = albumField
            ? album.fields.map(f => (f === albumField ? asPostField(f) : f))
            : [albumCategoryField, ...album.fields];
    }

    const components = db.collection("components");
    const list = await components.findOne({ type: "gallery_list" });
    const entries = list && (list.fields || []).find(f => f.id === "galleries");
    const entryField = entries && entries.repeaterFields.find(f => f.id === "category");
    const listChanged = !!entryField && entryField.type !== "post";
    const listFields = listChanged
        ? list.fields.map(f => (f === entries ? { ...f, repeaterFields: f.repeaterFields.map(r => (r === entryField ? asPostField(r) : r)) } : f))
        : undefined;
    printReport(
        "Fields",
        [
            albumTypeChanged ? 'update page type "album": category select -> post(album_category)' : 'ok     page type "album": category is a post field',
            listChanged ? "update components:gallery_list: galleries.category select -> post(album_category)" : "ok     components:gallery_list: nothing to change"
        ],
        apply
    );

    // The values.
    const unknown = [];
    const refs = (value, where, notes) => {
        if (value && typeof value === "object") return value;
        if (!keyOf(value)) return value === undefined ? undefined : null;
        const id = idByName.get(keyOf(value));
        if (id === undefined) {
            unknown.push(`${where}: "${value}"`);
            return value;
        }
        notes.push(`${where} "${value}" -> ${id}`);
        return { ids: [id] };
    };

    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({}).sort({ pageUrl: 1 }).toArray()) {
        const notes = [];
        const set = {};
        if (page.type === "album" && page.typeData && typeof page.typeData.category === "string") {
            set.typeData = { ...page.typeData, category: refs(page.typeData.category, "album", notes) };
        }
        let rowsChanged = false;
        const rows = mapRows(page.rows || [], row => {
            if (row.type === "gallery" && typeof row.data.category === "string") {
                rowsChanged = true;
                return { ...row, data: { ...row.data, category: refs(row.data.category, "gallery row", notes) } };
            }
            if (row.type !== "gallery_list" || !Array.isArray(row.data.galleries)) return row;
            const galleries = row.data.galleries.map((entry, i) => {
                if (!entry || typeof entry.category !== "string") return entry;
                rowsChanged = true;
                return { ...entry, category: refs(entry.category, `list entry ${i + 1}`, notes) };
            });
            return { ...row, data: { ...row.data, galleries } };
        });
        if (rowsChanged) set.rows = rows;
        if (!Object.keys(set).length) continue;
        updates.push({ _id: page._id, set });
        report.push(`update ${page.pageUrl}\n      ${notes.join("\n      ") || "empty categories -> none"}`);
    }
    if (unknown.length) throw new Error(`categories that name no album category:\n  ${unknown.join("\n  ")}`);
    if (!updates.length) report.push("ok     every album picks a category post");
    printReport("Pages", report, apply);

    if (!apply) return;
    if (albumTypeChanged) await settings.updateOne({ _id: "settings" }, { $set: { pageTypes } });
    if (listChanged) await components.updateOne({ _id: list._id }, { $set: { fields: listFields, updated: Date.now() } });
    for (const update of updates) await pages.updateOne({ _id: update._id }, { $set: update.set });
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
