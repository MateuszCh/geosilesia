// Step 6: content pages, the dictionary and older events.
//
//   node scripts/cms/06-content.js [--apply]
//
// Pages (every page except the home page, the map, albums, TOP 50 and the knowledge base):
// - a `page_hero` row on top, titled from the leading `heading` (removed), the first title
//   (cleared) or the page name, carrying the author and dates of the trailing byline
//   paragraph (removed);
// - "Dziedzictwo geologiczne": the warning heading and its text become a `notice`;
// - "Kontakt": the editor and the three notes become a `contact` row, the citation pattern
//   a `notice`;
// - `paragraph_class` "fw-bold" becomes the choice "pogrubiony".
// Dictionary: "(ang. …)" moves from the title to `title_en`.
// Events: older ones keep the event date and place in `date_and_place` ("8 marca 2018,
// Czeladź"); they become `event_date` and `place`.
//
// Idempotent: pages with a page_hero are left alone; the other steps only fill empty fields.

const {
    withDb,
    backup,
    bumpContentVersion,
    printReport,
    componentTitles,
    row,
    updatePageRows,
    describeRows,
    toCmsDate,
    parseByline
} = require("./lib");

const SKIP = new Set(["/", "mapa-atrakcji", "baza-wiedzy", "geosilesia-top-atrakcje-geoturystyczne"]);
const KB_SECTION_PAGES = new Set([
    "do-posluchania",
    "do-poczytania",
    "do-pobrania",
    "do-poogladania",
    "animacje-prezentacje",
    "mapy-online",
    "wirtualne-media"
]);

/**
 * Page titles chosen by hand where the first heading of the text is a section heading
 * rather than the page's name; that heading then stays in the text.
 */
const TITLE_OVERRIDES = { geoparki: "Geoparki" };

const stripTags = html => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function emptyHero(title) {
    return { title, lead: "", image: "", image_caption: "", image_author: "", author: "", published: "", updated: "" };
}

/** Rows without the byline paragraph; text rows left empty disappear. */
function withoutByline(rows, found) {
    return rows
        .map(r => {
            if (!r || r.type !== "title_and_text") return r;
            const text = (r.data.text || []).filter(t => {
                const byline = !(t.list || []).length && parseByline(t.paragraph);
                if (byline) found(byline);
                return !byline;
            });
            if (!r.data.title && !text.length) return undefined;
            return { ...r, data: { ...r.data, text } };
        })
        .filter(Boolean);
}

function fixParagraphClasses(rows, changes) {
    return rows.map(r => {
        if (!r || r.type !== "title_and_text") return r;
        let changed = false;
        const text = (r.data.text || []).map(t => {
            if (t.paragraph_class === "fw-bold") {
                changed = true;
                return { ...t, paragraph_class: "pogrubiony" };
            }
            return t;
        });
        if (!changed) return r;
        changes.push('paragraph_class "fw-bold" → "pogrubiony"');
        return { ...r, data: { ...r.data, text } };
    });
}

function mergeWarning(rows, titles, changes) {
    const index = rows.findIndex(r => r && r.type === "heading" && /\bfootnotes__heading\b/.test(r.data.class || ""));
    if (index === -1) return rows;
    const heading = rows[index];
    const next = rows[index + 1];
    const merged = next && next.type === "title_and_text" && !next.data.title;
    const text = merged ? (next.data.text || []).map(t => `<p>${t.paragraph}</p>`).join("") : "";
    const notice = row("notice", { title: stripTags(heading.data.text).replace(/!+$/, "!"), text, variant: "uwaga" }, titles);
    const rest = rows.filter((_, i) => i !== index && !(merged && i === index + 1));
    // The spec puts the warning before the footnotes.
    const footnotes = rest.findIndex(r => r && r.type === "footnotes");
    rest.splice(footnotes === -1 ? rest.length : footnotes, 0, notice);
    changes.push(`heading "${stripTags(heading.data.text)}"${merged ? " + its text" : ""} → notice (uwaga)`);
    return rest;
}

/** Kontakt: the editor line and the notes list → contact; the citation pattern → notice. */
function contactRows(rows, titles, changes) {
    const textRow = rows.find(r => r && r.type === "title_and_text");
    if (!textRow) return rows;
    const items = textRow.data.text || [];
    const person = items.find(t => /\(at\)|@/.test(t.paragraph || ""));
    const citation = items.find(t => /cytowania/i.test(t.paragraph || ""));
    if (!person) return rows;
    const match = /^(.*?):\s*(.*?)\s*\/\s*(\S+)\s*$/.exec(stripTags(person.paragraph));
    const role = match ? match[1].trim() : "";
    const cardTitles = [
        [/współpracy/i, "Współpraca"],
        [/błąd/i, "Błąd w treści?"],
        [/krytykuj/i, "Uwagi"]
    ];
    const cards = (person.list || []).map(item => ({
        title: (cardTitles.find(([pattern]) => pattern.test(item.item || "")) || [, ""])[1],
        text: item.item || ""
    }));
    const contact = row(
        "contact",
        {
            person_role: role ? role.charAt(0) + role.slice(1).toLowerCase() : "",
            person_name: match ? match[2] : "",
            email: match ? match[3] : "",
            cards
        },
        titles
    );
    const result = [contact];
    if (citation) {
        result.push(
            row(
                "notice",
                {
                    title: stripTags(citation.paragraph).replace(/:$/, ""),
                    text: (citation.list || []).map(item => `<p>${item.item}</p>`).join(""),
                    variant: "cytowanie"
                },
                titles
            )
        );
    }
    const rest = items.filter(t => t !== person && t !== citation);
    if (rest.length) result.push({ ...textRow, data: { title: "", text: rest } });
    changes.push(`text → contact (${contact.data.person_name}, ${cards.length} cards)${citation ? " + notice (cytowanie)" : ""}`);
    return rows.flatMap(r => (r === textRow ? result : [r]));
}

/** "Geopark (ang. geopark)" → { title: "Geopark", title_en: "geopark" } */
function splitDictionaryTitle(title) {
    const match = /\s*\((?:ang\.\s*)([^)]*)\)\s*$/i.exec(title || "");
    return match ? { title: title.slice(0, match.index).trim(), title_en: match[1].trim() } : undefined;
}

/** Month names as written in events: the genitive ("marca") and, now and then, the nominative ("luty"). */
const MONTHS = [
    ["stycznia", "styczeń"],
    ["lutego", "luty"],
    ["marca", "marzec"],
    ["kwietnia", "kwiecień"],
    ["maja", "maj"],
    ["czerwca", "czerwiec"],
    ["lipca", "lipiec"],
    ["sierpnia", "sierpień"],
    ["września", "wrzesień"],
    ["października", "październik"],
    ["listopada", "listopad"],
    ["grudnia", "grudzień"]
];
const MONTH_NAMES = MONTHS.flat().join("|");
const monthNumber = name => MONTHS.findIndex(forms => forms.includes(name.toLowerCase())) + 1;

/** "8 marca 2018, Czeladź" / "07-08.09.2023 Smoleń" / "29 września 2023" → date and place. */
function parseDateAndPlace(text) {
    const value = String(text || "").trim();
    let match = new RegExp(`^(\\d{1,2})(?:\\s*[-–]\\s*\\d{1,2})?\\s+(${MONTH_NAMES})\\s+(\\d{4})\\s*(?:r\\.)?`, "i").exec(value);
    let date = "";
    if (match) {
        date = `${match[1].padStart(2, "0")}.${String(monthNumber(match[2])).padStart(2, "0")}.${match[3]}`;
    } else {
        match = /^(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\.(\d{1,2})\.(\d{4})\s*(?:r\.)?/.exec(value);
        if (match) date = `${match[1].padStart(2, "0")}.${match[2].padStart(2, "0")}.${match[3]}`;
    }
    const rest = (match ? value.slice(match[0].length) : value).replace(/^[\s,;:–-]+/, "").trim();
    return { date, place: /\p{L}/u.test(rest) ? rest : "" };
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const titles = await componentTitles(db);
    const pagesColl = db.collection("pages");
    const report = [];
    const writes = [];

    const pages = await pagesColl.find({}).sort({ pageUrl: 1 }).toArray();
    for (const page of pages) {
        const rowsIn = (page.rows || []).filter(r => r && r.type);
        const changes = [];
        let rows = fixParagraphClasses(rowsIn, changes);

        // Dictionary terms, wherever the dictionary is.
        rows = rows.map(r => {
            if (!r || r.type !== "dictionary") return r;
            let count = 0;
            const items = (r.data.items || []).map(item => {
                if (item.title_en) return item;
                const split = splitDictionaryTitle(item.title);
                if (!split) return item;
                count++;
                return { ...item, ...split };
            });
            if (count) changes.push(`dictionary: ${count} English term(s) moved to title_en`);
            return count ? { ...r, data: { ...r.data, items } } : r;
        });

        const isContentPage =
            !SKIP.has(page.pageUrl) &&
            !KB_SECTION_PAGES.has(page.pageUrl) &&
            !rows.some(r => r.type === "gallery" || r.type === "homepage_banner" || r.type === "map" || r.type === "page_hero");

        if (isContentPage) {
            rows = mergeWarning(rows, titles, changes);
            if (page.pageUrl === "geosilesia-kontakt") rows = contactRows(rows, titles, changes);

            let title = page.title;
            const first = rows[0];
            if (TITLE_OVERRIDES[page.pageUrl]) {
                title = TITLE_OVERRIDES[page.pageUrl];
            } else if (first && first.type === "heading" && first.data.text) {
                title = stripTags(first.data.text);
                rows = rows.slice(1);
            } else if (first && (first.type === "title_and_text" || first.type === "news") && first.data.title) {
                title = first.data.title;
                rows = [{ ...first, data: { ...first.data, title: "" } }, ...rows.slice(1)];
            }
            let byline;
            rows = withoutByline(rows, found => (byline = found));
            const hero = emptyHero(title);
            if (byline) {
                hero.author = byline.author;
                hero.published = toCmsDate(byline.published);
                hero.updated = toCmsDate(byline.updated);
            }
            rows = [row("page_hero", hero, titles), ...rows];
            changes.push(`page_hero "${title}"${byline ? ` (${byline.author}, ${byline.published || "–"}, ${byline.updated})` : ""}`);
        }

        if (changes.length) {
            report.push(`${page.pageUrl}: ${changes.join("; ")}`);
            if (isContentPage) report.push(`    ${describeRows(rowsIn)}\n    → ${describeRows(rows)}`);
            writes.push(() => updatePageRows(db, page._id, rows));
        }
    }

    const events = await db.collection("posts").find({ type: "wydarzenie" }).toArray();
    let eventCount = 0;
    for (const event of events) {
        const data = event.data || {};
        if (data.place || data.event_date || !data.date_and_place) continue;
        const { date, place } = parseDateAndPlace(data.date_and_place);
        const eventDate = toCmsDate(date);
        const sameAsPublication = eventDate && eventDate === data.date_of_publication;
        if (!place && (!eventDate || sameAsPublication)) continue;
        eventCount++;
        if (eventCount <= 12) report.push(`event "${event.title}": "${data.date_and_place}" → date ${date || "–"}, place "${place}"`);
        writes.push(() =>
            db.collection("posts").updateOne(
                { _id: event._id },
                { $set: { "data.place": place, "data.event_date": sameAsPublication ? "" : eventDate, updated: Date.now() } }
            )
        );
    }
    if (eventCount > 12) report.push(`… and ${eventCount - 12} more events`);

    printReport("content", report.length ? report : ["nothing to change"], apply);
    if (apply && writes.length) {
        console.log(`backup: ${await backup(db, "content", ["pages", "posts"])}`);
        for (const write of writes) await write();
        await bumpContentVersion(db);
    }
    console.log(`\n${writes.length} document(s) ${apply ? "written" : "would change"} (${eventCount} events)`);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
