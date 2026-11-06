// Step 21: the CMS states a page's layout instead of the front end working it out from the
// rows (needs frodo with page types and "component" fields).
//
//   node scripts/cms/21-explicit-layout.js [--apply --db=<database>]
//
// Until this step the front end rearranged a page by the kinds and order of its rows. From
// now on it draws the rows one after another and takes the rest from fields:
// - "Strona treści" gains "W nagłówku" (a component in the header: the figures it used to
//   take from the first row of Geoparki and Położenie), "Przycisk przy tytule" (the map link
//   it took from the TOP 50 route), "Menu działu" (in the header or beside the text), "Autor
//   i daty" (where the byline goes) and the "Dalej w dziale" card;
// - components gain the dictionary's "Wyszukiwarka w nagłówku strony", the tabs' "Bez spisu
//   „Na tej stronie”", the map's "Tytuł jako nagłówek strony", TOP 50's "Pod trasą" (a
//   component in the route's column: the note that used to follow the route) and a column's
//   "Szersza kolumna" in "Kolumny";
// - every page gets the values that keep it as it looks, worked out with the rules the front
//   end applied until now (page-layout.ts, page-view.ts and the CSS as of step 20) and the
//   sections of the navigation.
// `updated` of the pages stays: their content does not change, only where it is kept.
//
// Idempotent: a content page that has "Menu działu" set is done; a value already set on a
// component is kept.

const {
    withDb,
    backup,
    bumpContentVersion,
    printReport,
    mergeFields,
    describeFields,
    upsertDefinitions
} = require("./lib");
const { contentLayoutFields, contentFieldOrder, layoutComponents } = require("./definitions");

const CONTENT = "tresc";
/** What the side column showed (SIDE_TYPES, page-layout.ts); every current one qualifies. */
const SIDE_TYPES = ["link_cards", "numbered_list", "title_and_text", "geosites_logos", "notice"];

/** The fields in the panel's order: those of `order` first, the others after them as they were. */
function inOrder(fields, order) {
    const rank = f => (order.includes(f.id) ? order.indexOf(f.id) : order.length);
    return fields
        .map((f, i) => [f, i])
        .sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j)
        .map(([f]) => f);
}

/** Path of a navigation link as the router has it (pathOf, navigation.service.ts). */
function pathOf(link) {
    if (!link) return undefined;
    const absolute = link.startsWith("/") ? link : `/${link}`;
    const path = absolute.split("?")[0].split("#")[0];
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Paths of the pages that belong to a section of the navigation (NavigationService.section). */
async function sectionPaths(db) {
    const nav = await db.collection("posts").findOne({ type: "navigation" });
    const items = (nav && nav.data && nav.data.nav) || [];
    return new Set(
        items
            .filter(item => item.title)
            .flatMap(item => (item.subnav || []).map(sub => pathOf(sub.link)))
            .filter(Boolean)
    );
}

const isLiterature = r => !!r && r.type === "literature";

/**
 * A content page with its layout as values: what headerOf took from the first row, the
 * TOP 50 note, the section menu, the "Dalej w dziale" card, the tabs' list and the byline.
 */
function contentPage(page, inSection) {
    const values = { ...(page.typeData || {}) };
    const rows = (page.rows || []).map(r => (r && r.data ? { ...r, data: { ...r.data } } : r));
    const changes = [];
    const real = () => rows.filter(r => r && r.type);
    const style = values.image ? "photo" : values.variant === "jasne" ? "light" : values.variant === "ciemne" ? "dark" : "plain";
    const band = style === "light" || style === "dark";
    const side = (values.side || []).map(item => item && item.component).filter(c => c && SIDE_TYPES.includes(c.type));

    // Read before anything moves: the literature anywhere in the rows (withNestedRows).
    const hasLiterature = real().some(r => isLiterature(r) || (r.type === "dictionary" && isLiterature(r.data.below)));
    const listsSections = real().some(r => r.type === "knowledge_base" && r.data.variant !== "zapowiedź");
    const hasTabs = real().some(r => r.type === "tabs");

    // headerOf: the first row joins the header.
    const first = real()[0];
    if (first && first.type === "facts" && band && values.header_component === undefined) {
        values.header_component = first;
        rows.splice(rows.indexOf(first), 1);
        changes.push("facts → W nagłówku");
    } else if (first && first.type === "dictionary" && style === "light") {
        first.data.search_in_header = true;
        changes.push("dictionary: Wyszukiwarka w nagłówku strony");
    } else if (first && first.type === "top50" && first.data.variant !== "zapowiedź" && first.data.link && style === "plain") {
        values.action_label = first.data.link_label || "Pokaż wszystkie 50 na mapie";
        values.action_link = first.data.link;
        delete first.data.link;
        delete first.data.link_label;
        changes.push(`top50 link → Przycisk przy tytule (${values.action_label} → ${values.action_link})`);
        if (!values.eyebrow) {
            values.eyebrow = "Szlak czerwony";
            changes.push("Nadtytuł: Szlak czerwony");
        }
    }

    // _sections.scss: a text right after the TOP 50 route was its note, in the route's column.
    for (const r of real()) {
        const next = real()[real().indexOf(r) + 1];
        if (r.type === "top50" && next && next.type === "title_and_text" && !(r.data.below && r.data.below.type)) {
            r.data.below = next;
            rows.splice(rows.indexOf(next), 1);
            changes.push("title_and_text → top50 Pod trasą");
        }
    }

    // page-view.ts: the section menu, "Dalej w dziale", the tabs' list and the byline.
    const menu = !inSection || listsSections ? "" : style === "light" ? "w nagłówku" : side.length === 0 ? "obok tekstu" : "";
    const nextCard = inSection && style !== "light" && side.length > 0 && hasTabs;
    values.section_menu = menu;
    values.next_card = nextCard;
    changes.push(`Menu działu: ${menu || "brak"}`);
    if (nextCard) changes.push("Dalej w dziale");
    if (menu === "obok tekstu") {
        for (const r of real().filter(r => r.type === "tabs")) {
            r.data.hide_toc = true;
            changes.push("tabs: Bez spisu");
        }
    }
    const hasSide = side.length > 0 || menu === "obok tekstu" || nextCard;
    values.byline = !band ? "" : hasLiterature ? "w ramce literatury" : hasSide ? "w kolumnie bocznej" : "pod treścią";
    changes.push(`Autor i daty: ${values.byline || "w nagłówku"}`);

    return { typeData: values, rows, changes };
}

/** Any page: a map is the page's title without the home banner; an events column is wider. */
function componentValues(rows) {
    const changes = [];
    const result = (rows || []).map(r => (r && r.data ? { ...r, data: { ...r.data } } : r));
    const banner = result.some(r => r && r.type === "homepage_banner");
    for (const r of result.filter(r => r && r.type === "map" && !banner && r.data.page_title === undefined)) {
        r.data.page_title = true;
        changes.push("map: Tytuł jako nagłówek strony");
    }
    for (const r of result.filter(r => r && r.type === "columns")) {
        r.data.columns = (r.data.columns || []).map(column => {
            const kinds = ((column && column.components) || []).map(item => item && item.component && item.component.type).filter(Boolean);
            if (kinds[0] !== "news" || column.wide !== undefined) return column;
            changes.push("columns: Szersza kolumna (news)");
            return { ...column, wide: true };
        });
    }
    return { rows: result, changes };
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "explicit-layout", ["pages", "components", "settings"])}`);

    // The page type's fields.
    const settings = db.collection("settings");
    const settingsDoc = await settings.findOne({ _id: "settings" });
    const pageTypes = ((settingsDoc && settingsDoc.pageTypes) || []).map(t => ({ ...t }));
    const content = pageTypes.find(t => t.type === CONTENT);
    if (!content) throw new Error(`no page type "${CONTENT}" – run step 18 first`);
    const merged = mergeFields(content.fields, contentLayoutFields);
    const ordered = inOrder(merged.fields, contentFieldOrder);
    const reordered = ordered.some((f, i) => f.id !== (content.fields[i] || {}).id);
    const typeChanged = merged.changes.some(c => !c.startsWith("!")) || reordered;
    printReport(
        "Page type (settings)",
        typeChanged
            ? [`update "${CONTENT}"\n      ${merged.changes.join("\n      ")}\n      order: ${describeFields(ordered).map(d => d.split(/[:[]/)[0]).join(", ")}`]
            : [`ok     "${CONTENT}" (nothing to add)`],
        apply
    );
    content.fields = ordered;

    const definitions = await upsertDefinitions(db, "components", layoutComponents, { apply });
    printReport("Components", definitions.report, apply);

    // The pages.
    const sections = await sectionPaths(db);
    const pages = db.collection("pages");
    const report = [];
    const updates = [];
    for (const page of await pages.find({}).sort({ type: 1, pageUrl: 1 }).toArray()) {
        let typeData = page.typeData;
        let rows = page.rows;
        const changes = [];
        if (page.type === CONTENT && (page.typeData || {}).section_menu === undefined) {
            const laidOut = contentPage(page, sections.has(pathOf(page.pageUrl)));
            ({ typeData, rows } = laidOut);
            changes.push(...laidOut.changes);
        }
        const values = componentValues(rows);
        changes.push(...values.changes);
        if (!changes.length) continue;
        updates.push({ _id: page._id, set: { typeData, rows: values.rows } });
        report.push(`update ${page.pageUrl || "/"}\n      ${changes.join("\n      ")}`);
    }
    if (!updates.length) report.push("ok     every page has its layout values");
    printReport("Pages", report, apply);

    if (!apply) return;
    if (typeChanged) await settings.updateOne({ _id: "settings" }, { $set: { pageTypes } });
    for (const update of updates) {
        const set = update.set.typeData === undefined ? { rows: update.set.rows } : update.set;
        await pages.updateOne({ _id: update._id }, { $set: set });
    }
    if (typeChanged || definitions.changed || updates.length) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
