# CMS scripts (variant C)

Node scripts that change the CMS database (frodo's MongoDB) for redesign variant C. They read
`config.json` in the repository root and mirror frodo's write rules (ids from `counters`,
ms timestamps, posts pushed into their post type, `meta.version` bumped after writes).

Every writing script is a **dry run** unless started with `--apply --db=<database>`, where
the name must match `dbName` in `config.json` (a guard against writing to the wrong server
with a copied config). It backs up the collections it touches to `tmp/cms-backups/` before
writing. All are idempotent, so they can
be replayed on production later in the same order.

| Script | What it does |
|---|---|
| `inventory.js` | Read-only: definitions, counters, page and post counts (`--json` dumps to `tmp/`) |
| `01-definitions.js` | 12 new components, new fields on 8 components, `top50` and `zasob` post types, new fields on 4 post types; later also the header band of `page_hero` and the colour of tab figures (step 15 needs them) and the fields of step 17 |
| `02-navigation-icons.js` | Section links, header button and footer texts; category colours |
| `03-pages.js` | New `mapa-atrakcji` and `baza-wiedzy` pages, new home page rows |
| `04-albums.js` | Album category, cover, author and dates; hidden off-list albums; automatic album list |
| `05-top50.js` | `top50` posts from the TOP 50 page text; the page rebuilt from them |
| `06-content.js` | `page_hero` on content pages, notices, contact, dictionary terms, event places |
| `07-knowledge-base.js` | `zasob` posts from the 7 section pages; the section pages rebuilt |
| `08-photos.js` | Banner slides get author, place and description from the "Fotografie" page; the page becomes a photo grid |
| `09-markers.js` | Marker `top50` from `data/top50-markers.json`, marker `rock` from the titles; the TOP 50 list links to the map |
| `10-content-drafts.js` | Drafts: Skarby natury as a numbered list, Geoparki timeline and figures, figures and charts on Położenie and Rzeźba terenu (`--only=` picks pages) |
| `11-header-photos.js` | Banner photos as header photos of five content pages |
| `12-category-icons.js` | The design system's category line icons into `uploads/` and the file library; each map category's `icon` field points at its SVG; `line_icon` dropped |
| `13-knowledge-base-sections.js` | Section pages get the knowledge base's header; links to the retired `baza-wiedzy` page point at its redirect target (`shared/redirects.js`); the page is removed |
| `14-side-cards.js` | The column beside the text on Geostanowiska (database names, a map card) and Geoparki (a Geopark Północnej Jury card) |
| `15-mockup-layout.js` | Nine pages laid out as in the mockups: header bands, header photos (off on Położenie, Geoparki and TOP 50, on for Rzeźba terenu), leads in the header, "Co warto wiedzieć", side lists and cards, the Żytko quote, figure colours, the gallery lead |
| `16-mockup-texts.js` | The mockups' shorter texts on eight pages (`--only=` picks pages) and the note under the TOP 50 route; "A ponadto" as short items beside the list; Położenie's extreme points as figures; the fossils as a table; `{albumy}` in the gallery intro becomes the album count. Maps, tables, charts and map legends stay |
| `17-fixed-headings.js` | Headings the front end held now in the CMS: the databases heading, the TOP 50 eyebrows, the timeline legend, the other albums heading (navigation post) |
| `18-page-types.js` | Page types (needs frodo with page types): "Strona treści" takes the page_hero row and the rows beside the text ("Kolumna boczna"), "Album" the album fields of the gallery row; the page_hero component and those gallery fields go. The dry run lays out every changed page with the front end's `layoutPage` as of step 20 (`legacy/page-layout.ts`) and SEO meta before and after; `--apply` writes only when nothing differs. Earlier steps must not be replayed after it: they would bring back what it moved |
| `19-columns.js` | The "Kolumny" component (columns, each a list of "component" fields); the events and knowledge base previews of the home page, which the front end used to pair by itself, become one "Kolumny" row |
| `20-dictionary-literature.js` | "Lista pojęć" gets a "component" field "Pod listą pojęć", drawn under the terms; the literature after the dictionary of "Słowa kluczowe", which the front end used to move there by itself, goes into it |
| `21-explicit-layout.js` | The front end stops inferring layouts from the kinds and order of rows: "Strona treści" gains "W nagłówku" (a component), "Przycisk przy tytule", "Menu działu", "Autor i daty" and the "Dalej w dziale" card; the dictionary gets "Wyszukiwarka w nagłówku strony", tabs "Bez spisu „Na tej stronie”", the map "Tytuł jako nagłówek strony", TOP 50 "Pod trasą" (a component) and a column of "Kolumny" "Szersza kolumna". Every page gets the values that keep its look (the figures of Geoparki and Położenie move into the header, the TOP 50 note under the route) |
| `22-banner-title-size.js` | "Homepage banner" gets "Rozmiar tytułu" (duży / średni / mały, the desktop size in brackets; empty = duży) right under the title; the home page's banner is set to "mały" |
| `legacy/page-layout.ts` | The front end's layout as of step 20, which step 18 checks its pages with |
| `check-fallbacks.js` | Read-only: pages and posts that still need a front-end fallback (run after the scripts) |
| `restore.js` | Restores collections from a backup |

Run from the repository root, e.g. `node scripts/cms/01-definitions.js` (dry run), then
`node scripts/cms/01-definitions.js --apply --db=<database>`.
