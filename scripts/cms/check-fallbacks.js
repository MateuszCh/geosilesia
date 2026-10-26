// Read-only: lists pages and posts that still depend on a front-end fallback of variant C,
// i.e. data the migration scripts have not converted yet. Run after the scripts (on staging,
// later on production); an empty report means every page renders from its own fields.
//
//   node scripts/cms/check-fallbacks.js

const { withDb, parseByline } = require("./lib");

const KEEPS_OWN_HEADER = new Set(["homepage_banner", "map", "gallery"]);

withDb(async db => {
    const pages = await db.collection("pages").find({}).sort({ pageUrl: 1 }).toArray();
    const issues = [];

    for (const page of pages) {
        const rows = (page.rows || []).filter(r => r && r.type);
        const types = rows.map(r => r.type);
        if (!types.some(type => KEEPS_OWN_HEADER.has(type) || type === "page_hero")) {
            issues.push(`${page.pageUrl}: no page_hero – the header is taken from the content`);
        }
        rows.forEach(r => {
            if (r.type === "title_and_text" && (r.data.text || []).some(t => parseByline(t.paragraph))) {
                issues.push(`${page.pageUrl}: byline paragraph still in the text`);
            }
            if (r.type === "heading" && /\bfootnotes__heading\b/.test(r.data.class || "")) {
                issues.push(`${page.pageUrl}: warning heading not turned into a notice`);
            }
            if (r.type === "gallery") {
                const missing = ["category", "cover", "author", "updated"].filter(key => !r.data[key]);
                if (typeof r.data.hidden !== "boolean") missing.push("hidden");
                if ((r.data.paragraphs || []).some(p => p && parseByline(p.paragraph))) missing.push("byline paragraph");
                // Hidden albums are not listed anywhere, so nothing falls back for them.
                if (missing.length && r.data.hidden !== true) {
                    issues.push(`${page.pageUrl}: album without ${missing.join(", ")}`);
                }
            }
            if (r.type === "gallery_list" && r.data.mode !== "automatycznie" && r.data.mode !== "ręcznie") {
                issues.push(`${page.pageUrl}: gallery_list without a mode`);
            }
            if (r.type === "dictionary" && (r.data.items || []).some(item => !item.title_en && /\(ang\./i.test(item.title || ""))) {
                issues.push(`${page.pageUrl}: dictionary terms with "(ang. …)" in the title`);
            }
            if (r.type === "geosites_logos" && !r.data.title) issues.push(`${page.pageUrl}: databases without a heading`);
            if (r.type === "top50" && r.data.variant === "zapowiedź" && !r.data.eyebrow) {
                issues.push(`${page.pageUrl}: TOP 50 preview without an eyebrow`);
            }
            if (r.type === "timeline" && (r.data.items || []).some(item => item.highlight) && !(r.data.legend_highlight && r.data.legend_other)) {
                issues.push(`${page.pageUrl}: timeline without its legend`);
            }
        });
        // The TOP 50 route's page shows an eyebrow above its title.
        const heroAt = rows.findIndex(r => r.type === "page_hero");
        const afterHero = rows[heroAt + 1];
        if (heroAt >= 0 && !rows[heroAt].data.eyebrow && afterHero && afterHero.type === "top50" && afterHero.data.variant !== "zapowiedź" && afterHero.data.link) {
            issues.push(`${page.pageUrl}: TOP 50 page header without an eyebrow`);
        }
    }

    const icons = await db.collection("posts").find({ type: "icon" }).toArray();
    icons.filter(icon => !(icon.data && icon.data.color)).forEach(icon => issues.push(`icon "${icon.title}": no colour`));
    icons
        .filter(icon => !/\.svg$/i.test((icon.data && icon.data.icon) || ""))
        .forEach(icon => issues.push(`icon "${icon.title}": no SVG line icon in "icon"`));

    const nav = await db.collection("posts").findOne({ type: "navigation" });
    const data = (nav && nav.data) || {};
    ["cta_label", "cta_link", "footer_text", "albums_more_title"].filter(key => !data[key]).forEach(key => issues.push(`navigation: no ${key}`));
    (data.nav || []).filter(item => !item.link).forEach(item => issues.push(`navigation: section "${item.title}" has no link`));

    console.log(issues.length ? issues.join("\n") : "no fallbacks in use");
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
