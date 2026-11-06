// Step 7: the knowledge base as `zasob` posts, and its seven section pages.
//
//   node scripts/cms/07-knowledge-base.js [--apply --db=<database>]
//
// Each link in the paragraphs of a section page becomes a post: the link text is the title,
// the text before the link the publisher or series (`source`), the address `url` – or `file`
// for documents in /uploads ("Do pobrania", where the link only says "Pobierz plik PDF" and
// the title is the text before it). The order on the page is kept in `position`.
// Each section page then becomes: page header (name and byline) → knowledge base (that section).
// The posts take their dates from the section's byline, so "aktualizacja" next to a section
// keeps the date the editor last changed it, not the day of the migration. Posts created
// before this rule (never edited since) get the same dates.
//
// Idempotent: posts are created only while there are none of type `zasob`; a section page is
// rebuilt only while it has no knowledge_base row.

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

const SECTION_PAGES = {
    "do-posluchania": "Do posłuchania",
    "do-poczytania": "Do poczytania",
    "do-pobrania": "Do pobrania",
    "do-poogladania": "Do pooglądania",
    "animacje-prezentacje": "Animacje i prezentacje",
    "mapy-online": "Mapy online",
    "wirtualne-media": "Wirtualne media"
};

/** Link texts that only describe the action – the title is then the text before the link. */
const GENERIC_LINK = /^(pobierz|plik|pdf|link|tutaj|kliknij|zobacz)\b/i;

const clean = text =>
    String(text || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

/** Links of CMS HTML, which often leaves <a> unclosed: the text runs to the next tag. */
function parseParagraph(html) {
    const source = String(html || "");
    const firstLink = source.search(/<a\s/i);
    if (firstLink === -1) return [];
    const before = clean(source.slice(0, firstLink))
        .replace(/^\d+\s*[/.)]\s*/, "")
        .replace(/[\s.:–-]+$/, "")
        .trim();
    // A single closed link followed by text: the text completes the title
    // ("Interaktywny globus. Jak zmieniała się Ziemia…").
    const closed = /<\/a>([\s\S]*)$/i.exec(source);
    const after = (source.match(/<a\s/gi) || []).length === 1 && closed ? clean(closed[1]) : "";
    const resources = [];
    const pattern = /<a\s[^>]*?href=["']?([^"'\s>]+)[^>]*>([^<]*)/gi;
    let match;
    while ((match = pattern.exec(source))) {
        const href = match[1].trim();
        const text = clean(match[2]).replace(/[,\s]+$/, "");
        const generic = !text || GENERIC_LINK.test(text);
        const isFile = /^\/?uploads\//i.test(href);
        resources.push({
            title: generic ? before || text : [text, after].filter(Boolean).join(" "),
            source: generic ? "" : before,
            url: isFile ? "" : href,
            file: isFile ? (href.startsWith("/") ? href : `/${href}`) : ""
        });
    }
    return resources;
}

/**
 * `created`/`updated` in ms from a byline: "dd.mm.rrrr" strings, or – with `isoDates` – the
 * ISO dates a page_hero stores. Empty when there is no date.
 */
function bylineDates(byline, isoDates = false) {
    if (!byline) return {};
    const ms = value => {
        const iso = isoDates ? value : toCmsDate(value);
        const time = iso ? Date.parse(iso) : NaN;
        return Number.isNaN(time) ? undefined : time;
    };
    const updated = ms(byline.updated);
    if (!updated) return {};
    return { created: ms(byline.published) || updated, updated };
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const titles = await componentTitles(db);
    const pagesColl = db.collection("pages");
    const report = [];
    const pageWrites = [];
    const posts = [];
    const existing = await db.collection("posts").countDocuments({ type: "zasob" });

    for (const [pageUrl, section] of Object.entries(SECTION_PAGES)) {
        const page = await pagesColl.findOne({ pageUrl });
        if (!page) {
            report.push(`! no page "${pageUrl}"`);
            continue;
        }
        if (page.rows.some(r => r && r.type === "knowledge_base")) {
            report.push(`ok     ${pageUrl}: already a knowledge base section`);
            continue;
        }
        let byline;
        let position = 0;
        const skipped = [];
        page.rows
            .filter(r => r && r.type === "title_and_text")
            .forEach(r =>
                (r.data.text || []).forEach(t => {
                    const parsedByline = parseByline(t.paragraph);
                    if (parsedByline) {
                        byline = parsedByline;
                        return;
                    }
                    const found = [...parseParagraph(t.paragraph), ...(t.list || []).flatMap(item => parseParagraph(item.item))];
                    if (!found.length && clean(t.paragraph)) skipped.push(clean(t.paragraph));
                    found.forEach(resource =>
                        posts.push({
                            title: resource.title,
                            data: { section, source: resource.source, url: resource.url, file: resource.file, note: "", position: ++position }
                        })
                    );
                })
            );
        const dates = bylineDates(byline);
        posts.filter(post => post.data.section === section).forEach(post => Object.assign(post, dates));
        report.push(`${pageUrl}: ${position} resource(s) → section "${section}"`);
        skipped.forEach(text => report.push(`    ! paragraph without a link kept out: "${text.slice(0, 100)}"`));
        const rows = [
            row(
                "page_hero",
                {
                    title: section,
                    lead: "",
                    image: "",
                    image_caption: "",
                    image_author: "",
                    author: byline ? byline.author : "",
                    published: byline ? toCmsDate(byline.published) : "",
                    updated: byline ? toCmsDate(byline.updated) : ""
                },
                titles
            ),
            row("knowledge_base", { title: "", intro: "", variant: "pełna", section, link: "/baza-wiedzy" }, titles)
        ];
        report.push(`    ${describeRows(page.rows)} → ${describeRows(rows)}`);
        pageWrites.push(() => updatePageRows(db, page._id, rows));
    }

    // Posts created by an earlier run carry the migration day: give them the section's dates,
    // as long as nobody has edited them since (created === updated).
    const dateWrites = [];
    if (existing) {
        for (const [pageUrl, section] of Object.entries(SECTION_PAGES)) {
            const page = await pagesColl.findOne({ pageUrl });
            const hero = page && page.rows.find(r => r && r.type === "page_hero");
            const dates = hero ? bylineDates({ published: hero.data.published, updated: hero.data.updated }, true) : {};
            if (!dates.updated) continue;
            const stale = await db
                .collection("posts")
                .find({ type: "zasob", "data.section": section, $expr: { $eq: ["$created", "$updated"] }, updated: { $gt: dates.updated } })
                .toArray();
            if (!stale.length) continue;
            report.push(`${pageUrl}: ${stale.length} post(s) dated ${new Date(dates.updated).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" })} (section byline)`);
            dateWrites.push(() =>
                db.collection("posts").updateMany({ _id: { $in: stale.map(post => post._id) } }, { $set: dates })
            );
        }
    }

    if (existing) {
        report.push(`ok     ${existing} zasob post(s) exist – none created`);
    } else {
        report.push(`${posts.length} zasob post(s), e.g.:`);
        const bySection = {};
        posts.forEach(post => (bySection[post.data.section] = bySection[post.data.section] || []).push(post));
        Object.values(bySection).forEach(list =>
            list.slice(0, 3).forEach(post =>
                report.push(`    [${post.data.section}] ${post.data.source ? post.data.source + " · " : ""}${post.title} → ${post.data.url || post.data.file}`)
            )
        );
    }

    printReport("knowledge base", report, apply);
    if (apply && (pageWrites.length || dateWrites.length || (!existing && posts.length))) {
        console.log(`backup: ${await backup(db, "knowledge-base", ["pages", "posts", "post_types", "counters"])}`);
        if (!existing) await insertPosts(db, "zasob", posts);
        for (const write of [...pageWrites, ...dateWrites]) await write();
        await bumpContentVersion(db);
    }
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
