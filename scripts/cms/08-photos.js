// Step 8: the "Fotografie na stronie głównej" page and the home banner slides.
//
//   node scripts/cms/08-photos.js [--apply --db=<database>]
//
// The page lists one note per banner slide, in the slides' order:
// "Title = what the photo shows. Fot. Author / longer story". The author goes to the slide's
// `author`, the photo note and the story to its `description`; `place` comes from PLACES
// (written by hand – the notes have no separate place). Three credits run long – licence
// links, an e-mail – and the banner shows the credit in one line, so CREDITS shortens them
// to author, licence and source. The page then becomes its header
// and a `photos` grid that reads the banner, so the notes are kept in one place only.
//
// Idempotent: only empty slide fields are filled; the page is rebuilt only while it has no
// `photos` row.

const {
    withDb,
    backup,
    bumpContentVersion,
    printReport,
    componentTitles,
    row,
    updatePageRows,
    describeRows
} = require("./lib");

const PHOTOS_PAGE = "geosilesia-foto";

/** Slide places, in the slides' order; drafts to check in the panel. */
const PLACES = [
    "Katowice",
    "Wisła, Beskid Śląski",
    "Olsztyn koło Częstochowy",
    "Lisowice",
    "Tarnowskie Góry",
    "Zabrze",
    "Siewierz"
];

/** Shorter credits by slide number, where the note's credit runs long. */
const CREDITS = {
    2: "R. Pipala, CC BY-SA 3.0 PL",
    4: "D. Bogdanov, CC BY 3.0 (Lisowicia bojani); tło: M. Achtel 2014",
    7: "W. Bardziński; przekrój wg Rackiego i in. (1999, zmodyfikowany)"
};

const stripTags = html => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const fold = text => stripTags(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const firstWord = text => fold(text).split(/[^a-z0-9]+/).find(Boolean) || "";

/** "Title = caption. Fot. Author / story" → its parts; the caption and story are optional. */
function parseNote(html) {
    const text = stripTags(html);
    const slash = text.indexOf(" / ");
    const head = slash < 0 ? text : text.slice(0, slash);
    const story = slash < 0 ? "" : text.slice(slash + 3).trim();
    const fot = head.search(/\bFot\.\s*/);
    const author = fot < 0 ? "" : head.slice(fot).replace(/^Fot\.\s*/, "").replace(/[\s.]+$/, "").trim();
    const before = (fot < 0 ? head : head.slice(0, fot)).trim();
    const eq = before.indexOf(" = ");
    const title = (eq < 0 ? before : before.slice(0, eq)).replace(/\.$/, "").trim();
    const caption = eq < 0 ? "" : before.slice(eq + 3).trim();
    return { title, author, description: [caption, story].filter(Boolean).join(" ") };
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const report = [];
    const pages = db.collection("pages");
    const titles = await componentTitles(db);

    const home = await pages.findOne({ pageUrl: "/" });
    const bannerIndex = home.rows.findIndex(r => r && r.type === "homepage_banner");
    if (bannerIndex < 0) throw new Error("no homepage_banner on the home page");
    const banner = home.rows[bannerIndex];
    const slides = banner.data.slides || [];

    const page = await pages.findOne({ pageUrl: PHOTOS_PAGE });
    if (!page) throw new Error(`no page "${PHOTOS_PAGE}"`);
    const notes = page.rows
        .filter(r => r && r.type === "title_and_text")
        .flatMap(r => (r.data.text || []).flatMap(t => (t.list || []).map(item => item.item)))
        .map(parseNote);
    const rebuilt = page.rows.some(r => r && r.type === "photos");

    // The notes follow the slides' order; a slide whose note starts differently means the
    // two lists no longer match, and nothing is written.
    let changedSlides = 0;
    let newSlides = slides;
    if (!rebuilt) {
        if (notes.length !== slides.length) throw new Error(`${notes.length} notes for ${slides.length} slides`);
        const mismatch = slides.findIndex((slide, i) => firstWord(slide.text) !== firstWord(notes[i].title));
        if (mismatch >= 0) throw new Error(`slide ${mismatch + 1} "${slides[mismatch].text}" ≠ note "${notes[mismatch].title}"`);
    }
    newSlides = slides.map((slide, i) => {
        const note = notes[i] || { author: "", description: "" };
        const filled = {
            author: slide.author || CREDITS[i + 1] || note.author,
            place: slide.place || PLACES[i] || "",
            description: slide.description || note.description
        };
        const changes = Object.keys(filled).filter(key => filled[key] && filled[key] !== (slide[key] || ""));
        if (!changes.length) return slide;
        changedSlides++;
        report.push(`slide ${i + 1} "${slide.text}"`);
        changes.forEach(key => {
            const value = filled[key].length > 160 ? filled[key].slice(0, 157) + "…" : filled[key];
            const shortened = key === "author" && CREDITS[i + 1] && filled.author === CREDITS[i + 1] ? `  (shortened from: ${note.author})` : "";
            report.push(`    ${key}: ${value}${shortened}`);
        });
        return { ...slide, ...filled };
    });
    if (!changedSlides) report.push("ok     every slide has its author, place and description");

    let rows;
    if (!rebuilt) {
        const hero = page.rows.find(r => r && r.type === "page_hero");
        rows = [
            ...(hero ? [hero] : []),
            row(
                "photos",
                {
                    title: "",
                    intro: "",
                    variant: "siatka z podglądem",
                    source: "baner strony głównej",
                    catalogue: "",
                    link: "",
                    link_label: ""
                },
                titles
            )
        ];
        report.push(`update page "${PHOTOS_PAGE}": ${describeRows(page.rows)} → ${describeRows(rows)}`);
    } else {
        report.push(`ok     page "${PHOTOS_PAGE}" already has a photos row`);
    }

    printReport("Photos", report, apply);
    if (apply && (changedSlides || !rebuilt)) {
        console.log(`backup: ${await backup(db, "photos", ["pages"])}`);
        if (changedSlides) {
            const homeRows = home.rows.map((r, i) => (i === bannerIndex ? { ...r, data: { ...r.data, slides: newSlides } } : r));
            await updatePageRows(db, home._id, homeRows);
        }
        if (!rebuilt) await updatePageRows(db, page._id, rows);
        await bumpContentVersion(db);
    }
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
