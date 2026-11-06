// Step 3: the two new pages and the new home page.
//
//   node scripts/cms/03-pages.js [--apply --db=<database>]
//
// - `mapa-atrakcji`: the `map` row moves here from the home page, unchanged.
// - `baza-wiedzy`: page header and the full knowledge base (all sections).
// - Home page: banner → search card → stats → categories → TOP 50 preview → "Poznaj
//   region" → photo strip → events and knowledge base previews.
// - Rows without a type (an empty row on galeria/barania-gora) are removed.
//
// Idempotent: a page that exists is not created again, and the home page is rebuilt only
// while it still holds the `map` row.

const {
    withDb,
    backup,
    bumpContentVersion,
    printReport,
    componentTitles,
    row,
    insertPage,
    updatePageRows,
    describeRows
} = require("./lib");

const MAP_PAGE = "mapa-atrakcji";
const KB_PAGE = "baza-wiedzy";
const TOP50_PAGE = "/geosilesia-top-atrakcje-geoturystyczne";
const GALLERY_PAGE = "/geosilesia-galeria";
const EVENTS_PAGE = "/geosilesia-wydarzenia";

function homeRows(banner, titles) {
    return [
        row("homepage_banner", { ...banner.data, eyebrow: banner.data.eyebrow || "Serwis edukacyjno-informacyjny" }, titles),
        row("map_search", { title: "", map_link: `/${MAP_PAGE}`, button_label: "Szukaj na mapie" }, titles),
        row(
            "facts",
            {
                title: "",
                items: [
                    { value: "", label: "obiektów i atrakcji", auto: "obiekty na mapie" },
                    { value: "", label: "kategorii na mapie", auto: "kategorie" },
                    { value: "", label: "miejsc w zestawieniu TOP 50", auto: "TOP 50" },
                    { value: "", label: "albumów w galerii", auto: "albumy" }
                ],
                source: ""
            },
            titles
        ),
        row(
            "category_grid",
            { title: "Co chcesz zobaczyć?", intro: "", map_link: `/${MAP_PAGE}`, link_label: "Wszystkie kategorie na mapie" },
            titles
        ),
        row(
            "top50",
            {
                title: "50 miejsc, które trzeba zobaczyć",
                intro: "",
                variant: "zapowiedź",
                limit: 7,
                link: TOP50_PAGE,
                link_label: "Cała trasa TOP 50"
            },
            titles
        ),
        row(
            "link_cards",
            {
                title: "Poznaj region",
                intro: "Zanim wyruszysz w teren: położenie, rzeźba, skały i najcenniejsze miejsca województwa śląskiego.",
                variant: "karty",
                items: [
                    {
                        title: "Położenie",
                        description: "Gdzie leży województwo i jakie krainy obejmuje.",
                        image: "/uploads/bobolice2_2016.png",
                        link: "/polozenie-wojewodztwa-slaskiego",
                        color: "niebieski"
                    },
                    {
                        title: "Rzeźba terenu",
                        description: "Wyżyny, kotliny i Karpaty — jak powstał krajobraz.",
                        image: "/uploads/Kaskady_Rodła.jpg",
                        link: "/rzezba-terenu-wojewodztwa-slaskiego",
                        color: "zielony"
                    },
                    {
                        title: "Budowa geologiczna",
                        description: "Skały, skamieniałości i kopaliny dziewięciu okresów.",
                        image: "/uploads/nowa_wioska2 kopia.jpg",
                        link: "/budowa-geologiczna-wojewodztwa-slaskiego",
                        color: "czerwony"
                    },
                    {
                        title: "Skarby natury",
                        description: "Najcenniejsze twory przyrody nieożywionej.",
                        image: "/uploads/37_11.jpg",
                        link: "/wojewodztwo-slaskie-cuda-natury",
                        color: "żółty"
                    }
                ]
            },
            titles
        ),
        row(
            "photos",
            {
                title: "Region w obiektywie",
                intro: "",
                variant: "pasek",
                source: "baner strony głównej",
                catalogue: "",
                link: GALLERY_PAGE,
                link_label: "Galeria"
            },
            titles
        ),
        row(
            "news",
            { title: "Wydarzenia", intro: "", variant: "zapowiedź", limit: 3, link: EVENTS_PAGE, link_label: "Wszystkie" },
            titles
        ),
        row(
            "knowledge_base",
            { title: "Baza wiedzy", intro: "", variant: "zapowiedź", section: "wszystkie", link: `/${KB_PAGE}` },
            titles
        )
    ];
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const pages = db.collection("pages");
    const titles = await componentTitles(db);
    const missing = ["page_hero", "map_search", "facts", "category_grid", "top50", "link_cards", "photos", "knowledge_base"].filter(
        type => !titles[type]
    );
    if (missing.length && apply) throw new Error(`components missing: ${missing.join(", ")} – run 01-definitions.js --apply first`);

    const report = [];
    const writes = [];

    const home = await pages.findOne({ pageUrl: "/" });
    const mapRow = home && (home.rows || []).find(r => r && r.type === "map");
    const banner = home && (home.rows || []).find(r => r && r.type === "homepage_banner");

    const mapPage = await pages.findOne({ pageUrl: MAP_PAGE });
    if (!mapPage) {
        if (!mapRow) throw new Error("the home page has no map row to move");
        const rows = [mapRow];
        report.push(`create page "${MAP_PAGE}": ${describeRows(rows)}`);
        writes.push(() =>
            insertPage(db, {
                title: "Mapa atrakcji",
                pageUrl: MAP_PAGE,
                seoTitle: "Mapa atrakcji",
                seoDescription:
                    "Mapa atrakcji geoturystycznych województwa śląskiego: obiekty geologiczne, geomorfologiczne, wodne i poprzemysłowe z wyszukiwaniem od najbliższych.",
                rows
            })
        );
    } else {
        report.push(`ok     page "${MAP_PAGE}" exists`);
    }

    if (!(await pages.findOne({ pageUrl: KB_PAGE }))) {
        const rows = [
            row(
                "page_hero",
                {
                    title: "Baza wiedzy",
                    lead: "Wybrane podcasty, publikacje, filmy, animacje, mapy i serwisy o geologii i dziedzictwie górniczym.",
                    image: "",
                    image_caption: "",
                    image_author: "",
                    author: "",
                    published: "",
                    updated: ""
                },
                titles
            ),
            row("knowledge_base", { title: "", intro: "", variant: "pełna", section: "wszystkie", link: "" }, titles)
        ];
        report.push(`create page "${KB_PAGE}": ${describeRows(rows)}`);
        writes.push(() =>
            insertPage(db, {
                title: "Baza wiedzy",
                pageUrl: KB_PAGE,
                seoTitle: "Baza wiedzy",
                seoDescription:
                    "Podcasty, publikacje, filmy, animacje, mapy online i wirtualne muzea o geologii i dziedzictwie górniczym.",
                rows
            })
        );
    } else {
        report.push(`ok     page "${KB_PAGE}" exists`);
    }

    if (home && mapRow && banner) {
        const rows = homeRows(banner, titles);
        report.push(`update page "/": ${describeRows(home.rows)}\n        → ${describeRows(rows)}`);
        writes.push(() => updatePageRows(db, home._id, rows));
    } else {
        report.push(`ok     page "/" already rebuilt (${describeRows(home && home.rows)})`);
    }

    const withEmptyRows = await pages.find({ rows: { $elemMatch: { $or: [{ type: "" }, { type: { $exists: false } }] } } }).toArray();
    for (const page of withEmptyRows) {
        const rows = page.rows.filter(r => r && r.type);
        report.push(`update page "${page.pageUrl}": remove ${page.rows.length - rows.length} row(s) without a type`);
        writes.push(() => updatePageRows(db, page._id, rows));
    }

    printReport("pages", report, apply);
    if (apply && writes.length) {
        console.log(`backup: ${await backup(db, "pages", ["pages", "counters"])}`);
        for (const write of writes) await write();
        await bumpContentVersion(db);
    }
    console.log(`\n${writes.length} change(s) ${apply ? "written" : "would be made"}`);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
