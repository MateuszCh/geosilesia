// Step 14: the column beside the text on Geostanowiska and Geoparki, as in the mockup.
//
//   node scripts/cms/14-side-cards.js [--apply --db=<database>]
//
// Since the section menu moved under the header, article pages fill the column beside the
// text with their own content. The front end places link cards set to "lista boczna" and the
// geosite databases there.
// - Geostanowiska: the databases get their names (the logos stood in for them), and a card
//   leads to the geological sites on the map.
// - Geoparki: a card for the Geopark Północnej Jury page, with a photo from Olsztyn commune,
//   which the geopark covers.
//
// Idempotent: a page that already has a side card list is left alone; names already filled
// in are kept.

const { withDb, backup, bumpContentVersion, printReport, componentTitles, row, updatePageRows } = require("./lib");

/** Database names by the host of their link. */
const DATABASE_NAMES = {
    "geostanowiska.pgi.gov.pl": "Centralny Rejestr Geostanowisk Polski",
    "geoportal.pgi.gov.pl": "Centralna Baza Danych Geologicznych",
    "geolog.pgi.gov.pl": "GeoLOG"
};

const SIDE_CARDS = {
    "geosilesia-geostanowiska": {
        title: "Zobacz w terenie",
        intro: "",
        variant: "lista boczna",
        items: [
            {
                title: "Obiekty geologiczne w regionie",
                description: "Geostanowiska i odsłonięcia na mapie atrakcji",
                image: "",
                link: "/mapa-atrakcji?kategoria=geostanowiska projektowane",
                color: "czerwony"
            }
        ]
    },
    geoparki: {
        title: "Zobacz w terenie",
        intro: "",
        variant: "lista boczna",
        items: [
            {
                title: "Geopark Północnej Jury",
                description: "Prace nad geoparkiem w siedmiu gminach północnej części Wyżyny Częstochowskiej są kontynuowane.",
                image: "/uploads/pletwa_20210914.jpg",
                link: "/geopark-połnocnej-jury",
                color: "czerwony"
            }
        ]
    }
};

const hostOf = link => {
    try {
        return new URL(link).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
};

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const report = [];
    const pages = db.collection("pages");
    const titles = await componentTitles(db);
    const updates = [];

    for (const [pageUrl, cards] of Object.entries(SIDE_CARDS)) {
        const page = await pages.findOne({ pageUrl });
        if (!page) {
            report.push(`skip   no page "${pageUrl}"`);
            continue;
        }
        let rows = page.rows;
        const notes = [];

        // Database names.
        rows = rows.map(r => {
            if (!r || r.type !== "geosites_logos") return r;
            const logos = (r.data.logos || []).map(logo => {
                const name = DATABASE_NAMES[hostOf(logo.link)];
                if (logo.name || !name) return logo;
                notes.push(`database ${hostOf(logo.link)}: name "${name}"`);
                return { ...logo, name };
            });
            return { ...r, data: { ...r.data, logos } };
        });

        // The side card list, after the last row.
        if (rows.some(r => r && r.type === "link_cards" && r.data.variant === "lista boczna")) {
            notes.push("side cards: already there");
        } else {
            rows = [...rows, row("link_cards", cards, titles)];
            cards.items.forEach(card =>
                notes.push(`side card "${card.title}" → ${card.link}${card.image ? ` (photo ${card.image})` : ""}: ${card.description}`)
            );
        }

        const changed = notes.some(note => !note.endsWith("already there"));
        report.push(`${changed ? "update" : "ok    "} page "${pageUrl}"`);
        notes.forEach(note => report.push(`         ${note}`));
        if (changed) updates.push({ _id: page._id, rows });
    }

    printReport("Side cards", report, apply);
    if (!apply || !updates.length) return;
    console.log(`backup: ${await backup(db, "side-cards", ["pages"])}`);
    for (const update of updates) await updatePageRows(db, update._id, update.rows);
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
