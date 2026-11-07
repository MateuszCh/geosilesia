// Step 38: the privacy policy – a content page of its own and a link to it in the menu and the
// footer.
//
//   node scripts/cms/38-privacy-policy.js [--apply --db=<database>]
//
// - a "Strona treści" page `polityka-prywatnosci`, one "Tytuł i tekst" row per section,
//   holding only what art. 13 GDPR requires for what the site processes: the server log on the
//   hosting, the server-side visit statistics (visits.js: no cookies, a daily rotating
//   identifier, no IP stored), e-mail sent to the contact address (a Gmail mailbox, so Google is a recipient),
//   Google Maps, which loads by itself on the map pages (recipient, transfer to the USA), and
//   the absence of automated decisions. What the browser keeps (sessionStorage, IndexedDB, the
//   service worker's cache) is strictly necessary and holds no personal data, and the
//   visitor's position never leaves the browser, so neither is described. The administrator's
//   name and e-mail come from the "Kontakt" row of `geosilesia-kontakt`;
// - "Polityka prywatności" at the end of the "O serwisie" submenu, which the footer shows as
//   a column too.
//
// The script owns the text: when the page's rows differ from it, they are replaced (edits made
// in the CMS would be lost) and "Autor i daty" gets today as the date of the last update.
// Idempotent: unchanged rows and an existing link are left alone.

const {
    withDb,
    backup,
    bumpContentVersion,
    printReport,
    componentTitles,
    row,
    insertPage,
    updatePageRows,
    describeRows,
    toCmsDate
} = require("./lib");

const PAGE_URL = "polityka-prywatnosci";
const TITLE = "Polityka prywatności";
const CONTACT_PAGE = "geosilesia-kontakt";
const MENU_SECTION = "O serwisie";

const p = paragraph => ({ paragraph, list: [] });
const list = (paragraph, items) => ({ paragraph, list: items.map(item => ({ item })) });

/** The sections of the policy, each a "Tytuł i tekst" row: only what art. 13 GDPR requires. */
function sections({ name, email }) {
    return [
        {
            title: "Administrator danych",
            text: [p(`Administratorem danych osobowych jest ${name}. Kontakt w sprawach danych osobowych: ${email}.`)]
        },
        {
            title: "Dziennik serwera",
            text: [
                p(
                    "Przy każdym odwiedzeniu strony serwer zapisuje w dzienniku adres IP urządzenia, datę i godzinę zapytania, adres otwieranej strony, adres strony, z której nastąpiło przejście, oraz informacje o przeglądarce i systemie (tzw. user agent). Dane te są przetwarzane w celu zapewnienia działania i bezpieczeństwa serwisu, co jest prawnie uzasadnionym interesem administratora (art. 6 ust. 1 lit. f RODO). Odbiorcą danych jest dostawca hostingu MyDevil. Dziennik jest przechowywany przez okres do 3 miesięcy, po czym jest automatycznie usuwany."
                )
            ]
        },
        {
            title: "Statystyki odwiedzin",
            text: [
                p(
                    "Serwis liczy odwiedziny po stronie serwera, bez plików cookies i zewnętrznych narzędzi analitycznych. Do odróżnienia odwiedzających używany jest identyfikator zmieniany codziennie. Adres IP nie jest zapisywany, a zebrane statystyki nie pozwalają nikogo zidentyfikować. Celem jest poznanie liczby odwiedzających i najczęściej czytanych treści, co jest prawnie uzasadnionym interesem administratora (art. 6 ust. 1 lit. f RODO). Statystyki nie są nikomu przekazywane."
                )
            ]
        },
        {
            title: "Korespondencja e-mail",
            text: [
                p(
                    "Jeśli napiszesz na adres podany na stronie Kontakt, Twój adres e-mail i treść wiadomości są przetwarzane w celu udzielenia odpowiedzi, co jest prawnie uzasadnionym interesem administratora (art. 6 ust. 1 lit. f RODO). Podanie danych jest dobrowolne, ale bez nich nie można odpowiedzieć. Skrzynkę pocztową prowadzi Google w ramach usługi Gmail, który jest odbiorcą tych danych. Dane mogą być przekazywane do Google LLC w Stanach Zjednoczonych na podstawie programu EU-US Data Privacy Framework. Wiadomości są przechowywane przez czas prowadzenia korespondencji."
                )
            ]
        },
        {
            title: "Mapa Google",
            text: [
                p(
                    "Strony z mapą wyświetlają mapę Google Maps, która wczytuje się z serwerów Google automatycznie po otwarciu takiej strony. Twoja przeglądarka przekazuje wtedy firmie Google Ireland Limited adres IP, a podczas wyszukiwania także wpisany adres. Celem jest pokazanie położenia opisywanych miejsc, co jest prawnie uzasadnionym interesem administratora (art. 6 ust. 1 lit. f RODO). Dane mogą być przekazywane do Google LLC w Stanach Zjednoczonych na podstawie programu EU-US Data Privacy Framework. Okres przechowywania określa <a href=\"https://policies.google.com/privacy?hl=pl\">polityka prywatności Google</a>."
                )
            ]
        },
        {
            title: "Twoje prawa",
            text: [
                list("Masz prawo do:", [
                    "dostępu do swoich danych,",
                    "ich sprostowania,",
                    "ich usunięcia,",
                    "ograniczenia przetwarzania,",
                    "wniesienia sprzeciwu wobec przetwarzania,",
                    "wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa)."
                ])
            ]
        },
        {
            title: "Zautomatyzowane decyzje",
            text: [p("Dane nie są wykorzystywane do zautomatyzowanego podejmowania decyzji ani do profilowania.")]
        }
    ];
}

/** "Strona treści" fields, in the shape the other content pages store them. */
const TYPE_DATA = {
    title: TITLE,
    lead: "",
    image: "",
    image_caption: "",
    image_author: "",
    author: "",
    published: "",
    updated: "",
    side: [],
    section_menu: "obok tekstu",
    next_card: false,
    byline: ""
};

/** Name and e-mail from the "Kontakt" row of the contact page. */
async function administrator(db) {
    const page = await db.collection("pages").findOne({ pageUrl: CONTACT_PAGE });
    const contact = page && (page.rows || []).find(r => r.type === "contact");
    const { person_name: name, email } = (contact && contact.data) || {};
    if (!name || !email) throw new Error(`no person_name and email in the contact row of /${CONTACT_PAGE}`);
    return { name, email };
}

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    if (apply) console.log(`backup: ${await backup(db, "privacy-policy", ["pages", "posts", "counters"])}`);

    const pages = db.collection("pages");
    const posts = db.collection("posts");

    // The page
    const existing = await pages.findOne({ pageUrl: PAGE_URL });
    const titles = await componentTitles(db);
    const rows = sections(await administrator(db)).map(data => row("title_and_text", data, titles));
    const same = existing && JSON.stringify(existing.rows) === JSON.stringify(rows);
    const today = toCmsDate(new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Warsaw" }));
    printReport(
        "Pages",
        same
            ? [`ok     /${PAGE_URL} has the current text`]
            : [
                  existing
                      ? `update /${PAGE_URL}: rows replaced, "ostatnia aktualizacja" ${today}`
                      : `create /${PAGE_URL} "${TITLE}" (Strona treści), "ostatnia aktualizacja" ${today}`,
                  `         rows: ${describeRows(rows)}`,
                  ...rows.flatMap(r => [
                      `         ## ${r.data.title}`,
                      ...r.data.text.flatMap(t => [`         ${t.paragraph}`, ...t.list.map(i => `           - ${i.item}`)])
                  ])
              ],
        apply
    );

    // The link in "O serwisie"
    const navigation = await posts.findOne({ type: "navigation" });
    if (!navigation) throw new Error("no navigation post");
    const data = JSON.parse(JSON.stringify(navigation.data || {}));
    const section = (data.nav || []).find(item => item.title === MENU_SECTION);
    if (!section) throw new Error(`no "${MENU_SECTION}" item in the navigation`);
    section.subnav = section.subnav || [];
    const linked = section.subnav.some(sub => sub.link === `/${PAGE_URL}`);
    if (!linked) section.subnav.push({ subtitle: TITLE, link: `/${PAGE_URL}`, hide_in_footer: false });
    printReport(
        "Navigation",
        [linked ? `ok     "${MENU_SECTION}" links /${PAGE_URL}` : `navigation.nav["${MENU_SECTION}"].subnav += "${TITLE}" → /${PAGE_URL}`],
        apply
    );

    if (!apply) return;
    if (!existing) {
        await insertPage(db, {
            rows,
            title: TITLE,
            pageUrl: PAGE_URL,
            seoTitle: TITLE,
            seoDescription: "Jakie dane osobowe przetwarza serwis GeoSilesia i jakie prawa Ci przysługują.",
            type: "tresc",
            typeData: { ...TYPE_DATA, updated: today }
        });
    } else if (!same) {
        await updatePageRows(db, existing._id, rows);
        await pages.updateOne({ _id: existing._id }, { $set: { "typeData.updated": today } });
    }
    if (!linked) await posts.updateOne({ _id: navigation._id }, { $set: { data, updated: Date.now() } });
    if (!same || !linked) await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
