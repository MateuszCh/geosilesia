// Step 27: Geostanowiska's "Zobacz w terenie" side list leads to more map categories.
//
//   node scripts/cms/27-geosites-map-cards.js [--apply --db=<database>]
//
// Next to "Obiekty geologiczne w regionie" (step 14) the list gets cards for the
// geomorphological sites, the water sites and the underground routes, each opening the
// attractions map filtered to its category, in its category's colour. Since step 18 the list
// is in the page's side column ("Kolumna boczna"). `updated` of the page stays.
//
// Idempotent: a card whose link is already on the list is not added again.

const { withDb, backup, bumpContentVersion, printReport } = require("./lib");

const PAGE_URL = "geosilesia-geostanowiska";

/** In the order of the map's category list; `category` is the map filter, `color` its colour. */
const CARDS = [
    {
        title: "Obiekty geomorfologiczne w regionie",
        description: "Skałki, jaskinie i formy rzeźby terenu na mapie atrakcji",
        category: "geostanowiska inne",
        color: "zielony"
    },
    {
        title: "Obiekty wodne w regionie",
        description: "Źródła, wodospady i kaskady na mapie atrakcji",
        category: "geostanowiska międzynarodowe",
        color: "niebieski"
    },
    {
        title: "Trasy podziemne w regionie",
        description: "Udostępnione jaskinie, sztolnie i kopalnie na mapie atrakcji",
        category: "trasy podziemne",
        color: "brązowy"
    }
];

const isSideList = component => component?.type === "link_cards" && component.data?.variant === "lista boczna";

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const pages = db.collection("pages");
    const report = [];

    // The map categories exist under these names, with these colours.
    const icons = await db.collection("posts").find({ type: "icon" }).toArray();
    for (const card of CARDS) {
        const icon = icons.find(i => i.data?.category === card.category);
        if (!icon) throw new Error(`no map category "${card.category}"`);
        if (icon.data.color !== card.color) report.push(`note   "${card.category}" has colour "${icon.data.color}", the card "${card.color}"`);
    }

    const page = await pages.findOne({ pageUrl: PAGE_URL });
    if (!page) throw new Error(`no page "${PAGE_URL}"`);
    const side = page.typeData?.side || [];
    const index = side.findIndex(entry => isSideList(entry?.component));
    if (index < 0) throw new Error(`"${PAGE_URL}" has no "lista boczna" link cards in its side column`);

    const list = side[index].component;
    const items = [...(list.data.items || [])];
    for (const card of CARDS) {
        const link = `/mapa-atrakcji?kategoria=${card.category}`;
        if (items.some(item => item.link === link)) {
            report.push(`ok     "${card.title}" already there`);
            continue;
        }
        items.push({ title: card.title, description: card.description, image: "", link, color: card.color });
        report.push(`add    "${card.title}" → ${link} (${card.color}): ${card.description}`);
    }

    const added = items.length - (list.data.items || []).length;
    printReport(`Side list "${list.data.title}" on ${PAGE_URL}`, report, apply);
    if (!apply || !added) return;

    console.log(`backup: ${await backup(db, "geosites-map-cards", ["pages"])}`);
    const newSide = side.map((entry, i) => (i === index ? { ...entry, component: { ...list, data: { ...list.data, items } } } : entry));
    await pages.updateOne({ _id: page._id }, { $set: { "typeData.side": newSide } });
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
