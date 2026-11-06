// Read-only inventory of the CMS database: component and post type definitions, the id
// counter, the content version, and how pages and posts actually use them. Never writes.
//
//   node scripts/cms/inventory.js            # human-readable summary
//   node scripts/cms/inventory.js --json     # full dump to tmp/cms-inventory.json

const fs = require("fs");
const path = require("path");
const { withDb, describeFields, ROOT } = require("./lib");

function countBy(items, key) {
    const counts = {};
    items.forEach(item => {
        const k = key(item);
        counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
}

// Union of data keys actually present in rows/posts, to compare with the definitions.
function keysOf(objects) {
    const keys = new Set();
    objects.forEach(o => Object.keys(o || {}).forEach(k => keys.add(k)));
    return [...keys].sort();
}

withDb(async db => {
    const [components, postTypes, counters, meta, pages, posts] = await Promise.all([
        db.collection("components").find({}).toArray(),
        db.collection("post_types").find({}).toArray(),
        db.collection("counters").find({}).toArray(),
        db.collection("meta").find({}).toArray(),
        db.collection("pages").find({}, { projection: { pageUrl: 1, title: 1, rows: 1, id: 1, updated: 1 } }).toArray(),
        db.collection("posts").find({}, { projection: { type: 1, id: 1, data: 1, title: 1 } }).toArray()
    ]);

    const rows = pages.flatMap(p => (p.rows || []).map(r => ({ page: p.pageUrl, row: r })));
    const rowsByType = countBy(rows, r => (r.row && r.row.type) || "(no type)");
    const pagesByRowType = {};
    rows.forEach(({ page, row }) => {
        const t = (row && row.type) || "(no type)";
        (pagesByRowType[t] = pagesByRowType[t] || new Set()).add(page);
    });
    const postsByType = countBy(posts, p => p.type);
    const albums = pages.filter(p => (p.rows || []).some(r => r && r.type === "gallery"));
    const allIds = [
        ...components.map(c => c.id),
        ...postTypes.map(t => t.id),
        ...pages.map(p => p.id),
        ...posts.map(p => p.id)
    ].filter(n => typeof n === "number");

    const inventory = {
        counters: counters.map(c => ({ counter: c.counter })),
        maxUsedId: Math.max(...allIds),
        contentVersion: (meta.find(m => m._id === "content") || {}).version,
        pages: { total: pages.length, albums: albums.length, others: pages.length - albums.length },
        rowsByType: Object.fromEntries(
            Object.entries(rowsByType).map(([t, n]) => [t, `${n} rows / ${pagesByRowType[t].size} pages`])
        ),
        postsByType,
        components: components
            .sort((a, b) => a.type.localeCompare(b.type))
            .map(c => ({
                type: c.type,
                title: c.title,
                id: c.id,
                fields: describeFields(c.fields),
                dataKeysInPages: keysOf(rows.filter(r => r.row && r.row.type === c.type).map(r => r.row.data))
            })),
        postTypes: postTypes
            .sort((a, b) => a.type.localeCompare(b.type))
            .map(t => ({
                type: t.type,
                title: t.title,
                pluralTitle: t.pluralTitle,
                id: t.id,
                postsRefs: (t.posts || []).length,
                postsInCollection: postsByType[t.type] || 0,
                fields: describeFields(t.fields),
                dataKeysInPosts: keysOf(posts.filter(p => p.type === t.type).map(p => p.data))
            })),
        rowTypesWithoutDefinition: Object.keys(rowsByType).filter(t => !components.some(c => c.type === t)),
        postTypesWithoutDefinition: Object.keys(postsByType).filter(t => !postTypes.some(pt => pt.type === t)),
        pageUrls: pages.map(p => p.pageUrl).sort()
    };

    if (process.argv.includes("--json")) {
        const out = path.join(ROOT, "tmp", "cms-inventory.json");
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(inventory, null, 2));
        console.log(`written ${path.relative(ROOT, out)}`);
    }

    const { pageUrls, ...summary } = inventory;
    console.log(JSON.stringify(summary, null, 2));
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
