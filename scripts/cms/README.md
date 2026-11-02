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
| `23-photos-albums.js` | "Zdjęcia" gets a third source, "albumy z galerii": the covers of the gallery's first four albums, in the album list's order, each a link to its album. It is the first option and what an empty field means; "Region w obiektywie" on the home page switches to it from the banner |
| `24-category-list-posts.js` | An entry of "Lista kategorii" picks its category ("Kategoria", a "post" field of `icon` posts) instead of repeating its icon file, which the front end matched to the category; icon and colour come from the post |
| `25-top50-markers.js` | A TOP 50 place picks its markers ("Obiekty na mapie", a "post" field of `marker` posts) from their `top50` numbers; the markers lose `top50`, so renumbering the route touches only the TOP 50 posts. Stops if a number has no place |
| `26-preview-picks.js` | TOP 50 gets "Wyróżniona atrakcja" (empty = the first place with a photo; the home preview gets the one it shows today) and "Wiadomości" "Wybrane wydarzenia w zapowiedzi" (empty = the latest) |
| `27-geosites-map-cards.js` | Geostanowiska's "Zobacz w terenie" side list gets cards for the geomorphological sites, the water sites and the underground routes next to the geological ones, each opening the map filtered to its category |
| `28-updates-newest-first.js` | "Tytuł i tekst" gets "Kolejność list" ("od najnowszej daty": the front end sorts dated entries newest first, since frodo appends new ones at the end); "Istotne aktualizacje" uses it and keeps its list oldest first in the CMS |
| `29-top50-new-places.js` | TOP 50 gets "Nagłówek nowych obiektów" and "Nowe obiekty od numeru" (empty = 51): places from that number on follow the heading in a list of their own; the TOP 50 list gets the heading "oraz nowo utworzone obiekty geoturystyczne:" |
| `30-not-found-texts.js` | A post type of its own, "Strona 404" (`not_found`), with one post: the 404 page's eyebrow, title, lead (and its offline version), buttons, signpost boards (label, link, direction) and the offline notice, filled with what the front end showed (the signpost: home, the header button's page, TOP 50). The front end holds no 404 texts any more |
| `31-search-field-texts.js` | The search field's texts go into the CMS: "Wyszukiwarka atrakcji" and "Mapa atrakcji" get the placeholders of both modes, the map also the hints under the field (name mode, location mode, before the map loads); every such row gets the texts the front end showed, which holds them no more |
| `32-album-category-posts.js` | Album categories become posts of their own, "Kategoria albumu" (`album_category`: name, slug of the album list's filter, colour, order), one for each of the three the front end held; the "Kategoria" of the "album" page type and of a "Lista galerii" entry turns into a "post" field and every album and entry picks its post. The front end keeps no list of categories any more |
| `33-top50-settings.js` | What the front end knew about TOP 50 goes into the CMS: a post type of its own, "Ustawienia TOP 50" (`top50_settings`), with one post holding the route's page (found until now by the menu section titled "TOP 50") and the labels "TOP 50 nr {nr}" (map) and "TOP 50 · nr {nr}" (album page); the `top50` component gets "Napis przycisku dalszych miejsc" ("Dalej: miejsca {od}–{do}"); "Nowe obiekty od numeru" loses its default of 51 (the TOP 50 list gets 51). The front end drops its TOP 50 fallbacks |
| `34-geosites-logos-colors.js` | Each database of "Loga geostanowisk" gets "Kolor znacznika" (a trail colour) with the colour the front end gave it in turn (red, blue, green); the front end drops its fallback headings, as every row has one since step 17 (the run stops otherwise) |
| `legacy/page-layout.ts` | The front end's layout as of step 20, which step 18 checks its pages with |
| `check-fallbacks.js` | Read-only: pages and posts that still need a front-end fallback (run after the scripts) |
| `restore.js` | Restores collections from a backup |

Run from the repository root, e.g. `node scripts/cms/01-definitions.js` (dry run), then
`node scripts/cms/01-definitions.js --apply --db=<database>`.
