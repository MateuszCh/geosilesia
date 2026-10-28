// Step 18: page types – "Strona treści" and "Album" (needs frodo with page types).
//
//   node scripts/cms/18-page-types.js [--apply --db=<database>]
//
// frodo keeps page types in its settings document ({ _id: "settings", pageTypes }); a page
// stores the key in `type` and the values of the type's fields in `typeData`. This step:
// - defines the two page types of definitions.js (`pageTypes`); an existing one only gains
//   the fields it lacks;
// - content pages (no home banner, map or gallery) become "tresc": their page_hero row moves
//   into the values, and so do the rows the front end put beside the text by their kind –
//   link cards "lista boczna", the geosite databases, a quote standing alone and the
//   "A ponadto" items of a numbered list, which become a list of their own – into
//   "Kolumna boczna", in the order they stood;
// - albums (pages with a gallery row) become "album": the category, cover, author, dates
//   and "hidden" flag of the gallery row move into the values;
// - the page_hero component and the album fields of the gallery component go, once no page
//   uses them.
// `updated` of the pages stays: their content does not change, only where it is kept.
//
// A page the front end still needs its older rules for (no page_hero, a byline paragraph, a
// warning made of a heading, two galleries) keeps no type and is listed.
//
// The dry run checks the result: it lays out every changed page with the front end's own
// layoutPage (front/src/app/core/page-layout.ts, bundled with esbuild from front/node_modules)
// and derives its SEO title and description (shared/seo-meta.js), before and after, and lists
// every difference. --apply refuses to write while there is one, or when the check cannot run.
//
// Idempotent: a page with a type is left alone. The last step of the chain: replaying earlier
// steps after it would bring back what it moved (01 the page_hero component and the album
// fields, 06 page_hero rows on pages without one).
//
// The old frodo keeps `type` and `typeData` on save but cannot show or edit them – update the
// CMS that edits this database first.

const path = require("path");
const {
    ROOT,
    withDb,
    backup,
    bumpContentVersion,
    printReport,
    componentTitles,
    row,
    mergeFields,
    describeFields,
    parseByline
} = require("./lib");
const { pageTypes } = require("./definitions");
const seoMeta = require("../../shared/seo-meta");

const CONTENT = "tresc";
const ALBUM = "album";
const ALBUM_FIELDS = ["category", "cover", "author", "published", "updated", "hidden"];
const HERO_FIELDS = pageTypes.find(t => t.type === CONTENT).fields.map(f => f.id).filter(id => id !== "side");

/** The values of `source` under `keys`, without the missing ones (the driver would store null). */
const pick = (source, keys) =>
    Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
const omit = (source, keys) => Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));

/** The rows the front end puts beside the text of a page without a type (isSideRow, page-layout.ts). */
function isSideRow(r) {
    const data = r.data || {};
    if (r.type === "link_cards") return data.variant === "lista boczna";
    if (r.type === "numbered_list") return !(data.items || []).length && !!(data.more_items || []).length;
    if (r.type === "title_and_text") {
        const text = data.text || [];
        return !data.title && text.length === 1 && text[0].paragraph_class === "cytat" && !(text[0].list || []).length;
    }
    return r.type === "geosites_logos";
}

const hasByline = r =>
    (r.type === "title_and_text" && (r.data.text || []).some(t => !(t.list || []).length && parseByline(t.paragraph))) ||
    (r.type === "gallery" && (r.data.paragraphs || []).some(p => parseByline(p && p.paragraph)));

/** Why a page keeps the front end's older rules and no type; "" when it can take one. */
function legacyReason(rows, kind) {
    if (rows.some(r => r.data && hasByline(r))) return "a byline paragraph";
    if (kind === ALBUM) return rows.filter(r => r.type === "gallery").length > 1 ? "two gallery rows" : "";
    if (!rows.some(r => r.type === "page_hero")) return "no page_hero";
    if (rows.some(r => r.type === "heading" && /\bfootnotes__heading\b/.test((r.data && r.data.class) || "")))
        return "a warning made of a heading";
    return "";
}

/** A content page as "tresc": the header and the side column leave the rows. */
function asContent(page, titles) {
    const hero = page.rows.find(r => r && r.type === "page_hero").data || {};
    const rows = [];
    const side = [];
    for (const r of page.rows) {
        if (r && r.type === "page_hero") continue;
        const data = (r && r.data) || {};
        if (r && r.type === "numbered_list" && (data.items || []).length && (data.more_items || []).length) {
            // withMoreBeside: "A ponadto" stands beside the list as a list of its own.
            rows.push({ ...r, data: omit(data, ["more_title", "more_items"]) });
            side.push(row("numbered_list", pick(data, ["more_title", "more_items"]), titles));
        } else if (r && r.type && isSideRow(r)) {
            side.push(r);
        } else {
            rows.push(r);
        }
    }
    const typeData = { ...pick(hero, HERO_FIELDS), side: side.map(component => ({ component })) };
    const sideNames = side.map(r => (r.data.more_items && !r.data.items ? "numbered_list (A ponadto)" : r.type));
    return {
        type: CONTENT,
        typeData,
        rows,
        note: `header "${hero.title || ""}"${sideNames.length ? `; beside the text: ${sideNames.join(", ")}` : ""}`
    };
}

/** An album as "album": its fields leave the gallery row. */
function asAlbum(page) {
    let typeData = {};
    const rows = page.rows.map(r => {
        if (!r || r.type !== "gallery") return r;
        typeData = pick(r.data || {}, ALBUM_FIELDS);
        return { ...r, data: omit(r.data || {}, ALBUM_FIELDS) };
    });
    return { type: ALBUM, typeData, rows, note: Object.keys(typeData).join(", ") || "(no album fields)" };
}

/** The front end's layoutPage, bundled from its source; null when esbuild is not installed. */
function loadLayoutPage() {
    let esbuild;
    try {
        esbuild = require(path.join(ROOT, "front", "node_modules", "esbuild"));
    } catch {
        return null;
    }
    const outfile = path.join(ROOT, "tmp", "page-layout.cjs");
    esbuild.buildSync({
        entryPoints: [path.join(ROOT, "front", "src", "app", "core", "page-layout.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile,
        logLevel: "error"
    });
    delete require.cache[outfile];
    return require(outfile).layoutPage;
}

/** Sorted keys and no undefined values, so equal layouts print the same. */
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .filter(key => value[key] !== undefined)
                .map(key => [key, canonical(value[key])])
        );
    }
    return value;
}

/** Paths where two canonical values differ (at most `max`). */
function differences(a, b, at = "", found = [], max = 5) {
    if (found.length >= max || JSON.stringify(a) === JSON.stringify(b)) return found;
    const objects = a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b);
    if (!objects) {
        found.push(`${at || "(root)"}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`.slice(0, 300));
        return found;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${at}.${key}`, found, max);
    return found;
}

/**
 * What a visitor gets from a page: its layout and SEO meta. A page goes through JSON as the
 * site serves it (app.js, ssrApi); the title a row carries is the component's name in the
 * panel, which nothing shows.
 */
function rendered(layoutPage, page) {
    const served = JSON.parse(JSON.stringify(page));
    const layout = layoutPage(served);
    const untitled = rows => rows.map(r => omit(r, ["title"]));
    return canonical({
        layout: { ...layout, rows: untitled(layout.rows), side: untitled(layout.side) },
        meta: seoMeta.buildMeta(served)
    });
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const pages = db.collection("pages");
    const components = db.collection("components");
    const settings = db.collection("settings");
    const titles = await componentTitles(db);

    // Page types.
    const typeReport = [];
    const settingsDoc = await settings.findOne({ _id: "settings" });
    const mergedTypes = ((settingsDoc && settingsDoc.pageTypes) || []).map(t => ({ ...t }));
    let typesChanged = false;
    for (const wanted of pageTypes) {
        const current = mergedTypes.find(t => t.type === wanted.type);
        if (!current) {
            mergedTypes.push(wanted);
            typesChanged = true;
            typeReport.push(`create "${wanted.type}" ${wanted.title} (${describeFields(wanted.fields).join(", ")})`);
            continue;
        }
        const { fields, changes } = mergeFields(current.fields, wanted.fields);
        if (changes.some(change => !change.startsWith("!"))) {
            current.fields = fields;
            typesChanged = true;
        }
        typeReport.push(changes.length ? `update "${wanted.type}"\n      ${changes.join("\n      ")}` : `ok     "${wanted.type}" (nothing to add)`);
    }
    printReport("Page types (settings)", typeReport, apply);

    // Pages.
    const pageReport = [];
    const updates = [];
    const after = [];
    for (const page of await pages.find({}).sort({ pageUrl: 1 }).toArray()) {
        const rows = (page.rows || []).filter(r => r && r.type);
        const types = rows.map(r => r.type);
        const kind = types.includes("homepage_banner") || types.includes("map") ? "" : types.includes("gallery") ? ALBUM : CONTENT;
        let reason = page.type ? `already "${page.type}"` : kind ? legacyReason(rows, kind) : "draws its own header";
        if (reason) {
            if (!page.type && kind) pageReport.push(`left   ${page.pageUrl}: ${reason} (${types.join(" → ")})`);
            after.push(page);
            continue;
        }
        const change = kind === ALBUM ? asAlbum(page) : asContent(page, titles);
        updates.push({ before: page, after: { ...page, type: change.type, typeData: change.typeData, rows: change.rows } });
        after.push(updates[updates.length - 1].after);
        pageReport.push(`${change.type.padEnd(6)} ${page.pageUrl}: ${change.note}`);
    }
    const counts = [CONTENT, ALBUM].map(type => `${updates.filter(u => u.after.type === type).length} → ${type}`);
    pageReport.push(`${counts.join(", ")}; ${after.length - updates.length} page(s) keep what they have`);
    printReport("Pages", pageReport, apply);

    // Components no page uses any more.
    const componentReport = [];
    const heroLeft = after.filter(p => (p.rows || []).some(r => r && r.type === "page_hero"));
    const albumFieldsLeft = after.filter(p =>
        (p.rows || []).some(r => r && r.type === "gallery" && ALBUM_FIELDS.some(id => r.data && r.data[id] !== undefined))
    );
    const hero = await components.findOne({ type: "page_hero" });
    const gallery = await components.findOne({ type: "gallery" });
    const removeHero = !!hero && !heroLeft.length;
    const galleryFields = gallery ? gallery.fields.filter(f => !ALBUM_FIELDS.includes(f.id)) : [];
    const trimGallery = !!gallery && !albumFieldsLeft.length && galleryFields.length < gallery.fields.length;
    if (!hero) componentReport.push("ok     page_hero: already gone");
    else if (removeHero) componentReport.push("remove page_hero (Nagłówek strony)");
    else componentReport.push(`keep   page_hero: still on ${heroLeft.map(p => p.pageUrl).join(", ")}`);
    if (trimGallery) componentReport.push(`update gallery: − ${ALBUM_FIELDS.filter(id => gallery.fields.some(f => f.id === id)).join(", ")}`);
    else if (albumFieldsLeft.length) componentReport.push(`keep   gallery fields: still on ${albumFieldsLeft.map(p => p.pageUrl).join(", ")}`);
    else componentReport.push("ok     gallery: no album fields left");
    printReport("Components", componentReport, apply);

    // The check: what visitors get must not change.
    const layoutPage = loadLayoutPage();
    const checkReport = [];
    let differing = 0;
    if (!layoutPage) {
        checkReport.push("cannot run: no esbuild in front/node_modules (npm ci in front/)");
    } else {
        for (const update of updates) {
            const found = differences(rendered(layoutPage, update.before), rendered(layoutPage, update.after));
            if (!found.length) continue;
            differing++;
            checkReport.push(`differs ${update.before.pageUrl}`);
            found.forEach(line => checkReport.push(`          ${line}`));
        }
        checkReport.push(`${updates.length - differing} of ${updates.length} changed page(s) lay out and read the same`);
    }
    printReport("Check: layout and SEO meta before and after", checkReport, apply);

    if (!apply) return;
    if (!layoutPage || differing) throw new Error("not written: the check did not pass");
    if (!typesChanged && !updates.length && !removeHero && !trimGallery) return;
    console.log(`backup: ${await backup(db, "page-types", ["pages", "components", "settings"])}`);
    if (typesChanged) {
        await settings.updateOne(
            { _id: "settings" },
            { $set: { pageTypes: mergedTypes }, $setOnInsert: { __v: 0 } },
            { upsert: true }
        );
    }
    for (const update of updates) {
        const { type, typeData, rows } = update.after;
        await pages.updateOne({ _id: update.before._id }, { $set: { type, typeData, rows } });
    }
    if (removeHero) await components.deleteOne({ _id: hero._id });
    if (trimGallery) await components.updateOne({ _id: gallery._id }, { $set: { fields: galleryFields, updated: Date.now() } });
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
