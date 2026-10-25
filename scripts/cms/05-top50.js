// Step 5: TOP 50 entries as posts, and the TOP 50 page built from them.
//
//   node scripts/cms/05-top50.js [--apply]
//
// The page's numbered paragraphs "N. Name (<a href=…>artykuł, <a href=…>www, …)" become
// `top50` posts: number, title, links (kind from the label, a numbered label kept as the
// editor's own) and – where the entry links to an album – the album cover as its photo.
// The page then becomes: page header (intro and byline) → TOP 50 list → closing note.
//
// Idempotent: posts are created only while there are none of type `top50`; the page is
// rebuilt only while it has no `top50` row.

const {
    withDb,
    backup,
    bumpContentVersion,
    printReport,
    componentTitles,
    row,
    insertPosts,
    updatePageRows,
    describeRows,
    toCmsDate,
    parseByline
} = require("./lib");

const TOP50_PAGE = "geosilesia-top-atrakcje-geoturystyczne";
const SITE_HOSTS = /^https?:\/\/(www\.)?geosilesia\.eu/i;
const KINDS = ["artykuł", "www", "galeria", "przewodnik", "YouTube"];

const stripTags = html => String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Anchors of CMS HTML, which often leaves them unclosed: text runs to the next tag. */
function anchors(html) {
    const result = [];
    const pattern = /<a\s[^>]*?href=["']([^"']+)["'][^>]*>([^<]*)/gi;
    let match;
    while ((match = pattern.exec(html))) {
        result.push({ href: match[1].trim(), text: match[2].replace(/[,)\s]+$/g, "").trim() });
    }
    return result;
}

function kindOf(label) {
    const lower = label.toLowerCase();
    return KINDS.find(kind => lower.startsWith(kind.toLowerCase())) || "inne";
}

/** "1. Name (<a…>www, …)" → { number, title, links } */
function parseEntry(html) {
    const text = String(html || "");
    const head = /^\s*(\d+)\.\s*/.exec(stripTags(text));
    if (!head) return undefined;
    const beforeLinks = text.split(/<a\s/i)[0];
    const title = stripTags(beforeLinks).replace(/^\d+\.\s*/, "").replace(/\s*\(\s*$/, "").trim();
    const links = anchors(text).map(anchor => {
        const kind = kindOf(anchor.text);
        // The front end numbers repeated kinds by itself ("www 1", "www 2"), so a label
        // that only says that is not stored.
        const automatic = new RegExp(`^${kind}(\\s*\\d+)?$`, "i").test(anchor.text);
        const url = anchor.href.replace(SITE_HOSTS, "") || anchor.href;
        return { kind, label: automatic ? "" : anchor.text, url };
    });
    return { number: Number(head[1]), title, links };
}

const albumPath = url => decodeURIComponent(url.replace(SITE_HOSTS, "")).replace(/^\/+|\/+$/g, "");

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const report = [];
    const pages = db.collection("pages");
    const page = await pages.findOne({ pageUrl: TOP50_PAGE });
    if (!page) throw new Error(`no page "${TOP50_PAGE}"`);
    const titles = await componentTitles(db);

    const existing = await db.collection("posts").countDocuments({ type: "top50" });
    const rebuilt = page.rows.some(r => r && r.type === "top50");

    const paragraphs = page.rows
        .filter(r => r && r.type === "title_and_text")
        .flatMap(r => (r.data.text || []).map(t => t.paragraph || ""));
    const entries = paragraphs.map(parseEntry).filter(Boolean);
    const others = paragraphs.filter(p => !parseEntry(p));
    const intro = others.find(p => /^TOP 50/i.test(stripTags(p)));
    const byline = others.map(parseByline).find(Boolean);
    const closing = others.filter(p => p !== intro && !parseByline(p));

    // Album covers for entries that link to an album.
    const albums = await pages.find({ "rows.type": "gallery" }, { projection: { pageUrl: 1, rows: 1 } }).toArray();
    const covers = new Map();
    const listPage = await pages.findOne({ "rows.type": "gallery_list" });
    ((listPage && listPage.rows.find(r => r.type === "gallery_list").data.galleries) || []).forEach(entry =>
        covers.set(albumPath(entry.link || ""), entry.image)
    );
    albums.forEach(album => {
        const gallery = album.rows.find(r => r && r.type === "gallery");
        if (gallery && gallery.data.cover) covers.set(albumPath(album.pageUrl), gallery.data.cover);
    });

    const posts = entries.map(entry => {
        const album = entry.links.find(link => link.kind === "galeria" && !/^https?:/i.test(link.url));
        const image = (album && covers.get(albumPath(album.url))) || "";
        return { title: entry.title, data: { number: entry.number, image, links: entry.links, description: "" } };
    });

    if (existing) {
        report.push(`ok     ${existing} top50 post(s) exist – none created`);
    } else {
        posts.forEach(post =>
            report.push(
                `post ${String(post.data.number).padStart(2)}. ${post.title} [${post.data.links
                    .map(link => link.label || link.kind)
                    .join(", ")}]${post.data.image ? ` photo ${post.data.image}` : ""}`
            )
        );
        const numbers = posts.map(post => post.data.number);
        const gaps = Array.from({ length: 50 }, (_, i) => i + 1).filter(n => !numbers.includes(n));
        report.push(`${posts.length} entries, ${posts.filter(p => p.data.image).length} with an album photo${gaps.length ? `, missing numbers: ${gaps.join(", ")}` : ""}`);
    }

    let rows;
    if (!rebuilt) {
        rows = [
            row(
                "page_hero",
                {
                    title: "TOP 50",
                    lead: intro ? `<p>${stripTags(intro).replace(/^TOP 50\s*[–-]\s*/i, "").replace(/:$/, ".").replace(/^./, c => c.toUpperCase())}</p>` : "",
                    image: "",
                    image_caption: "",
                    image_author: "",
                    author: byline ? byline.author : "",
                    published: byline ? toCmsDate(byline.published) : "",
                    updated: byline ? toCmsDate(byline.updated) : ""
                },
                titles
            ),
            // The map link waits until markers carry their TOP 50 numbers – the filter
            // would show nothing before that.
            row("top50", { title: "", intro: "", variant: "lista", limit: "", link: "", link_label: "Pokaż wszystkie 50 na mapie" }, titles)
        ];
        if (closing.length) {
            rows.push(row("title_and_text", { title: "", text: closing.map(paragraph => ({ paragraph, paragraph_class: "", list: [] })) }, titles));
        }
        report.push(`update page "${TOP50_PAGE}": ${describeRows(page.rows)} → ${describeRows(rows)}`);
        report.push(`  lead: ${stripTags(rows[0].data.lead)}`);
        report.push(`  byline: ${byline ? `${byline.author}, ${byline.published}, ${byline.updated}` : "none"}`);
    } else {
        report.push(`ok     page "${TOP50_PAGE}" already has a top50 row`);
    }

    printReport("TOP 50", report, apply);
    if (apply && (!existing || !rebuilt)) {
        console.log(`backup: ${await backup(db, "top50", ["pages", "posts", "post_types", "counters"])}`);
        if (!existing) await insertPosts(db, "top50", posts);
        if (!rebuilt) await updatePageRows(db, page._id, rows);
        await bumpContentVersion(db);
    }
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
