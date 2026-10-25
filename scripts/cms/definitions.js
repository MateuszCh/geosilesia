// Component and post type definitions of variant C, from the CMS spec
// ("GeoSilesia — wariant C: konfiguracja CMS"). Field labels are what editors see in the
// panel, so they are Polish. Each spec is [id, label, type, selectOptions | nested specs].

const { field } = require("./lib");

const TRAIL_COLORS = "czerwony;zielony;niebieski;czarny;brązowy;turkusowy;fioletowy;żółty;pomarańczowy;różowy";
const KB_SECTIONS = "Do posłuchania;Do poczytania;Do pobrania;Do pooglądania;Animacje i prezentacje;Mapy online;Wirtualne media";
const ALBUM_CATEGORIES = "dziedzictwo Ziemi;dziedzictwo geokulturowe;inne";

const def = (type, title, specs) => ({ type, title, fields: specs.map(spec => field(spec)) });

/** The twelve new row types. */
const newComponents = [
    def("page_hero", "Nagłówek strony", [
        ["title", "Tytuł", "text"],
        ["lead", "Wstęp", "textarea"],
        ["image", "Zdjęcie", "file"],
        ["image_caption", "Podpis zdjęcia", "text"],
        ["image_author", "Autor zdjęcia", "text"],
        ["author", "Autor tekstu", "text"],
        ["published", "Data publikacji", "date"],
        ["updated", "Ostatnia aktualizacja", "date"]
    ]),
    def("map_search", "Wyszukiwarka atrakcji", [
        ["title", "Tytuł", "text"],
        ["map_link", "Strona mapy", "text"],
        ["button_label", "Napis przycisku", "text"]
    ]),
    def("facts", "Liczby", [
        ["title", "Tytuł", "text"],
        ["items", "Liczby", "repeater", [
            ["value", "Wartość", "text"],
            ["label", "Opis", "text"],
            ["auto", "Licz automatycznie", "select", "obiekty na mapie;kategorie;TOP 50;albumy;wydarzenia"]
        ]],
        ["source", "Źródło danych", "text"]
    ]),
    def("category_grid", "Kategorie atrakcji", [
        ["title", "Tytuł", "text"],
        ["intro", "Wstęp", "textarea"],
        ["map_link", "Strona mapy", "text"],
        ["link_label", "Napis odnośnika", "text"]
    ]),
    def("top50", "TOP 50", [
        ["title", "Tytuł", "text"],
        ["intro", "Wstęp", "textarea"],
        ["variant", "Wariant", "select", "lista;zapowiedź"],
        ["limit", "Liczba pozycji", "number"],
        ["link", "Adres odnośnika", "text"],
        ["link_label", "Napis odnośnika", "text"]
    ]),
    def("link_cards", "Karty z odnośnikami", [
        ["title", "Tytuł", "text"],
        ["intro", "Wstęp", "textarea"],
        ["variant", "Wariant", "select", "karty;lista boczna"],
        ["items", "Karty", "repeater", [
            ["title", "Tytuł", "text"],
            ["description", "Opis", "text"],
            ["image", "Zdjęcie", "file"],
            ["link", "Adres", "text"],
            ["color", "Kolor znaku", "select", TRAIL_COLORS]
        ]]
    ]),
    def("photos", "Zdjęcia", [
        ["title", "Tytuł", "text"],
        ["intro", "Wstęp", "textarea"],
        ["variant", "Wariant", "select", "pasek;siatka z podglądem"],
        ["source", "Źródło zdjęć", "select", "baner strony głównej;katalog"],
        ["catalogue", "Katalog", "catalogue"],
        ["link", "Adres odnośnika", "text"],
        ["link_label", "Napis odnośnika", "text"]
    ]),
    def("timeline", "Oś czasu", [
        ["title", "Tytuł", "text"],
        ["intro", "Wstęp", "textarea"],
        ["items", "Punkty", "repeater", [
            ["year", "Rok", "text"],
            ["title", "Nazwa", "text"],
            ["note", "Dopisek", "text"],
            ["highlight", "W regionie", "checkbox"],
            ["link", "Adres", "text"]
        ]]
    ]),
    def("numbered_list", "Lista numerowana", [
        ["title", "Tytuł", "text"],
        ["intro", "Wstęp", "textarea"],
        ["items", "Pozycje", "repeater", [
            ["title", "Nazwa", "text"],
            ["place", "Miejsce", "text"],
            ["text", "Opis", "textarea"],
            ["image", "Zdjęcie", "file"],
            ["image_author", "Autor zdjęcia", "text"],
            ["link", "Adres", "text"]
        ]],
        ["more_title", "Nagłówek uzupełnienia", "text"],
        ["more_items", "Pozycje uzupełnienia", "repeater", [
            ["text", "Pozycja", "text"],
            ["link", "Adres", "text"]
        ]]
    ]),
    def("knowledge_base", "Baza wiedzy", [
        ["title", "Tytuł", "text"],
        ["intro", "Wstęp", "textarea"],
        ["variant", "Wariant", "select", "pełna;zapowiedź"],
        ["section", "Dział", "select", `wszystkie;${KB_SECTIONS}`],
        ["link", "Adres strony Bazy wiedzy", "text"]
    ]),
    def("contact", "Kontakt", [
        ["person_role", "Rola", "text"],
        ["person_name", "Imię i nazwisko", "text"],
        ["email", "E-mail", "text"],
        ["cards", "Karty", "repeater", [
            ["title", "Tytuł", "text"],
            ["text", "Treść", "textarea"]
        ]]
    ]),
    def("notice", "Ramka", [
        ["title", "Tytuł", "text"],
        ["text", "Treść", "textarea"],
        ["variant", "Rodzaj", "select", "cytowanie;uwaga;informacja"]
    ])
];

/**
 * New fields of existing components. Only the added fields are listed – upsert merges
 * them into the stored definition; nested ones go into the repeater with the same id.
 */
const changedComponents = [
    def("homepage_banner", "Homepage banner", [
        ["eyebrow", "Nadtytuł", "text"],
        ["slides", "Slides", "repeater", [
            ["author", "Autor zdjęcia", "text"],
            ["place", "Miejsce", "text"],
            ["description", "Opis", "textarea"]
        ]]
    ]),
    def("tabs", "Tabs", [
        ["tabs", "Tabs", "repeater", [
            ["rows", "Rows", "repeater", [
                ["quote", "Cytat", "textarea"],
                ["quote_author", "Autor cytatu", "text"],
                ["image_author", "Autor ryciny", "text"],
                ["facts", "Liczby", "repeater", [
                    ["value", "Wartość", "text"],
                    ["label", "Opis", "text"],
                    ["note", "Dopisek", "text"]
                ]],
                ["chart_title", "Tytuł wykresu", "text"],
                ["chart_unit", "Jednostka", "text"],
                ["chart", "Słupki", "repeater", [
                    ["label", "Opis", "text"],
                    ["value", "Wartość", "number"],
                    ["highlight", "Wyróżnij", "checkbox"]
                ]],
                ["chart_source", "Źródło wykresu", "text"]
            ]]
        ]]
    ]),
    def("gallery", "Galeria", [
        ["category", "Kategoria", "select", ALBUM_CATEGORIES],
        ["cover", "Okładka", "file"],
        ["author", "Autor", "text"],
        // Not in the spec: albums show their publication date too, and once the byline
        // paragraph is gone this is the only place left for it.
        ["published", "Data publikacji", "date"],
        ["updated", "Ostatnia aktualizacja", "date"],
        ["hidden", "Ukryj na liście albumów", "checkbox"]
    ]),
    def("gallery_list", "Lista galerii", [
        ["intro", "Wstęp", "textarea"],
        ["mode", "Źródło listy", "select", "automatycznie;ręcznie"],
        // Already a select on staging – listed so a database without it gets the field.
        ["galleries", "Galleries", "repeater", [["category", "Kategoria", "select", ALBUM_CATEGORIES]]]
    ]),
    def("news", "Wiadomości", [
        ["intro", "Wstęp", "textarea"],
        ["variant", "Wariant", "select", "lista;zapowiedź"],
        ["limit", "Liczba wpisów", "number"],
        ["link", "Adres strony wydarzeń", "text"],
        ["link_label", "Napis odnośnika", "text"]
    ]),
    def("title_and_text", "Tytuł i tekst", [
        // Retyped from text to select (see RETYPE); the one stored value is rewritten too.
        ["text", "Text", "repeater", [["paragraph_class", "Klasa akapitu", "select", ";pogrubiony;wstęp;cytat"]]]
    ]),
    def("dictionary", "Lista pojęć", [
        ["items", "Items", "repeater", [["title_en", "Odpowiednik obcojęzyczny", "text"]]]
    ]),
    def("geosites_logos", "Loga geostanowisk", [
        ["logos", "Logos", "repeater", [["name", "Nazwa bazy", "text"]]]
    ])
];

/** Fields whose type changes: path inside the definition, as mergeFields reports it. */
const RETYPE = ["text.paragraph_class"];

const pt = (type, title, pluralTitle, specs) => ({ type, title, pluralTitle, fields: specs.map(spec => field(spec)) });

const newPostTypes = [
    pt("top50", "Atrakcja TOP 50", "Atrakcje TOP 50", [
        ["number", "Miejsce w zestawieniu", "number"],
        ["image", "Zdjęcie", "file"],
        ["links", "Źródła", "repeater", [
            ["kind", "Rodzaj", "select", "artykuł;www;galeria;przewodnik;YouTube;inne"],
            ["label", "Własny podpis", "text"],
            ["url", "Adres", "text"]
        ]],
        ["description", "Krótki opis", "textarea"]
    ]),
    pt("zasob", "Zasób bazy wiedzy", "Zasoby bazy wiedzy", [
        ["section", "Dział", "select", KB_SECTIONS],
        ["source", "Wydawca lub seria", "text"],
        ["url", "Adres", "text"],
        ["file", "Plik", "file"],
        ["note", "Opis", "textarea"],
        ["position", "Kolejność w dziale", "number"]
    ])
];

const changedPostTypes = [
    pt("marker", "Marker", "Markers", [
        ["image", "Zdjęcie", "file"],
        ["rock", "Skała lub rodzaj obiektu", "text"],
        ["top50", "Numer w TOP 50", "number"]
    ]),
    // The category's line icon is its existing `icon` field (an SVG since step 12).
    pt("icon", "Ikona", "Ikony", [["color", "Kolor kategorii", "select", TRAIL_COLORS]]),
    pt("wydarzenie", "Wydarzenie", "Wydarzenia", [
        ["place", "Miejsce lub organizator", "text"],
        ["event_date", "Data wydarzenia", "date"]
    ]),
    pt("navigation", "Nawigacja", "navigation", [
        ["cta_label", "Przycisk w nagłówku", "text"],
        ["cta_link", "Adres przycisku", "text"],
        ["footer_text", "Opis w stopce", "textarea"],
        ["footer_note", "Dopisek w stopce", "text"],
        ["nav", "Nav", "repeater", [["subnav", "Subnav", "repeater", [["hide_in_footer", "Ukryj w stopce", "checkbox"]]]]]
    ])
];

module.exports = { newComponents, changedComponents, newPostTypes, changedPostTypes, RETYPE };
