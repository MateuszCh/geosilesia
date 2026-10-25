// Step 11: photos for the page headers – a proposal to accept or change in the panel.
//
//   node scripts/cms/11-header-photos.js [--apply --db=<database>]
//
// The header photo spans the whole width, so it needs a large file. Album covers are
// 750×600 and would look blurred; the seven home banner photos are 1920×1080, and the
// mockup uses them too (Budowa geologiczna: the unconformity in Siewierz). Each page below
// gets the banner photo closest to its subject, with a caption and the author from the
// "Fotografie" notes. Rzeźba terenu has no matching large photo, and Skarby natury already
// shows six of the banner photos in its list; both stay without one.
//
// Idempotent: a header that already has a photo is left alone.

const { withDb, backup, bumpContentVersion, printReport, updatePageRows } = require("./lib");

/** [page, photo, caption ("Na zdjęciu: …" is added by the front end), author] */
const PROPOSALS = [
    ["budowa-geologiczna-wojewodztwa-slaskiego", "/uploads/nowa_wioska2 kopia.jpg", "niezgodność kątowa trias – dewon w Siewierzu", "W. Bardziński"],
    [
        "dziedzictwo-geologiczne-wojewodztwa-slaskiego",
        "/uploads/Zabytkowa Kopalnia Srebra w Tarnowskich Górach.jpg",
        "Zabytkowa Kopalnia Srebra w Tarnowskich Górach (UNESCO)",
        "ze zbiorów Stowarzyszenia Miłośników Ziemi Tarnogórskiej"
    ],
    [
        "polozenie-wojewodztwa-slaskiego",
        "/uploads/Kaskady_Rodła.jpg",
        "Kaskady Rodła na Białej Wisełce, w obszarze źródliskowym Wisły",
        "R. Pipala, CC BY-SA 3.0 PL"
    ],
    ["geoparki", "/uploads/olsztyn_marektecza.jpg", "Góra Zamek w Olsztynie koło Częstochowy", "Marek Tęcza"],
    [
        "geosilesia-top-atrakcje-geoturystyczne",
        "/uploads/sztolnia_krolowa_luiza.jpg",
        "Sztolnia Królowa Luiza w Zabrzu",
        "ze zbiorów Muzeum Górnictwa Węglowego w Zabrzu"
    ]
];

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const report = [];
    const pages = db.collection("pages");
    const files = db.collection("files");
    const writes = [];

    for (const [pageUrl, image, caption, author] of PROPOSALS) {
        const page = await pages.findOne({ pageUrl });
        const heroAt = page ? page.rows.findIndex(r => r && r.type === "page_hero") : -1;
        if (heroAt < 0) {
            report.push(`skip   ${pageUrl}: ${page ? "no page_hero" : "no such page"}`);
            continue;
        }
        const hero = page.rows[heroAt].data;
        if (hero.image) {
            report.push(`ok     ${pageUrl} has a photo (${hero.image})`);
            continue;
        }
        if (!(await files.findOne({ src: image }))) {
            report.push(`skip   ${pageUrl}: ${image} is not among the uploaded files`);
            continue;
        }
        const data = { ...hero, image, image_caption: caption, image_author: author };
        writes.push([page._id, page.rows.map((r, i) => (i === heroAt ? { ...r, data } : r))]);
        report.push(`photo  ${pageUrl}: ${image}\n           Na zdjęciu: ${caption} · Fot. ${author}`);
    }

    printReport("Header photos", report, apply);
    if (apply && writes.length) {
        console.log(`backup: ${await backup(db, "header-photos", ["pages"])}`);
        for (const [id, rows] of writes) await updatePageRows(db, id, rows);
        await bumpContentVersion(db);
    }
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
