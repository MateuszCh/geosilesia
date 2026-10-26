// Step 16: the texts of the mockups on nine pages.
//
//   node scripts/cms/16-mockup-texts.js [--only=skarby,geostanowiska,...] [--apply --db=<database>]
//
// The user chose the mockups' shorter texts over the longer ones in the CMS (26.10.2026).
// Paragraphs the mockups shorten are replaced and paragraphs they leave out are removed;
// maps, tables, charts and the legends of the maps stay. Where a mockup holds only a
// placeholder ("[tytuł publikacji z CMS]", a legend cut off with "…"), the CMS text stays.
// The backup keeps every removed text.
//
// Pages (--only= keys): skarby, geostanowiska, geoparki, slownik, budowa, polozenie,
// rzezba, galeria. Also, as in the mockups: "A ponadto" of Skarby natury as seven short
// items beside the list, figures and chart of Rzeźba terenu without "n.p.m.", the extreme points of
// Położenie as four figures, the fossils of Budowa geologiczna as a table, literature
// headed "Literatura", and the album count in the gallery lead ("{albumy}" in the intro).
//
// Idempotent: each change checks for its result first.

const { withDb, backup, bumpContentVersion, printReport, componentTitles, row, updatePageRows } = require("./lib");

const p = text => `<p>${text}</p>`;
const plain = html => String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const short = (text, length = 80) => {
    const value = plain(text);
    return value.length > length ? `${value.slice(0, length)}…` : value;
};

// ---- Texts of the mockups ----

const SKARBY_LEAD = p(
    "Województwo śląskie należy do najbardziej uprzywilejowanych obszarów Polski pod względem walorów geologicznych, geomorfologicznych i hydrologicznych. Oto osobliwości przyrody nieożywionej ważne w skali całego kraju (Chybiorz i Tyc 2012; Chybiorz i in. 2015)."
);

const SKARBY_ITEMS = {
    "Antyklina Siewierza":
        "Na węglanowych skałach środkowego dewonu niezgodnie zalegają dolomity środkowego triasu. W rejonie Dziewek znajdują się odsłonięcia reperowe oraz ruiny dawnych wapienników, a także czynne kamieniołomy: Podleśna, Nowa Wioska i Siewierz.",
    "Węglonośny karbon Górnośląskiego Zagłębia Węglowego":
        "Kompleks skał węglonośnych z unikatowymi w skali międzynarodowej odsłonięciami. Dziedzictwo geologiczne i górnicze można dziś poznawać w Kopalni Guido i Sztolni Królowa Luiza w Zabrzu oraz w Kopalni Ćwiczebnej „Sztygarka” w Dąbrowie Górniczej.",
    "Garb Tarnogórski":
        "Skały węglanowe progu środkowotriasowego z dolomitami kruszconośnymi, z których przez stulecia wydobywano rudy ołowiu, srebra i cynku. Kopalnie w Tarnowskich Górach to jedyny obiekt z województwa śląskiego wpisany na Listę światowego dziedzictwa UNESCO.",
    "Próg Woźnicki":
        "Skały progu górnotriasowego z lisowickim poziomem kościonośnym — jednym z najważniejszych stanowisk paleontologicznych późnego triasu w Europie.",
    "Częstochowskie Zagłębie Rudonośne":
        "Skały ilaste jury środkowej z syderytami ilastymi. Przez stulecia eksploatowano tu rudy żelaza metodami powierzchniowymi, szybikowymi, upadowymi i głębinowymi.",
    "Wyżyna Częstochowska":
        "Wapienne ostańce — dawne rafy gąbkowo-glonowe — oraz liczne jaskinie o wyjątkowych walorach przyrodniczych i krajobrazowych. Do najbardziej znanych należą Okiennik Wielki i Góra Biakło, a także rezerwat przyrody Zielona Góra.",
    "Flisz wapienny płaszczowiny cieszyńskiej":
        "Najstarsze utwory zachodniej części Karpat fliszowych. Naturalne i sztuczne odsłonięcia znajdują się na Pogórzu Śląskim, m.in. na stanowiskach dokumentacyjnych w Cieszynie i Goleszowie.",
    "Skałki i wodospady Beskidów":
        "Pomnikowe skałki, największy wodospad w polskich Beskidach w Sopotni Wielkiej, najwyższy wodospad Beskidu Małego — Dusica — oraz Kaskady Rodła na Białej Wisełce.",
    "Osuwiska i jaskinie niekrasowe":
        "Rezerwat przyrody nieożywionej „Kuźnie” w gminie Lipowa i stanowisko dokumentacyjne „Zamczysko na Ściszków Groniu” w gminie Łękawica należą do najcenniejszych obiektów tego typu.",
    "Pustynia Błędowska":
        "Jedna z największych osobliwości przyrodniczych i krajobrazowych Polski. Warto również odwiedzić Pustynię Siedlecką w gminie Janów."
};

const SKARBY_MORE = [
    "Przełomowe odcinki Liswarty i Warty, przemodelowane przez lądolód Warty",
    "Kuesta jurajska — próg skalny i punkt widokowy",
    "Kontynentalny dział wodny wzdłuż południowej granicy",
    "Masyw Pilska z najwyższym punktem województwa",
    "Graniczny Meander Odry w gminie Krzyżanowice",
    "Przełomy Warty pod Mstowem i Białej Przemszy pod Okradzionowem",
    "Górnośląskie Pojezierze Antropogeniczne"
];

const GEOSITES_LEAD = p(
    "Szczególnie wartościowe stanowiska geologiczne, geomorfologiczne oraz poprzemysłowe (np. pogórnicze, pohutnicze), mające znaczenie dla zrozumienia historii Ziemi. Wpisują się w ideę ochrony georóżnorodności i są niezbędnym elementem geoparków (Chybiorz i Kowalska, 2017)."
);

const GEOSITES_POINTS = [
    "Stanowiska geologiczne były pierwszymi obiektami, które podlegały prawnej ochronie. Nazywano je wówczas zabytkami przyrody nieożywionej (Małkowski 1928, Alexandrowicz 1978, Gonera 2005).",
    "Jakubowski (2004) wyróżnia nieruchome dziedzictwo geologiczne, chronione in situ, oraz ruchome dziedzictwo geologiczne, chronione ex situ w przestrzeni muzealnej.",
    "Obiekty przyrody nieożywionej występują w środowisku naturalnym i przekształconym przez człowieka (kopalnie, kamieniołomy, hałdy), a także w budowlach, kamieniach ozdobnych i muzeach.",
    "Pierwszą polską bazę geostanowisk wykonano w Instytucie Ochrony Przyrody PAN w Krakowie (Alexandrowicz 2006): opracowano w niej 175 geostanowisk z całego kraju.",
    "Popularyzacji ochrony dziedzictwa geologicznego służą różnego typu geoprodukty (zob. Słowa kluczowe).",
    "Geostanowiska nie są formą ochrony przyrody, ale podstawowym typem obiektu geoturystycznego i ważnym elementem kształtowania środowiska zgodnie z zasadami zrównoważonego rozwoju."
];

const GEOPARKS_LEAD = p(
    "Najprościej można powiedzieć, że geoparki to „muzea pod chmurką”: wyróżnione obszary z wybitnymi obiektami geologicznymi o szczególnym znaczeniu dla nauki i geoedukacji."
);

const GEOPARKS_TEXT =
    "Geopark nie stanowi odrębnej prawnej formy ochrony przyrody. Oprócz zasobów geologicznych występują w nim inne zasoby przyrodnicze i związane z nimi zasoby kulturowe, dzięki czemu geoparki przyczyniają się do rozwoju lokalnego. 17 listopada 2015 r. UNESCO powołało Międzynarodowy Program Nauk o Ziemi i Geoparków.";

/** Dictionary terms of the mockup, in the order of the CMS: [title start, term, definition]. */
const TERMS = [
    ["Dziedzictwo geologiczne", "Dziedzictwo geologiczne", "To abiotyczne elementy przyrody, takie jak fragmenty skorupy Ziemi, formy jej rzeźby oraz procesy kształtujące planetę, które umożliwiają naukową rekonstrukcję dziejów Ziemi i życia na niej."],
    ["Georóżnorodność", "Georóżnorodność", "Stanowi podstawę bioróżnorodności (różnorodności biologicznej) i wraz z nią decyduje o różnorodności krajobrazu (ekoróżnorodności)."],
    ["Geostanowiska", "Geostanowiska", "To szczególnie wartościowe stanowiska geologiczne, geomorfologiczne oraz poprzemysłowe (np. pogórnicze i pohutnicze), mające znaczenie dla poznania historii Ziemi."],
    ["Geoochrona", "Geoochrona", "Jest działaniem polegającym na zachowaniu georóżnorodności, jej najważniejszych cech oraz związanych z nią wartości dziedzictwa geologicznego. Termin ten zastępuje określenie „ochrona przyrody nieożywionej” (Alexandrowicz, 2007)."],
    ["Geopark", "Geopark", "To obszar o ściśle wyznaczonych granicach, obejmujący jedno lub więcej miejsc o istotnym znaczeniu naukowym dla geologii, a także dla archeologii, ekologii i kultury."],
    ["Geoturystyka", "Geoturystyka", "To podróżowanie w celu świadomego poznawania dziedzictwa geologicznego oraz abiotycznych elementów współczesnej przyrody, a także tych aspektów działalności człowieka, które nawiązują do wykorzystania zasobów Ziemi (Migoń, 2012)."],
    ["Obiekt geoturystyczny", "Obiekt geoturystyczny", "To stanowisko przyrodnicze lub kulturowe prezentujące treści z zakresu nauk o Ziemi, które po odpowiednim zagospodarowaniu może być wykorzystane na potrzeby geoturystyki i geoedukacji (Miśkiewicz, 2024)."],
    ["Atrakcja geoturystyczna", "Atrakcja geoturystyczna", "To element lub aktywność wykorzystujące dziedzictwo geologiczne, zagospodarowane na potrzeby turystyki i geoedukacji oraz generujące ruch turystyczny (Dryglas i Miśkiewicz, 2014)."],
    ["Produkt geoturystyczny", "Produkt geoturystyczny", "Obejmuje materialne i niematerialne dobra oraz usługi tworzone przez człowieka na bazie geodziedzictwa, nabywane, doświadczane lub współtworzone przez turystów (Dryglas i Miśkiewicz, 2014)."]
];

const GALLERY_INTRO = {
    from: "<p>Albumy fotograficzne z terenu: skały, minerały, jaskinie, kopalnie, tężnie i kamień w architekturze.</p>",
    to: "<p>{albumy} fotograficznych z terenu: skały, minerały, jaskinie, kopalnie, tężnie i kamień w architekturze.</p>"
};

const cell = (text, scope) => ({ text, rowspan: "", colspan: "", ...(scope && { scope }) });
const FOSSILS = [
    {
        colgroups: [],
        rows: [
            { header: [cell("Okres", "col"), cell("Co znajdziemy", "col"), cell("Gdzie", "col")], data: [] },
            ...[
                ["Dewon", "Organizmy rafotwórcze — koralowce, stromatoporoidy", "wapienie okolic Siewierza"],
                ["Karbon", "Fauna morska (mięczaki, trylobity, liliowce); rośliny: Lepidodendron, Sigillaria, Calamites", "Gołonóg, Dąbrowa Górnicza; hałdy powęglowe"],
                ["Trias", "Organizmy płytkiego morza, szczątki notozaurów", "Tarnowskie Góry — Dąbrowa Górnicza, okolice Mikołowa"],
                ["Jura", "Amonity, belemnity, gąbki, ramienionogi", "Wyżyna Krakowsko-Częstochowska"],
                ["Czwartorzęd", "Kości mamutów, nosorożców włochatych, reniferów, niedźwiedzi jaskiniowych", "piaskownie, namuliska jaskiniowe"]
            ].map(([age, what, where]) => ({ header: [cell(age, "row")], data: [cell(what), cell(where)] }))
        ]
    }
];

const EXTREMES = [
    { value: "51°05′58″ N", label: "Północ", note: "nurt Warty, gmina Popów, ok. wsi Lelity" },
    { value: "49°23′38″ N", label: "Południe", note: "stoki Jaworzyny, gmina Rajcza, wieś Rycerka" },
    { value: "18°02′06″ E", label: "Zachód", note: "gmina Pietrowice Wielkie, okolice wsi Gródczanki" },
    { value: "19°58′26″ E", label: "Wschód", note: "gmina Żarnowiec, las ok. wsi Koryczany" }
].map(fact => ({ ...fact, color: "" }));

/**
 * Tab rows of the three article pages: [tab, "#heading" or the first words of the row's
 * first paragraph, changes]. `paragraphs: []` with nothing else left removes the row.
 */
const TAB_ROWS = {
    budowa: [
        [0, "#Powierzchniowe utwory geologiczne", {
            paragraphs: [
                "Na obszarze województwa śląskiego występują utwory geologiczne zaliczane do dziewięciu okresów (systemów) geologicznych. Są to skały górnopaleozoiczne (dewon, karbon i perm), mezozoiczne (trias, jura i kreda) oraz kenozoiczne (paleogen, neogen i czwartorzęd).",
                "W południowej części regionu, w Karpatach zewnętrznych, na powierzchni występują jedynie skały mezozoiczne (jura i kreda) oraz kenozoiczne (paleogen, neogen i czwartorzęd). Charakterystykę ostatniej ery geologicznej przedstawiono w monografii pt. Kenozoik regionu śląsko-krakowskiego (Lewandowski, 2015)."
            ]
        }],
        [0, "#Skamieniałości", {
            paragraphs: ["Najlepiej poznanymi skamieniałościami województwa śląskiego, występującymi w stanowiskach powierzchniowych, są (Chybiorz i in., 2015):"],
            list: [],
            table: FOSSILS
        }],
        [0, "Skamieniałości, skały i minerały można oglądać", { paragraphs: [] }],
        [1, "#Budowa geologiczna na powierzchni podczwartorzędowej", {
            paragraphs: ["Na powierzchni podczwartorzędowej, czyli po usunięciu utworów czwartorzędu, występują utwory neogenu, paleogenu, mezozoiku oraz młodszego paleozoiku. Informacje o wgłębnej budowie geologicznej województwa przedstawiono na szkicach geologicznych odkrytych w skali 1:100 000 (SMGP 50k) oraz na mapach odkrytych Mapy geologicznej Polski w skali 1:200 000."]
        }],
        [1, "#Budowa geologiczna na powierzchni podkenozoicznej", {
            paragraphs: ["Na powierzchni podkenozoicznej, czyli po usunięciu utworów czwartorzędu, neogenu i paleogenu, występuje osiem głównych jednostek tektonicznych (Karnkowski, 2008). W wierceniach stwierdzono, że pod Karpatami, oprócz karbonu i dewonu, występują także osady kambru dolnego oraz prekambru."]
        }],
        [1, "#Budowa geologiczna na powierzchni podpermskiej", {
            paragraphs: ["Na powierzchni podpermskiej, czyli bez osadów kenozoicznych i mezozoiczno-permskich, oprócz utworów prekambru, kambru, dewonu i karbonu występują również osady ordowiku i syluru oraz skały magmowe związane ze strefą uskokową Kraków–Lubliniec. Strefa ta przecina i przemieszcza wszystkie serie skalne prekambru i paleozoiku bloku górnośląskiego względem bloku małopolskiego."]
        }],
        // The legend of the cross-section stays (the mockup cuts it off); the long text on
        // the coal basin after it goes.
        [1, "Przekrój geologiczny wg Buły", { keepFirstParagraph: true }],
        [2, "#Kopaliny", {
            paragraphs: ["Na terenie województwa śląskiego udokumentowano liczne kopaliny stanowiące przedmiot eksploatacji górniczej ze złóż. Są to tzw. skarby kopalne, czyli bogactwa mineralne należące do zasobów naturalnych. Kopalina wydobyta ze złoża staje się surowcem mineralnym. Ze względu na przeznaczenie surowce mineralne dzieli się na pięć grup:"],
            list: ["energetyczne", "metaliczne", "chemiczne", "skalne", "inne, w tym kamienie szlachetne"]
        }],
        [2, "Szczegółowe i aktualne informacje o kopalinach", {
            paragraphs: ["Szczegółowe i aktualne informacje o kopalinach są dostępne w Centralnej Bazie Danych Geologicznych PIG-PIB, w witrynie „Surowce mineralne Polski”, w aplikacji GeoLOG oraz w portalu mapowym GEOLOGIA."]
        }],
        [2, "#Minerały", {
            paragraphs: [
                "Najbardziej znane są okazy galeny, sfalerytu, jordanitu, hemimorfitu, cerusytu oraz ołowionośnego aragonitu zwanego tarnowicytem — jego nazwa pochodzi od niemieckiej nazwy Tarnowskich Gór, miejsca pierwszego znalezienia i opisania. Pochodzą z nieczynnych już kopalń z okolic Tarnowskich Gór i Bytomia.",
                "Zobacz także: Galeria › Minerały."
            ]
        }]
    ],
    polozenie: [
        [0, "#Położenie administracyjne", {
            paragraphs: [
                "Województwo śląskie to jednostka samorządu terytorialnego oraz jednostka podziału administracyjnego położona w południowej części Polski. Zajmuje 12 334 km², co stanowi 3,9% terytorium kraju i daje mu 14. miejsce pod względem powierzchni. Siedzibą władz województwa są Katowice.",
                "To jedyne województwo, w którym liczba miast na prawach powiatu (19) jest większa niż liczba powiatów (17). Składa się ze 167 gmin: 49 miejskich, 26 miejsko-wiejskich i 92 wiejskich. W 2017 r. utworzono Górnośląsko-Zagłębiowską Metropolię — pierwszą metropolię w Polsce, obejmującą 41 miast i gmin."
            ],
            chart_source: "Zielone — granice z województwami, czerwone — granica państwowa. Źródło: WODGiK, 2026."
        }],
        [0, "#Położenie kartograficzne", {
            paragraphs: ["Obszar województwa leży na półkuli północnej i wschodniej. Przez jego terytorium przebiega południk 19°E (oznaczony w Chorzowie i Czechowicach-Dziedzicach) oraz równoleżniki 50°N (pomnik w Wodzisławiu Śląskim) i 51°N. Skrajne punkty granicy:"],
            list: [],
            facts: EXTREMES
        }],
        [0, "Zobacz także: Galeria > Inne > Śląskie NAJ.", { paragraphs: [] }],
        [1, "#Położenie fizycznogeograficzne", {
            paragraphs: [
                "Główną cechą ukształtowania powierzchni Polski jest pasowy układ jednostek rzeźby terenu, który powstał w wyniku długotrwałych procesów geologicznych, m.in. ruchów górotwórczych i zlodowaceń. Każdy z sześciu pasów krajobrazu naturalnego dzieli się na mniejsze jednostki geomorfologiczne i fizycznogeograficzne.",
                "W 2018 r. opublikowano nowy podział fizycznogeograficzny Polski, w którym na obszarze województwa śląskiego wydzielono kilka nowych mezoregionów (Solon i in., 2018). Wcześniej najbardziej rozpowszechniona była regionalizacja J. Kondrackiego (1964, 2002)."
            ],
            facts: [{ value: "4 z 6", label: "Województwo śląskie, jako jedyne w kraju, położone jest na obszarze czterech z sześciu pasów krajobrazowych.", note: "", color: "" }]
        }],
        [1, "Charakterystykę prowincji, podprowincji", { paragraphs: [] }],
        [1, "Wcześniej najbardziej rozpowszechniona była regionalizacja", { paragraphs: [] }],
        [1, "Struktura starego i nowego podziału", { paragraphs: [] }],
        [2, "#Położenie hydrograficzne", {
            paragraphs: [
                "Obszar województwa w całości leży w zlewisku Oceanu Atlantyckiego, w zlewiskach dwóch mórz: Bałtyckiego i Czarnego. Zlewiska oddziela kontynentalny dział wodny, a dorzecza Odry i Wisły — dział wodny pierwszego rzędu.",
                "Śląskie jest jedynym województwem, przez które przepływają trzy najdłuższe rzeki kraju: Wisła, Odra i Warta. Na zachodnim stoku Baraniej Góry znajdują się źródła Wisły, a na Wyżynie Częstochowskiej źródła Warty w Kromołowie oraz źródła Pilicy. W centralnej części regionu leży największe w Polsce pojezierze antropogeniczne — Górnośląskie Pojezierze Antropogeniczne."
            ]
        }],
        [2, "Po więcej informacji zapraszam", { paragraphs: [] }]
    ],
    rzezba: [
        [0, "#Układ pionowy rzeźby terenu", {
            paragraphs: ["Województwo śląskie jest regionem wyżynnym. Jednak według danych CODGiK (2015) największą powierzchnię województwa zajmują obszary nizinne położone do wysokości 300 m n.p.m."],
            factValues: { "1534,55 m n.p.m.": "1534,55 m", "171,8 m n.p.m.": "171,8 m" },
            chart_unit: "m"
        }],
        [0, "Najwyższy punkt trenowy", {
            paragraphs: ["W północnej, centralnej i południowo-zachodniej części województwa wyróżniają się formy antropogeniczne — zwałowiska (hałdy). Jedną z najciekawszych w kraju i w Europie jest hałda „Szarlota” przy kopalni „Rydułtowy-Anna” w Rydułtowach: ma około 134 m wysokości względnej i wznosi się na około 406 m n.p.m."]
        }],
        [0, "Współcześnie do odtwarzania powierzchni terenu", { paragraphs: [] }],
        [1, "#Wiek bezwzględny rzeźby terenu", {
            paragraphs: ["Rzeźba powierzchni Ziemi jest podstawowym elementem krajobrazu naturalnego. Według Gilewskiej (1997) została ukształtowana w ciągu ostatnich 65 mln lat, w kenozoiku. Ruchy tektoniczne, działalność lodu, wody oraz wpływ wiatru sprawiły, że występują tu formy ukształtowania powierzchni o różnej genezie, wieku i rozmiarach."],
            facts: [{ value: "65 mln lat", label: "tyle trwa kształtowanie dzisiejszej rzeźby terenu — od początku kenozoiku.", note: "", color: "" }]
        }],
        [2, "#Krajobraz naturalny", {
            paragraphs: ["Krajobraz naturalny (przyrodniczy) to wyodrębniony przestrzennie fragment materialnej rzeczywistości Ziemi, stanowiący złożony system obejmujący formy terenu, gleby, wody, skały i roślinność. Za element krajobrazu uznaje się także atmosferę. W krajobrazie naturalnym można wyróżnić czynniki abiotyczne, biotyczne oraz społeczne."],
            list: ["abiotyczne", "biotyczne", "społeczne"]
        }]
    ]
};

const PAGES = {
    skarby: "wojewodztwo-slaskie-cuda-natury",
    geostanowiska: "geosilesia-geostanowiska",
    geoparki: "geoparki",
    slownik: "geosilesia-slownik",
    budowa: "budowa-geologiczna-wojewodztwa-slaskiego",
    polozenie: "polozenie-wojewodztwa-slaskiego",
    rzezba: "rzezba-terenu-wojewodztwa-slaskiego",
    galeria: "geosilesia-galeria"
};

// ---- Changes ----

const heroAt = rows => rows.findIndex(r => r && r.type === "page_hero");
const withHero = (rows, data) => rows.map((r, i) => (i === heroAt(rows) ? { ...r, data: { ...r.data, ...data } } : r));
const isMotto = r => r.type === "title_and_text" && (r.data.text || []).length === 1 && r.data.text[0].paragraph_class === "cytat";

function lead(text) {
    return (rows, { note }) => {
        const hero = rows[heroAt(rows)].data;
        if (hero.lead === text) return rows;
        note(`lead: "${short(hero.lead)}" → "${short(text)}"`);
        return withHero(rows, { lead: text });
    };
}

function literatureTitle(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "literature" || r.data.title === "Literatura") return r;
        note(`literature heading "${r.data.title}" → "Literatura"`);
        return { ...r, data: { ...r.data, title: "Literatura" } };
    });
}

/** Removes title_and_text rows the mockup leaves out (all but the motto). */
function dropTextRows(label) {
    return (rows, { note }) =>
        rows.filter(r => {
            if (!r || r.type !== "title_and_text" || isMotto(r)) return true;
            const text = r.data.text || [];
            note(`remove ${label}${r.data.title ? ` "${r.data.title}"` : ""}: ${text.length} paragraph(s), ${text.map(t => plain(t.paragraph || (t.list || []).map(i => i.item).join(" "))).join(" ").length} characters ("${short(text[0]?.paragraph || text[0]?.list?.[0]?.item, 60)}")`);
            return false;
        });
}

function skarbyItems(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "numbered_list" || !r.data.items?.length) return r;
        let changed = false;
        const items = r.data.items.map(item => {
            const text = SKARBY_ITEMS[item.title];
            if (!text || item.text === p(text)) return item;
            changed = true;
            note(`"${item.title}": ${plain(item.text).length} → ${text.length} characters`);
            return { ...item, text: p(text) };
        });
        const more = SKARBY_MORE.map(text => ({ text, link: "" }));
        const sameMore = JSON.stringify((r.data.more_items || []).map(m => m.text)) === JSON.stringify(SKARBY_MORE);
        if (!sameMore) note(`"A ponadto" beside the list: ${SKARBY_MORE.length} short items from the mockup`);
        if (!changed && sameMore) return r;
        return { ...r, data: { ...r.data, items, more_title: "A ponadto", more_items: more } };
    });
}

function geositesPoints(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "numbered_list" || r.data.items?.length !== GEOSITES_POINTS.length) return r;
        if (r.data.items.every((item, i) => item.text === p(GEOSITES_POINTS[i]))) return r;
        note(`"Co warto wiedzieć": ${r.data.items.map(i => plain(i.text).length).reduce((a, b) => a + b)} → ${GEOSITES_POINTS.reduce((a, t) => a + t.length, 0)} characters in 6 points`);
        return { ...r, data: { ...r.data, items: r.data.items.map((item, i) => ({ ...item, text: p(GEOSITES_POINTS[i]) })) } };
    });
}

function geoparksText(rows, { note, titles }) {
    if (rows.some(r => r && r.type === "title_and_text" && r.data.text?.[0]?.paragraph === GEOPARKS_TEXT)) return rows;
    const at = rows.findIndex(r => r && r.type === "title_and_text");
    if (at < 0) return rows;
    const texts = rows.filter(r => r && r.type === "title_and_text");
    note(`"${texts.map(r => r.data.title).join('", "')}" (${texts.length} rows) → one paragraph of the mockup: "${short(GEOPARKS_TEXT)}"`);
    const replacement = row("title_and_text", { title: "", text: [{ paragraph: GEOPARKS_TEXT, paragraph_class: "", list: [] }] }, titles);
    return rows.flatMap((r, i) => (i === at ? [replacement] : r && r.type === "title_and_text" ? [] : [r]));
}

function dictionaryTerms(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "dictionary") return r;
        const items = (r.data.items || []).map((item, i) => {
            const [start, term, definition] = TERMS[i] || [];
            if (!start || !(item.title || "").startsWith(start)) return item;
            const rowsNow = item.rows || [];
            if (item.title === term && rowsNow.length === 1 && rowsNow[0].text === definition && !rowsNow[0].list_item?.length) return item;
            const before = rowsNow.map(x => [x.text, ...(x.list_item || []).map(l => l.text)].join(" ")).join(" ");
            note(`"${item.title}"${item.title !== term ? ` → "${term}"` : ""}: ${plain(before).length} → ${definition.length} characters`);
            return { ...item, title: term, rows: [{ text: definition, list_item: [] }] };
        });
        return { ...r, data: { ...r.data, items } };
    });
}

function galleryIntro(rows, { note }) {
    return rows.map(r => {
        if (!r || r.type !== "gallery_list" || r.data.intro !== GALLERY_INTRO.from) return r;
        note(`album list lead: "${short(GALLERY_INTRO.to)}" ({albumy} = the album count, e.g. "48 albumów")`);
        return { ...r, data: { ...r.data, intro: GALLERY_INTRO.to } };
    });
}

/** The tab rows of an article page, changed as TAB_ROWS lists. */
function tabRows(key) {
    return (rows, { note }) =>
        rows.map(r => {
            if (!r || r.type !== "tabs") return r;
            const tabs = (r.data.tabs || []).map((tab, tabIndex) => {
                const changes = TAB_ROWS[key].filter(([at]) => at === tabIndex);
                if (!changes.length) return tab;
                const edited = (tab.rows || []).map(tabRow => {
                    const firstText = plain(tabRow.paragraphs?.find(x => x && x.paragraph)?.paragraph);
                    const match = changes.find(([, start, change]) =>
                        start.startsWith("#")
                            ? tabRow.heading === start.slice(1)
                            : !tabRow.heading && (firstText.startsWith(start) || (!!change.paragraphs?.[0] && firstText === change.paragraphs[0]))
                    );
                    return match ? applyRowChange(tabRow, match[2], `"${tab.title}" › ${tabRow.heading || `"${short(firstText, 40)}"`}`, note) : tabRow;
                });
                // A row left without anything to show goes.
                const kept = edited.filter(tabRow => {
                    const empty = !tabRow.heading && !tabRow.image && !tabRow.table?.length && !tabRow.facts?.length && !tabRow.chart?.length && !tabRow.quote && !tabRow.list?.length && !(tabRow.paragraphs || []).some(x => x && x.paragraph);
                    return !empty;
                });
                if (kept.length !== edited.length) note(`"${tab.title}": ${edited.length - kept.length} empty row(s) removed`);
                return { ...tab, rows: kept };
            });
            return { ...r, data: { ...r.data, tabs } };
        });
}

function applyRowChange(tabRow, change, label, note) {
    let next = { ...tabRow };
    const texts = (tabRow.paragraphs || []).filter(x => x && x.paragraph).map(x => x.paragraph);
    if (change.keepFirstParagraph) {
        if (texts.length > 1) {
            note(`${label}: keep the legend, remove ${texts.length - 1} paragraph(s) (${texts.slice(1).join(" ").length} characters, "${short(texts[1], 50)}")`);
            next.paragraphs = [{ paragraph: texts[0] }];
        }
        return next;
    }
    if (change.paragraphs && JSON.stringify(texts) !== JSON.stringify(change.paragraphs)) {
        note(change.paragraphs.length
            ? `${label}: ${texts.length} paragraph(s), ${texts.join(" ").length} characters → ${change.paragraphs.length}, ${change.paragraphs.join(" ").length} characters`
            : `${label}: remove ${texts.length} paragraph(s), ${texts.join(" ").length} characters ("${short(texts[0], 60)}")`);
        next.paragraphs = change.paragraphs.map(paragraph => ({ paragraph }));
    }
    if (change.list) {
        const items = (tabRow.list || []).map(x => x.item);
        if (JSON.stringify(items) !== JSON.stringify(change.list)) {
            note(change.list.length ? `${label}: list → ${change.list.join(", ")}` : `${label}: list of ${items.length} removed`);
            next.list = change.list.map(item => ({ item }));
        }
    }
    if (change.table && JSON.stringify(tabRow.table || []) !== JSON.stringify(change.table)) {
        note(`${label}: table of ${change.table[0].rows.length - 1} periods (Okres · Co znajdziemy · Gdzie)`);
        next.table = change.table;
    }
    if (change.facts && JSON.stringify(tabRow.facts || []) !== JSON.stringify(change.facts)) {
        note(`${label}: figures → ${change.facts.map(f => `${f.value} (${short(f.label, 40)})`).join("; ")}`);
        next.facts = change.facts;
    }
    if (change.factValues) {
        next.facts = (tabRow.facts || []).map(fact => {
            const value = change.factValues[fact.value];
            if (!value) return fact;
            note(`${label}: figure "${fact.value}" → "${value}"`);
            return { ...fact, value };
        });
    }
    if (change.chart_unit && tabRow.chart_unit !== change.chart_unit) {
        note(`${label}: chart unit "${tabRow.chart_unit}" → "${change.chart_unit}"`);
        next.chart_unit = change.chart_unit;
    }
    if (change.chart_source && tabRow.chart_source !== change.chart_source) {
        note(`${label}: chart note → "${change.chart_source}"`);
        next.chart_source = change.chart_source;
    }
    return next;
}

const CHANGES = {
    skarby: [lead(SKARBY_LEAD), skarbyItems, dropTextRows("text")],
    geostanowiska: [lead(GEOSITES_LEAD), geositesPoints, dropTextRows("text"), literatureTitle],
    geoparki: [lead(GEOPARKS_LEAD), geoparksText],
    slownik: [dictionaryTerms, literatureTitle],
    budowa: [tabRows("budowa")],
    polozenie: [tabRows("polozenie")],
    rzezba: [tabRows("rzezba")],
    galeria: [galleryIntro]
};

withDb(async (db, { apply, dbName }) => {
    console.log(`database: ${dbName}`);
    const onlyArg = process.argv.find(arg => arg.startsWith("--only="));
    const only = onlyArg ? onlyArg.slice(7).split(",") : Object.keys(PAGES);
    const unknown = only.filter(key => !PAGES[key]);
    if (unknown.length) throw new Error(`unknown --only key(s): ${unknown.join(", ")} – use ${Object.keys(PAGES).join(", ")}`);

    const pages = db.collection("pages");
    const titles = await componentTitles(db);
    const report = [];
    const updates = [];

    for (const key of only) {
        const pageUrl = PAGES[key];
        const page = await pages.findOne({ pageUrl });
        if (!page || heroAt(page.rows) < 0) {
            report.push(`skip   ${key} "${pageUrl}": ${page ? "no page_hero" : "no such page"}`);
            continue;
        }
        const notes = [];
        let rows = page.rows;
        for (const change of CHANGES[key]) rows = change(rows, { note: text => notes.push(text), titles });
        report.push(`${notes.length ? "update" : "ok    "} ${key} "${pageUrl}"`);
        notes.forEach(text => report.push(`         ${text}`));
        if (notes.length) updates.push({ _id: page._id, rows });
    }

    printReport("Mockup texts", report, apply);
    if (!apply || !updates.length) return;
    console.log(`backup: ${await backup(db, "mockup-texts", ["pages"])}`);
    for (const update of updates) await updatePageRows(db, update._id, update.rows);
    await bumpContentVersion(db);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
