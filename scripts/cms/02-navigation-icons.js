// Step 2: the navigation post and the map categories.
//
//   node scripts/cms/02-navigation-icons.js [--apply]
//
// Navigation: sections without their own address get one (variant C shows sections as
// plain links), plus the header button and the footer texts. Categories: the colour from
// the CMS spec, matched by the internal `category` key. Only empty fields are filled, so a
// value an editor has already set is never overwritten.

const { withDb, backup, bumpContentVersion, printReport } = require("./lib");

/** Section title → address it should open (the first subpage, or the new hub page). */
const SECTION_LINKS = {
    "O serwisie": "/geosilesia-o-nas",
    GeoŚląsk: "/polozenie-wojewodztwa-slaskiego",
    Słownik: "/geosilesia-slownik",
    "Baza wiedzy": "/baza-wiedzy"
};

const NAVIGATION_FIELDS = {
    cta_label: "Mapa atrakcji",
    cta_link: "/mapa-atrakcji",
    footer_text:
        "Edukacyjno-informacyjny serwis internetowy o dziedzictwie geologicznym, geomorfologicznym i poprzemysłowym województwa śląskiego.",
    footer_note: "GeoSilesia jest dostępna w sieci od 20 czerwca 2008 roku."
};

/** Category key (as markers store it) → colour name of the CMS select. */
const ICON_COLORS = {
    "geostanowiska projektowane": "czerwony",
    "geostanowiska inne": "zielony",
    "geostanowiska międzynarodowe": "niebieski",
    "obiekty poprzemysłowe": "czarny",
    "trasy podziemne": "brązowy",
    "uzdrowiska i obiekty lecznicze": "turkusowy",
    "muzea, ośrodki edukacyjne i dinoparki": "fioletowy",
    "ścieżki tematyczne": "żółty",
    "punkty widokowe": "pomarańczowy",
    "imprezy tematyczne": "różowy"
};

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const posts = db.collection("posts");
    const report = [];
    const writes = [];

    const nav = await posts.findOne({ type: "navigation" });
    if (!nav) throw new Error("no navigation post");
    const data = JSON.parse(JSON.stringify(nav.data || {}));
    for (const [key, value] of Object.entries(NAVIGATION_FIELDS)) {
        if (!data[key]) {
            data[key] = value;
            report.push(`navigation.${key} = "${value}"`);
        }
    }
    (data.nav || []).forEach(item => {
        const link = SECTION_LINKS[item.title];
        if (link && !item.link) {
            item.link = link;
            report.push(`navigation.nav["${item.title}"].link = "${link}"`);
        }
    });
    if (report.length) writes.push(() => posts.updateOne({ _id: nav._id }, { $set: { data, updated: Date.now() } }));

    const icons = await posts.find({ type: "icon" }).toArray();
    for (const icon of icons) {
        const color = ICON_COLORS[(icon.data && icon.data.category) || ""];
        if (!color) {
            report.push(`! icon "${icon.title}" has an unknown key "${icon.data && icon.data.category}" – left as is`);
        } else if (!icon.data.color) {
            report.push(`icon "${icon.title}" (${icon.data.category}).color = ${color}`);
            writes.push(() => posts.updateOne({ _id: icon._id }, { $set: { "data.color": color, updated: Date.now() } }));
        }
    }

    printReport("navigation and categories", report.length ? report : ["nothing to change"], apply);
    if (apply && writes.length) {
        console.log(`backup: ${await backup(db, "navigation-icons", ["posts"])}`);
        for (const write of writes) await write();
        await bumpContentVersion(db);
    }
    console.log(`\n${writes.length} post(s) ${apply ? "written" : "would change"}`);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
