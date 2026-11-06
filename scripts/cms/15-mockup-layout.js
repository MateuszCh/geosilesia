// Step 15: the content of nine pages laid out as in the mockups.
//
//   node scripts/cms/15-mockup-layout.js [--apply --db=<database>]
//
// Needs the two fields step 1 adds after this step was written (page_hero "Tło nagłówka
// bez zdjęcia", tabs figures "Kolor liczby") – run 01-definitions.js again first.
//
// - Header bands: light on the dictionary pages (Słowa kluczowe, Geostanowiska, Geoparki),
//   forest on Położenie. In the mockups these headers have no photo, nor has TOP 50, so the
//   photos step 11 proposed for them are taken off again (only where they are still the
//   proposed ones). Rzeźba terenu gets the mockup's photo: Brama Laseckich in Bobolice.
//   It is an album photo, 750 px wide – the mockup uses the same file.
// - Leads move into the header: the list intro of Skarby natury, the first paragraph of
//   Geostanowiska. The text is moved as it is, not rewritten.
// - Geostanowiska: the bullet list becomes the numbered "Co warto wiedzieć"; the databases
//   get the mockup's names.
// - Beside the text: "Zobacz w terenie" with three albums on Budowa geologiczna, the motto
//   and a TOP 50 card on Skarby natury, the Olsztyn photo on Geoparki.
// - Budowa geologiczna: Kazimierz Żytko's sentence becomes the quote of its section.
// - Rzeźba terenu: the highest point red, the lowest blue, as in the mockup.
// - Galeria: the lead of the mockup (the album count is in the "Wszystkie" filter).
//
// Idempotent: each change checks for its own result first and leaves edits made in the
// panel alone.

const { withDb, backup, bumpContentVersion, printReport, componentTitles, row, updatePageRows } = require("./lib");

const TOP50_PAGE = "/geosilesia-top-atrakcje-geoturystyczne";

/** Photos step 11 put in headers that have none in the mockups. */
const STEP11_PHOTOS = {
    "polozenie-wojewodztwa-slaskiego": "/uploads/Kaskady_Rodła.jpg",
    geoparki: "/uploads/olsztyn_marektecza.jpg",
    "geosilesia-top-atrakcje-geoturystyczne": "/uploads/sztolnia_krolowa_luiza.jpg"
};

const BANDS = {
    "geosilesia-slownik": "jasne",
    "geosilesia-geostanowiska": "jasne",
    geoparki: "jasne",
    "polozenie-wojewodztwa-slaskiego": "ciemne"
};

const RZEZBA_PHOTO = {
    image: "/uploads/bobolice2_2016.png",
    image_caption: "Brama Laseckich w Bobolicach na Wyżynie Częstochowskiej",
    image_author: "R. Chybiorz"
};

const BUDOWA_PLACES = {
    title: "Zobacz w terenie",
    intro: "",
    variant: "lista boczna",
    items: [
        {
            title: "Rezerwat Szachownica",
            description: "jaskinia w wapieniach górnej jury",
            image: "/uploads/Szachownica_mignaczak.jpg",
            link: "/galeria/rezerwat-szachownica",
            color: "czerwony"
        },
        {
            title: "Kamieniołom Lipówka",
            description: "górnojurajskie wapienie",
            image: "/uploads/rudniki2_181018 kopia.jpg",
            link: "/galeria/rudniki-kamieniolom-lipowka",
            color: "niebieski"
        },
        {
            title: "Ssaki z epoki lodowcowej",
            description: "galeria · czwartorzęd",
            image: "/uploads/pig-mamut_1811.jpg",
            link: "/galeria/ssaki-z-pyskowic",
            color: "zielony"
        }
    ]
};

const SKARBY_TOP50 = {
    title: "",
    intro: "",
    variant: "lista boczna",
    items: [{ title: "Najciekawsze miejsca do odwiedzenia", description: "TOP 50", image: "", link: TOP50_PAGE, color: "czerwony" }]
};

/** Database names of the mockup, replacing the ones step 14 gave them. */
const DATABASE_NAMES = {
    "Centralna Baza Danych Geologicznych": "Geoportal CBDG",
    GeoLOG: "Aplikacja GeoLOG"
};

const GEOPARK_PHOTO = { from: "/uploads/pletwa_20210914.jpg", to: "/uploads/olsztyn_marektecza.jpg" };

const ZYTKO = /^Warto pamiętać, że "Geologia jest kośćcem - rzeźba to tylko skóra" \(Kazimierz Żytko, PIG Kraków\)\.$/;

const GALLERY_LEAD = "<p>Albumy fotograficzne z terenu: skały, minerały, jaskinie, kopalnie, tężnie i kamień w architekturze.</p>";

/** Rzeźba terenu, first tab: the colours of the highest and the lowest point. */
const RELIEF_COLORS = { "najwyższy punkt": "czerwony", "najniższy punkt": "niebieski" };

const asParagraph = text => (/^\s*</.test(text) ? text : `<p>${text}</p>`);
const short = text => {
    const plain = String(text || "").replace(/<[^>]+>/g, "");
    return plain.length > 90 ? `${plain.slice(0, 90)}…` : plain;
};

/** Every change: page → (rows, helpers) → rows; `note` records what changed. */
const CHANGES = {
    "geosilesia-slownik": [band],
    "geosilesia-geostanowiska": [band, geositesLead, geositesPoints, databaseNames],
    geoparki: [band, dropStep11Photo, geoparkFigure],
    "polozenie-wojewodztwa-slaskiego": [band, dropStep11Photo],
    "rzezba-terenu-wojewodztwa-slaskiego": [rzezbaPhoto, reliefColors],
    "budowa-geologiczna-wojewodztwa-slaskiego": [zytkoQuote, budowaPlaces],
    "wojewodztwo-slaskie-cuda-natury": [skarbyLead, skarbyMotto, skarbyTop50],
    "geosilesia-top-atrakcje-geoturystyczne": [dropStep11Photo],
    "geosilesia-galeria": [galleryLead]
};

const heroAt = rows => rows.findIndex(r => r && r.type === "page_hero");
const withHero = (rows, data) => rows.map((r, i) => (i === heroAt(rows) ? { ...r, data: { ...r.data, ...data } } : r));

function band(rows, { pageUrl, note }) {
    const hero = rows[heroAt(rows)].data;
    if ((hero.variant || "") === BANDS[pageUrl]) return rows;
    note(`header band "${BANDS[pageUrl]}"`);
    return withHero(rows, { variant: BANDS[pageUrl] });
}

function dropStep11Photo(rows, { pageUrl, note }) {
    const hero = rows[heroAt(rows)].data;
    if (!hero.image) return rows;
    if (hero.image !== STEP11_PHOTOS[pageUrl]) {
        note(`header photo kept: ${hero.image} is not the one step 11 proposed`, true);
        return rows;
    }
    note(`header photo removed: ${hero.image}`);
    return withHero(rows, { image: "", image_caption: "", image_author: "" });
}

function rzezbaPhoto(rows, { note }) {
    const hero = rows[heroAt(rows)].data;
    if (hero.image) return rows;
    note(`header photo ${RZEZBA_PHOTO.image}: Na zdjęciu: ${RZEZBA_PHOTO.image_caption} · Fot. ${RZEZBA_PHOTO.image_author}`);
    return withHero(rows, RZEZBA_PHOTO);
}

function reliefColors(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "tabs") return r;
        const tabs = (r.data.tabs || []).map((tab, tabIndex) =>
            tabIndex !== 0
                ? tab
                : {
                      ...tab,
                      rows: (tab.rows || []).map(tabRow => ({
                          ...tabRow,
                          ...(tabRow.facts && {
                              facts: tabRow.facts.map(fact => {
                                  const color = RELIEF_COLORS[fact.label];
                                  if (!color || fact.color) return fact;
                                  note(`figure "${fact.value}" (${fact.label}): colour ${color}`);
                                  return { ...fact, color };
                              })
                          })
                      }))
                  }
        );
        return { ...r, data: { ...r.data, tabs } };
    });
}

function geositesLead(rows, { note }) {
    const hero = rows[heroAt(rows)].data;
    const at = rows.findIndex(r => r && r.type === "title_and_text");
    const first = at >= 0 ? rows[at].data.text?.[0] : undefined;
    if (hero.lead || !first?.paragraph) return rows;
    note(`lead ← the first paragraph: "${short(first.paragraph)}"`);
    const text = [{ ...first, paragraph: "" }, ...rows[at].data.text.slice(1)];
    return withHero(rows, { lead: asParagraph(first.paragraph) }).map((r, i) => (i === at ? { ...r, data: { ...r.data, text } } : r));
}

function geositesPoints(rows, { note, titles }) {
    if (rows.some(r => r && r.type === "numbered_list")) return rows;
    const at = rows.findIndex(r => r && r.type === "title_and_text");
    const first = at >= 0 ? rows[at].data.text?.[0] : undefined;
    if (!first?.list?.length || first.paragraph) return rows;
    note(`"Co warto wiedzieć": the ${first.list.length} bullet points as a numbered list`);
    const points = row(
        "numbered_list",
        {
            title: "Co warto wiedzieć",
            intro: "",
            items: first.list.map(item => ({ title: "", place: "", text: asParagraph(item.item), image: "", image_author: "", link: "" })),
            more_title: "",
            more_items: []
        },
        titles
    );
    const rest = rows[at].data.text.slice(1);
    const kept = rest.length ? [{ ...rows[at], data: { ...rows[at].data, text: rest } }] : [];
    return [...rows.slice(0, at), points, ...kept, ...rows.slice(at + 1)];
}

function databaseNames(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "geosites_logos") return r;
        const logos = (r.data.logos || []).map(logo => {
            const name = DATABASE_NAMES[logo.name];
            if (!name) return logo;
            note(`database "${logo.name}" → "${name}"`);
            return { ...logo, name };
        });
        return { ...r, data: { ...r.data, logos } };
    });
}

function geoparkFigure(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "link_cards" || r.data.variant !== "lista boczna" || r.data.items?.length !== 1) return r;
        const [item] = r.data.items;
        if (item.image !== GEOPARK_PHOTO.from && !r.data.title) return r;
        const changes = [];
        let data = r.data;
        if (data.title) {
            changes.push(`no heading (was "${data.title}")`);
            data = { ...data, title: "" };
        }
        if (item.image === GEOPARK_PHOTO.from) {
            changes.push(`photo ${GEOPARK_PHOTO.to}`);
            data = { ...data, items: [{ ...item, image: GEOPARK_PHOTO.to }] };
        }
        note(`side card "${item.title}": ${changes.join(", ")}`);
        return { ...r, data };
    });
}

function zytkoQuote(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "tabs") return r;
        const tabs = (r.data.tabs || []).map(tab => ({
            ...tab,
            rows: (tab.rows || []).map(tabRow => {
                const at = (tabRow.paragraphs || []).findIndex(p => p && ZYTKO.test((p.paragraph || "").trim()));
                if (at < 0 || tabRow.quote) return tabRow;
                note(`"${tabRow.heading}": Kazimierz Żytko's sentence becomes the section's quote`);
                return {
                    ...tabRow,
                    paragraphs: tabRow.paragraphs.filter((_, i) => i !== at),
                    quote: "„Geologia jest kośćcem – rzeźba to tylko skóra”",
                    quote_author: "Kazimierz Żytko, PIG Kraków"
                };
            })
        }));
        return { ...r, data: { ...r.data, tabs } };
    });
}

function addSideList(rows, data, { note, titles }, label) {
    const sides = rows.filter(r => r && r.type === "link_cards" && r.data.variant === "lista boczna");
    if (sides.some(r => r.data.items?.some(item => item.link === data.items[0].link))) return rows;
    note(`${label}: ${data.items.map(item => `"${item.title}" → ${item.link}`).join(", ")}`);
    return [...rows, row("link_cards", data, titles)];
}

function budowaPlaces(rows, helpers) {
    return addSideList(rows, BUDOWA_PLACES, helpers, 'side list "Zobacz w terenie"');
}

function skarbyTop50(rows, helpers) {
    return addSideList(rows, SKARBY_TOP50, helpers, "side card");
}

function skarbyLead(rows, { note }) {
    const hero = rows[heroAt(rows)].data;
    const at = rows.findIndex(r => r && r.type === "numbered_list");
    if (hero.lead || at < 0 || !rows[at].data.intro) return rows;
    note(`lead ← the list intro: "${short(rows[at].data.intro)}"`);
    return withHero(rows, { lead: rows[at].data.intro }).map((r, i) => (i === at ? { ...r, data: { ...r.data, intro: "" } } : r));
}

/** The motto in a row of its own, which the front end shows beside the text. */
function skarbyMotto(rows, { note, titles }) {
    const at = rows.findIndex(r => r && r.type === "title_and_text" && (r.data.text || []).length > 1 && r.data.text.some(t => t.paragraph_class === "cytat"));
    if (at < 0) return rows;
    const text = rows[at].data.text;
    const quoteAt = text.findIndex(t => t.paragraph_class === "cytat");
    note(`motto in a row of its own (beside the text): "${short(text[quoteAt].paragraph)}"`);
    const parts = [
        text.slice(0, quoteAt).length ? { ...rows[at], data: { ...rows[at].data, text: text.slice(0, quoteAt) } } : undefined,
        row("title_and_text", { title: "", text: [text[quoteAt]] }, titles),
        text.slice(quoteAt + 1).length ? { ...rows[at], data: { ...rows[at].data, title: "", text: text.slice(quoteAt + 1) } } : undefined
    ].filter(Boolean);
    return [...rows.slice(0, at), ...parts, ...rows.slice(at + 1)];
}

function galleryLead(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "gallery_list" || r.data.intro) return r;
        note(`album list lead: "${short(GALLERY_LEAD)}"`);
        return { ...r, data: { ...r.data, intro: GALLERY_LEAD } };
    });
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const pages = db.collection("pages");
    const titles = await componentTitles(db);
    const report = [];
    const updates = [];

    for (const [pageUrl, changes] of Object.entries(CHANGES)) {
        const page = await pages.findOne({ pageUrl });
        if (!page || heroAt(page.rows) < 0) {
            report.push(`skip   "${pageUrl}": ${page ? "no page_hero" : "no such page"}`);
            continue;
        }
        const notes = [];
        let changed = false;
        const note = (text, keptOnly = false) => {
            notes.push(text);
            if (!keptOnly) changed = true;
        };
        let rows = page.rows;
        for (const change of changes) rows = change(rows, { pageUrl, note, titles });
        report.push(`${changed ? "update" : "ok    "} "${pageUrl}"`);
        notes.forEach(text => report.push(`         ${text}`));
        if (changed) updates.push({ _id: page._id, rows });
    }

    printReport("Mockup layout", report, apply);
    if (!apply || !updates.length) return;
    console.log(`backup: ${await backup(db, "mockup-layout", ["pages"])}`);
    for (const update of updates) await updatePageRows(db, update._id, update.rows);
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
