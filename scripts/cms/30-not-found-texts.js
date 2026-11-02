// Step 30: the texts and links of the 404 page, which the front end held, go into a post type
// of their own.
//
//   node scripts/cms/30-not-found-texts.js [--apply --db=<database>]
//
// - a new post type `not_found` ("Strona 404"): eyebrow, title, lead (and the lead of the
//   offline mode), the buttons, the signpost boards (label, link, direction) and the notice
//   shown when the browser is offline;
// - its single post with the texts the front end showed until now. The signpost points home,
//   to the header button's page and to the TOP 50 section, as before.
//
// Idempotent: once the post exists it is left alone.

const { withDb, backup, bumpContentVersion, printReport, upsertDefinitions, insertPosts } = require("./lib");
const { notFoundPostType } = require("./definitions");

/** The first subpage of the TOP 50 section, or its own link – the front end's sectionLink. */
function top50Link(nav) {
    const item = (nav || []).find(entry => /top\s*50/i.test(entry.title || ""));
    if (!item) return undefined;
    return item.link || (item.subnav || []).find(sub => sub.link)?.link;
}

/** The texts the front end showed; the map link and label come from the header button. */
function texts(navigation) {
    const mapLink = navigation.cta_link || "/";
    const top50 = top50Link(navigation.nav);
    return {
        eyebrow: "Błąd 404",
        title: "Przepraszamy, nie możemy znaleźć tej strony!",
        lead: "Strona prawdopodobnie nie istnieje.",
        lead_offline: "Strona prawdopodobnie nie istnieje lub nie została wcześniej zapisana, jeśli jesteś w trybie offline.",
        buttons: [
            { label: "Przejdź do strony głównej", link: "/" },
            { label: "Szukaj na mapie", link: mapLink }
        ],
        signpost: [
            { label: "Strona główna", link: "/", direction: "w prawo" },
            { label: navigation.cta_label || "Mapa atrakcji", link: mapLink, direction: "w lewo" },
            ...(top50 ? [{ label: "TOP 50", link: top50, direction: "w prawo" }] : [])
        ],
        offline_title: "Jesteś offline.",
        offline_text: "Wyświetlamy strony zapisane podczas wcześniejszych wizyt. Mapa i wyszukiwanie zadziałają po odzyskaniu połączenia."
    };
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "not-found-texts", ["post_types", "posts", "counters"])}`);

    const definitions = await upsertDefinitions(db, "post_types", [notFoundPostType], { apply });
    printReport("Post types", definitions.report, apply);

    const posts = db.collection("posts");
    const existing = await posts.findOne({ type: "not_found" });
    const navigation = await posts.findOne({ type: "navigation" });
    const data = texts((navigation && navigation.data) || {});
    const report = existing
        ? ["ok     the 404 post exists"]
        : [`create post "Strona 404"`, ...Object.entries(data).map(([key, value]) => `         ${key}: ${JSON.stringify(value)}`)];
    printReport("Posts", report, apply);

    if (!apply) return;
    if (!existing) await insertPosts(db, "not_found", [{ title: "Strona 404", data }]);
    if (definitions.changed || !existing) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
