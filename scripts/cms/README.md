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
| `01-definitions.js` | 12 new components, new fields on 8 components, `top50` and `zasob` post types, new fields on 4 post types; later also the header band of `page_hero` and the colour of tab figures (step 15 needs them) |
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
| `check-fallbacks.js` | Read-only: pages and posts that still need a front-end fallback (run after the scripts) |
| `restore.js` | Restores collections from a backup |

Run from the repository root, e.g. `node scripts/cms/01-definitions.js` (dry run), then
`node scripts/cms/01-definitions.js --apply --db=<database>`.
