# CMS scripts (variant C)

Node scripts that change the CMS database (frodo's MongoDB) for redesign variant C. They read
`config.json` in the repository root and mirror frodo's write rules (ids from `counters`,
ms timestamps, posts pushed into their post type, `meta.version` bumped after writes).

Every writing script is a **dry run** unless started with `--apply`, and backs up the
collections it touches to `tmp/cms-backups/` before writing. All are idempotent, so they can
be replayed on production later in the same order.

| Script | What it does |
|---|---|
| `inventory.js` | Read-only: definitions, counters, page and post counts (`--json` dumps to `tmp/`) |
| `01-definitions.js` | 12 new components, new fields on 8 components, `top50` and `zasob` post types, new fields on 4 post types |
| `02-navigation-icons.js` | Section links, header button and footer texts; category colours |
| `03-pages.js` | New `mapa-atrakcji` and `baza-wiedzy` pages, new home page rows |
| `04-albums.js` | Album category, cover, author and dates; hidden off-list albums; automatic album list |
| `05-top50.js` | `top50` posts from the TOP 50 page text; the page rebuilt from them |
| `06-content.js` | `page_hero` on content pages, notices, contact, dictionary terms, event places |
| `07-knowledge-base.js` | `zasob` posts from the 7 section pages; the section pages rebuilt |
| `restore.js` | Restores collections from a backup |

Run from the repository root, e.g. `node scripts/cms/01-definitions.js` (dry run), then with
`--apply`.
