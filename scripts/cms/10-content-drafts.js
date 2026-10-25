// Step 10: drafts of the variant C content on four GeoŚląsk pages, from the page text and
// the mockup ("C · Szlak"). They are drafts to read through in the panel, not final copy.
//
//   node scripts/cms/10-content-drafts.js [--only=skarby,geoparki,polozenie,rzezba] [--apply --db=<database>]
//
// - Skarby natury: the ten-item list becomes a `numbered_list` – the item text stays, the
//   names and places come from the mockup, photos from the home banner where the mockup has
//   one; the seven "a ponadto" items become its short side list (mockup wording, so their
//   longer text leaves the page). The motto becomes a quote paragraph.
// - Geoparki: the opening sentence becomes the lead, a `facts` strip and a `timeline` of
//   geoparks in Poland and the region (dates and links from the page text).
// - Położenie: a `facts` strip; border lengths and river basin shares as bar charts.
// - Rzeźba terenu: highest and lowest point, mean heights as a bar chart, the age of the
//   relief and the landscape classes as figures.
//
// Every figure is taken from the page text. Idempotent: a page is left alone once it has
// its new row; a tab row keeps facts or a chart it already has.

const { withDb, backup, bumpContentVersion, printReport, componentTitles, row, updatePageRows, describeRows } = require("./lib");

const stripTags = html => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const fold = text => stripTags(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const short = (text, max = 110) => (text.length > max ? text.slice(0, max - 1) + "…" : text);

// ---- Skarby natury ----

const SKARBY = "wojewodztwo-slaskie-cuda-natury";

/**
 * Names and places of the ten items, in the page's order (mockup wording). `match` must
 * appear in the item text, so a reordered list stops the script; `slide` is the home banner
 * slide whose photo the mockup shows for the item.
 */
const TREASURES = [
    { title: "Antyklina Siewierza", place: "Siewierz, Dziewki", match: "siewierza", slide: 7 },
    {
        title: "Węglonośny karbon Górnośląskiego Zagłębia Węglowego",
        place: "Dąbrowa Górnicza, Katowice-Brynów, Czerwionka-Leszczyny, Zabrze",
        match: "weglonosnych",
        slide: 6
    },
    { title: "Garb Tarnogórski", place: "od Tarnowskich Gór po Sławków", match: "garbu tarnogorskiego", slide: 5 },
    { title: "Próg Woźnicki", place: "Lipie Śląskie, Patoka, Woźniki, Poręba", match: "progu woznickiego", slide: 4 },
    { title: "Częstochowskie Zagłębie Rudonośne", place: "od Zawiercia po Wieluń", match: "zaglebie rudonosne" },
    { title: "Wyżyna Częstochowska", place: "Olsztyn, Kusięta, Piaseczno", match: "wyzyny czestochowskiej", slide: 3 },
    { title: "Flisz wapienny płaszczowiny cieszyńskiej", place: "Cieszyn, Goleszów, okolice Żywca", match: "plaszczowiny cieszynskiej" },
    { title: "Skałki i wodospady Beskidów", place: "Beskid Śląski, Mały i Żywiecki", match: "wodospad", slide: 2 },
    { title: "Osuwiska i jaskinie niekrasowe", place: "Beskid Śląski", match: "osuwiska", slide: undefined },
    { title: "Pustynia Błędowska", place: "pogranicze z woj. małopolskim", match: "pustynia bledowska" }
];

/** The "a ponadto" items in the mockup's short wording, in the page's order. */
const MORE = [
    ["Przełomowe odcinki Liswarty i Warty, przemodelowane przez lądolód Warty", "liswarty"],
    ["Kuesta jurajska – próg skalny i punkt widokowy", "kuesta"],
    ["Kontynentalny dział wodny wzdłuż południowej granicy", "dzial wodny"],
    ["Masyw Pilska z najwyższym punktem województwa", "pilska"],
    ["Graniczny Meander Odry w gminie Krzyżanowice", "meander odry"],
    ["Przełomy Warty pod Mstowem i Białej Przemszy pod Okradzionowem", "mstowem"],
    ["Górnośląskie Pojezierze Antropogeniczne", "pojezierza antropogenicznego"]
];

/** A list item as a stand-alone paragraph: capital letter, full stop. */
function sentence(item) {
    const text = String(item || "").trim().replace(/;$/, ".");
    return `<p>${text.charAt(0).toUpperCase()}${text.slice(1)}</p>`;
}

function skarby(page, ctx) {
    if (page.rows.some(r => r && r.type === "numbered_list")) return { done: "has a numbered_list" };
    const texts = page.rows.filter(r => r && r.type === "title_and_text");
    const main = texts.find(r => (r.data.text || []).some(t => (t.list || []).length === TREASURES.length));
    const more = texts.find(r => (r.data.text || []).some(t => /a ponadto/i.test(stripTags(t.paragraph))));
    if (!main || !more) throw new Error(`${SKARBY}: the ten-item list or the "a ponadto" list is missing`);
    const mainBlock = main.data.text.find(t => (t.list || []).length === TREASURES.length);
    const moreBlock = more.data.text.find(t => /a ponadto/i.test(stripTags(t.paragraph)));

    const items = mainBlock.list.map((entry, i) => {
        const spec = TREASURES[i];
        if (!fold(entry.item).includes(spec.match)) throw new Error(`${SKARBY}: item ${i + 1} is not "${spec.title}"`);
        // The first item reads "antyklinę Siewierza, gdzie…" after "należy wymienić:".
        const text = i === 0 ? entry.item.replace(/^antyklinę/, "antyklina") : entry.item;
        const slide = spec.slide ? ctx.slides[spec.slide - 1] : undefined;
        return {
            title: spec.title,
            place: spec.place,
            text: sentence(text),
            image: (slide && slide.image) || "",
            image_author: (slide && slide.author) || "",
            link: ""
        };
    });
    if ((moreBlock.list || []).length !== MORE.length) throw new Error(`${SKARBY}: ${moreBlock.list.length} "a ponadto" items, expected ${MORE.length}`);
    const moreItems = moreBlock.list.map((entry, i) => {
        if (!fold(entry.item).includes(MORE[i][1])) throw new Error(`${SKARBY}: "a ponadto" item ${i + 1} is not "${MORE[i][0]}"`);
        return { text: MORE[i][0], link: "" };
    });

    const list = row(
        "numbered_list",
        {
            title: "",
            intro: `<p>${mainBlock.paragraph}</p>`,
            items,
            more_title: "A ponadto",
            more_items: moreItems
        },
        ctx.titles
    );
    // The motto "Pamiętaj że <b>„…”</b>" becomes a quote paragraph.
    let motto;
    const rest = page.rows
        .filter(r => r !== main && r !== more)
        .map(r => {
            if (!r || r.type !== "title_and_text") return r;
            const text = (r.data.text || []).map(t => {
                const found = /^Pamiętaj,? że\s*<b>(.*)<\/b>\s*$/i.exec(String(t.paragraph || "").trim());
                if (!found) return t;
                motto = found[1].trim();
                return { ...t, paragraph: motto, paragraph_class: "cytat" };
            });
            return { ...r, data: { ...r.data, text } };
        });
    const heroAt = rest.findIndex(r => r && r.type === "page_hero");
    const rows = [...rest.slice(0, heroAt + 1), list, ...rest.slice(heroAt + 1)];

    const lines = items.map(
        (item, i) =>
            `  ${String(i + 1).padStart(2)}. ${item.title} · ${item.place}${item.image ? ` · photo ${item.image}${item.image_author ? "" : " (no author yet – run 08 first)"}` : ""}\n         ${short(stripTags(item.text))}`
    );
    lines.push(`  a ponadto: ${moreItems.map(item => item.text).join(" | ")}`);
    if (motto) lines.push(`  quote paragraph: ${motto}`);
    lines.push(`  removed from the page: the longer text of the ${moreItems.length} "a ponadto" items (kept in the backup)`);
    return { rows, lines };
}

// ---- Geoparki ----

const GEOPARKI = "geoparki";
const OPENING = "Najprościej można powiedzieć, że geoparki to „muzea pod chmurką”.";

const GEOPARK_FACTS = {
    title: "",
    items: [
        { value: "241", label: "Światowych Geoparków UNESCO w 51 krajach", auto: "" },
        { value: "3", label: "Światowe Geoparki UNESCO w Polsce", auto: "" },
        { value: "2", label: "Geoparki Krajowe w Polsce", auto: "" }
    ],
    source: "Stan z 20.08.2026"
};

/** [year, name, note, in the region, link] – from the page text. */
const GEOPARK_TIMELINE = [
    ["2000", "Propozycja: Geopark Jurajski", "województwo śląskie", true, ""],
    ["2010", "Geopark Krajowy Góra Świętej Anny", "od 1 czerwca 2010 r.", false, ""],
    ["2010", "Geopark Krajowy Karkonoski Park Narodowy z otuliną", "od 10 września 2010 r.", false, ""],
    ["2011", "Geo-Park Glinka w Ujsołach", "inicjatywa lokalna", true, "https://geopark.com.pl"],
    ["2013", "Propozycja: Geopark Beskid Śląsko-Morawsko-Żywiecki", "województwo śląskie", true, ""],
    ["2013", "Kamieniołom Lipówka w Rudnikach", "inicjatywa lokalna", true, "https://redziny.pl/dla-turystow/kamieniolom-lipowka/"],
    ["2014", "Ośrodek Edukacji Ekologiczno-Geologicznej GEOsfera w Jaworznie", "inicjatywa lokalna", true, "https://www.facebook.com/geosfera/?locale=pl_PL"],
    ["2015", "Geopark Łuk Mużakowa – Światowy Geopark UNESCO", "transgraniczny (Niemcy i Polska), od 17 listopada 2015 r.", false, "https://www.luk-muzakowa.pl/"],
    ["2016", "Propozycja: Geopark Północnej Jury", "województwo śląskie, prace są kontynuowane", true, "/geopark-połnocnej-jury"],
    ["2021", "Geopark Świętokrzyski – Światowy Geopark UNESCO", "od 21 kwietnia 2021 r.", false, "https://geopark.pl/"],
    ["2023", "Geopark w Zabrzu-Grzybowicach", "inicjatywa lokalna", true, "https://miastozabrze.pl/2023/06/02/zabrzanski-geopark-w-grzybowicach-juz-gotowy/"],
    ["2024", "Geopark Kraina Wygasłych Wulkanów – Światowy Geopark UNESCO", "od 27 marca 2024 r.", false, "https://www.gorykaczawskie.pl/o-geoparku/"]
];

function geoparki(page, ctx) {
    if (page.rows.some(r => r && r.type === "timeline")) return { done: "has a timeline" };
    const lines = [];
    let rows = page.rows.map(r => r);
    const heroAt = rows.findIndex(r => r && r.type === "page_hero");
    if (heroAt < 0) throw new Error(`${GEOPARKI}: no page_hero`);

    // The opening sentence moves from the text to the lead.
    if (!rows[heroAt].data.lead) {
        rows = rows.map(r => {
            if (!r || r.type !== "title_and_text") return r;
            const text = (r.data.text || []).filter(t => stripTags(t.paragraph) !== OPENING);
            return text.length === (r.data.text || []).length ? r : { ...r, data: { ...r.data, text } };
        });
        rows[heroAt] = { ...rows[heroAt], data: { ...rows[heroAt].data, lead: `<p>${OPENING}</p>` } };
        lines.push(`  lead: ${OPENING} (removed from the text)`);
    }
    const timeline = row(
        "timeline",
        {
            title: "Geoparki w Polsce i w regionie",
            intro: "",
            items: GEOPARK_TIMELINE.map(([year, title, note, highlight, link]) => ({ year, title, note, highlight, link }))
        },
        ctx.titles
    );
    rows = [...rows.slice(0, heroAt + 1), row("facts", GEOPARK_FACTS, ctx.titles), ...rows.slice(heroAt + 1), timeline];

    lines.push(`  facts: ${GEOPARK_FACTS.items.map(item => `${item.value} ${item.label}`).join(" | ")} (${GEOPARK_FACTS.source})`);
    GEOPARK_TIMELINE.forEach(([year, title, note, highlight]) => lines.push(`  ${year} ${highlight ? "●" : "○"} ${title} – ${note}`));
    return { rows, lines };
}

// ---- Tabs: Położenie and Rzeźba terenu ----

/** Additions to tab rows, found by the row's heading. */
function withTabAdditions(page, additions) {
    const tabsAt = page.rows.findIndex(r => r && r.type === "tabs");
    if (tabsAt < 0) throw new Error(`${page.pageUrl}: no tabs row`);
    const tabsRow = page.rows[tabsAt];
    const lines = [];
    const found = new Set();
    const tabs = (tabsRow.data.tabs || []).map(tab => ({
        ...tab,
        rows: (tab.rows || []).map(tabRow => {
            const addition = additions.find(a => a.heading === tabRow.heading);
            if (!addition) return tabRow;
            found.add(addition.heading);
            const next = { ...tabRow };
            if (addition.facts && !(tabRow.facts || []).length) {
                next.facts = addition.facts;
                lines.push(`  ${addition.heading}: figures ${addition.facts.map(f => `${f.value} ${f.label}${f.note ? ` (${f.note})` : ""}`).join(" | ")}`);
            }
            if (addition.chart && !(tabRow.chart || []).length) {
                Object.assign(next, addition.chart);
                lines.push(
                    `  ${addition.heading}: chart "${addition.chart.chart_title}" ${addition.chart.chart
                        .map(bar => `${bar.label} ${String(bar.value).replace(".", ",")}${bar.highlight ? "*" : ""}`)
                        .join(" | ")} ${addition.chart.chart_unit}`
                );
            }
            return next;
        })
    }));
    additions.filter(a => !found.has(a.heading)).forEach(a => lines.push(`  skip: no tab row headed "${a.heading}"`));
    const rows = page.rows.map((r, i) => (i === tabsAt ? { ...r, data: { ...r.data, tabs } } : r));
    return { rows, lines, changed: lines.some(line => !line.startsWith("  skip")) };
}

const POLOZENIE = "polozenie-wojewodztwa-slaskiego";

const POLOZENIE_FACTS = {
    title: "",
    items: [
        { value: "12 334 km²", label: "powierzchnia, 3,9% kraju", auto: "" },
        { value: "14.", label: "miejsce w Polsce pod względem powierzchni", auto: "" },
        { value: "167", label: "gmin", auto: "" },
        { value: "19", label: "miast na prawach powiatu", auto: "" },
        { value: "17", label: "powiatów", auto: "" }
    ],
    source: "Dane: GUS (1 stycznia 2025), WODGiK (2026)"
};

const POLOZENIE_TABS = [
    {
        heading: "Położenie administracyjne",
        chart: {
            chart_title: "Długość granic województwa",
            chart_unit: "km",
            chart: [
                { label: "z woj. małopolskim", value: 291, highlight: false },
                { label: "z woj. opolskim", value: 240, highlight: false },
                { label: "z Czechami", value: 150, highlight: true },
                { label: "z woj. łódzkim", value: 145, highlight: false },
                { label: "z woj. świętokrzyskim", value: 119, highlight: false },
                { label: "ze Słowacją", value: 87, highlight: true }
            ],
            chart_source: "Wyróżniona granica państwowa. Źródło: WODGiK, 2026."
        }
    },
    {
        heading: "Położenie fizycznogeograficzne",
        facts: [{ value: "4 z 6", label: "pasów krajobrazowych Polski", note: "jedyne takie województwo w kraju" }]
    },
    {
        heading: "Położenie hydrograficzne",
        chart: {
            chart_title: "Udział dorzeczy w powierzchni województwa",
            chart_unit: "%",
            chart: [
                { label: "Odra (zlewisko Morza Bałtyckiego)", value: 55.3, highlight: false },
                { label: "Wisła (zlewisko Morza Bałtyckiego)", value: 44.3, highlight: false },
                { label: "Dunaj (zlewisko Morza Czarnego)", value: 0.2, highlight: true }
            ],
            chart_source: ""
        }
    }
];

function polozenie(page, ctx) {
    const hasFacts = page.rows.some(r => r && r.type === "facts");
    const tabs = withTabAdditions(page, POLOZENIE_TABS);
    if (hasFacts && !tabs.changed) return { done: "has its figures and charts" };
    let rows = tabs.rows;
    const lines = [...tabs.lines];
    if (!hasFacts) {
        const heroAt = rows.findIndex(r => r && r.type === "page_hero");
        rows = [...rows.slice(0, heroAt + 1), row("facts", POLOZENIE_FACTS, ctx.titles), ...rows.slice(heroAt + 1)];
        lines.unshift(`  facts: ${POLOZENIE_FACTS.items.map(item => `${item.value} ${item.label}`).join(" | ")} (${POLOZENIE_FACTS.source})`);
    }
    return { rows, lines };
}

const RZEZBA = "rzezba-terenu-wojewodztwa-slaskiego";

const RZEZBA_TABS = [
    {
        heading: "Układ pionowy rzeźby terenu",
        facts: [
            { value: "1534,55 m n.p.m.", label: "najwyższy punkt", note: "Góra Pięciu Kopców w masywie Pilska (gm. Jeleśnia)" },
            { value: "171,8 m n.p.m.", label: "najniższy punkt", note: "brzeg Odry, gm. Kuźnia Raciborska" },
            { value: "1362,75 m", label: "różnica wysokości", note: "w Polsce ok. 2501 m" }
        ],
        chart: {
            chart_title: "Średnia wysokość nad poziomem morza",
            chart_unit: "m n.p.m.",
            chart: [
                { label: "Województwo śląskie", value: 315, highlight: true },
                { label: "Europa", value: 292, highlight: false },
                { label: "Polska", value: 173, highlight: false }
            ],
            chart_source: ""
        }
    },
    {
        heading: "Wiek bezwzględny rzeźby terenu",
        facts: [{ value: "65 mln lat", label: "wiek dzisiejszej rzeźby terenu", note: "kształtuje się od początku kenozoiku (Gilewska 1997)" }]
    },
    {
        heading: "Krajobraz naturalny",
        facts: [
            { value: "4 z 4", label: "klas krajobrazu naturalnego Polski", note: "" },
            { value: "9 z 14", label: "rodzajów krajobrazu naturalnego Polski", note: "" }
        ]
    }
];

function rzezba(page) {
    const tabs = withTabAdditions(page, RZEZBA_TABS);
    return tabs.changed ? { rows: tabs.rows, lines: tabs.lines } : { done: "has its figures and charts" };
}

const STEPS = [
    ["skarby", SKARBY, skarby],
    ["geoparki", GEOPARKI, geoparki],
    ["polozenie", POLOZENIE, polozenie],
    ["rzezba", RZEZBA, rzezba]
];

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const only = (process.argv.find(arg => arg.startsWith("--only=")) || "").slice("--only=".length).split(",").filter(Boolean);
    const unknown = only.filter(name => !STEPS.some(([key]) => key === name));
    if (unknown.length) throw new Error(`unknown --only: ${unknown.join(", ")}`);

    const pages = db.collection("pages");
    const home = await pages.findOne({ pageUrl: "/" });
    const banner = home.rows.find(r => r && r.type === "homepage_banner");
    const ctx = { titles: await componentTitles(db), slides: (banner && banner.data.slides) || [] };

    const writes = [];
    for (const [key, pageUrl, build] of STEPS) {
        if (only.length && !only.includes(key)) continue;
        const page = await pages.findOne({ pageUrl });
        if (!page) {
            printReport(key, [`skip: no page "${pageUrl}"`], apply);
            continue;
        }
        const result = build(page, ctx);
        if (result.done) {
            printReport(key, [`ok     page "${pageUrl}" ${result.done}`], apply);
            continue;
        }
        printReport(key, [`update page "${pageUrl}": ${describeRows(page.rows)} → ${describeRows(result.rows)}`, ...result.lines], apply);
        writes.push([page._id, result.rows]);
    }

    if (apply && writes.length) {
        console.log(`backup: ${await backup(db, "content-drafts", ["pages"])}`);
        for (const [id, rows] of writes) await updatePageRows(db, id, rows);
        await bumpContentVersion(db);
    }
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
