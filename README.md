# GeoSilesia

A website about the geological, geomorphological and post-industrial heritage of the
Silesian Voivodeship. Content is edited by an external CMS application that writes
straight to MongoDB; this repository contains the server and the front end that
display it.

Code, comments and docs are written in English; Polish is used only for text shown to
site visitors.

## Repository layout

| Path | What it is |
|---|---|
| `app.js` | HTTP server (Express + MongoDB): API, static files, SEO meta injection, sitemap, robots, SSR orchestration |
| `pages.js` | The `pages` collection as the public site reads it: published pages only (drafts left out) |
| `ssr.js` | Renders pages with the Angular server bundle and caches the HTML for 1 hour |
| `shared/seo-meta.js` | SEO rules (title, description, paths) shared by the server and the browser |
| `visits.js` | Visit statistics without cookies: page views and events in MongoDB, read by the CMS (see below) |
| `front/` | Angular 22 application with server-side rendering and hydration |
| `config.json` | Local configuration, not in git — copy `config.example.json` |
| `uploads/` | Files uploaded through the CMS, not in git |

The front end has no routes of its own — every address is a page from the `pages`
collection, and the API decides whether it exists.

**Drafts.** The CMS can mark a page as a draft (`draft: true` on its document); it only
stores the flag. For the public site a draft does not exist: its address answers 404 like
a missing page (on a full load and inside the app), and it is left out of the sitemap, the
SEO meta, server-side rendering, the gallery list and "Inne albumy" (a `gallery_list` row
on a draft page does not count either), `/api/appData` and the view statistics. Pages
without the field or with `draft: false` are published, so old documents need no
migration. Every read goes through `publishedPages` (`pages.js`), which adds
`draft: { $ne: true }` to each `find` — `collections.pages` in `app.js` is that wrapper, not
the raw collection, so a new query cannot forget the filter. The scripts in `scripts/cms/`
edit the CMS data and read the raw collection, drafts included. Switching a page to or
from draft is a page save, so the CMS bumps the content version and the caches below are
cleared.

## Configuration

`config.json` in the repository root (template: `config.example.json`):

| Key | Meaning |
|---|---|
| `mongoUrl`, `dbName` | MongoDB connection |
| `siteUrl` | Public base URL used for canonical, Open Graph and sitemap URLs. **Mandatory in production** — without it URLs are built from request headers, which a client can forge |
| `deployDomain` | Domain of the app on MyDevil, as shown by `devil www list`. Used only by `npm run deploy` for `devil www restart`; it may differ from the host in `siteUrl` (e.g. without `www`) |
| `allowIndexing` | Must be exactly `true` for search engines to index the site. Missing or anything else means `noindex` everywhere (meta, `X-Robots-Tag`), `Disallow: /` in robots.txt and a 404 for the sitemap — so a fresh clone or staging never ends up in Google |

## Visit statistics

Counted on the server, without cookies, consent banner or anything stored in the browser
(`visits.js`); the CMS shows them in its Analytics tab, `node scripts/stats.js` in the
terminal. Every page view is one document in `visits` with the path, a visitor id that
changes daily (a hash of a daily random salt, the network, the user agent and the language;
neither the IP nor the user agent is stored), the referring site, and the device kind,
browser and system family and browser language.
`visit_events` holds what a view does not say: addresses that do not exist (`notFound`),
how long a page was visible (`engagement`, sent by the front with `navigator.sendBeacon`
to `POST /api/visit-event` when a page is hidden or left) and clicks on links to other
sites or to documents (`outbound`, `download`).

Only what the site's own script reports counts: a full load is recorded when the front
sends its `view` beacon (with `document.referrer`; a 404 when the address is no page), and
a page opened inside the app by its `X-Page-View` API request, so scrapers and scanners
that fetch pages without running JavaScript leave no trace. The server never counts the
document request itself; a prerendered page counts only once it is shown. Bots that name
themselves in the user agent are skipped as well. Everything written this way carries
`confirmed: true`; the readers (Frodo, `scripts/stats.js`) count older documents only for
visitors who ran the page's script that day.

## Requirements

- Node.js `^22.22.3`, `^24.15.0` or `>=26` (required by Angular 22).

## Local development

First setup:

```bash
npm ci                        # server dependencies (root), exactly as pinned in package-lock.json
cd front && npm ci            # front-end dependencies, exactly as pinned in front/package-lock.json
```

Run `npm ci` again (in the root or in `front/`) whenever its `package-lock.json` changes
(e.g. after pulling someone else's dependency update). Add or update a dependency with
`npm install <pkg>` and commit the updated lockfile. `engines` in `package.json` gives the
Node versions the Angular CLI accepts.

### Everyday front-end work

Two terminals:

```bash
npm run watch                 # root: backend on :3000, restarts on changes to app.js, ssr.js, shared/
```

```bash
cd front && npm start         # ng serve on :4200, reloads on front-end changes
```

Open `http://localhost:4200`. `proxy.conf.json` forwards `/api` and `/uploads` to port
3000. `ng serve` renders pages on the server by itself — without the context from
`app.js` data goes through plain `fetch` via the proxy, so the backend has to be running.

What `ng serve` does **not** give you: the SEO meta injected by `app.js`, the 1-hour
HTML cache and the service worker. Use the production-like check for those.

### Production-like check

```bash
cd front && npm run build     # production build into front/dist/geosilesia
```

```bash
npm run watch                 # root, or plain `node app.js`
```

Open `http://localhost:3000`. This is exactly the path used in production: rendering
through `app.js`, injected meta, cache, and the `X-Render` response header.

### Both watchers in one terminal

```bash
npm run dev                   # root: front/ `npm run watch` + root `npm run watch` together
```

`dev.sh` runs the development build of the front end in watch mode and the backend on
`:3000`, which nodemon restarts after every build. Open `http://localhost:3000` — the
same path as production, with a development build. Until the first build finishes the
backend serves whatever is already in `front/dist`. Ctrl+C stops both; if either one
exits, the other is stopped too.

### Debugging hydration

Use `npm run dev` (or `cd front && npm run watch` next to `npm run watch` in the root). It
keeps rebuilding a development build into `front/dist`, the backend restarts after every
build, and the browser console shows hydration statistics and hydration errors (NG05xx).

### When to restart the backend

After any change to `app.js`, `ssr.js` or `shared/`, and after every front-end build — the
server bundle is loaded once per process. `npm run watch` in the root does it
automatically (nodemon). A change in `shared/` also needs a front-end rebuild, because
the front end bundles `shared/seo-meta.js`.

## Build and deployment

On the server:

```bash
npm run deploy   # git pull --ff-only; root: npm ci --omit=dev; front: npm ci + ng build into tmp/; swap; devil www restart <deployDomain>
```

The script pulls the code itself (`--ff-only`: a server clone with commits of its own
stops there) and then runs again from the start, since the pull may have changed it. The
build goes to `tmp/front-build` and replaces `front/dist/geosilesia` only once it has
succeeded: the running process keeps serving the old build until the restart, and a failed
or hung build leaves the site as it was.

Every deployment restarts the Node process, always after the build — the new server
expects the new build. The restart is also what clears all in-memory caches (rendered
HTML, page list, CSR shell). The domain is taken from `deployDomain` in `config.json`;
without it the script stops before installing anything. The server dependencies are
installed by the script as well (`npm ci --omit=dev` in the root, exactly as pinned in
`package-lock.json`), so a change to the root dependencies needs no manual step.

- `front/dist/` is in `.gitignore`, so every deployment has to build.
- `npm ci` deletes `node_modules` and installs exactly the versions pinned in
  `package-lock.json`, never modifying it. Never use plain `npm install` on the server: it
  may keep or pick other versions within the ranges — `@angular/build` 22.2 pulls
  `sass-embedded`, which hangs the build on the server's platform, and the root once kept an
  Express 4.16 without `express.text`, which stopped the app. That is also why both lockfiles
  must stay in the repository.
- A front-end-only change needs the restart too: `ssr.js` imports the server bundle once
  per process (Node never unloads ES modules), so without a restart the old bundle keeps
  rendering pages.

## SSR

`app.js` remains the HTTP server; Angular only provides the `render()` function
(`front/src/server.ts`), which `ssr.js` calls.

- **Only existing pages are rendered** (published ones — a draft gets the 404 shell),
  under their normalized `pageUrl`. The result
  lives in memory for 1 hour (the same as the page list used for meta and the
  sitemap). After every saved page, post, post type or file the CMS (frodo) increments
  `version` in the `meta` collection (`{ _id: "content" }`, same database). Each Node
  process checks it at most every 5 s and clears both caches when it changes, so changes
  show up within seconds in every process and the TTL is only a safety net. A 404, a database outage, a missing build, an error or a render longer than
  5 s → the CSR shell (`index.csr.html`), as before SSR. The
  `X-Render: ssr-hit | ssr-miss | csr` header tells which path was taken.
- **Render data does not go over the network.** `SsrApiBackend`
  (`front/src/app/core/ssr.ts`) serves GETs to `/api/page/…` and `/api/posts/…` with
  functions from `app.js` passed in `REQUEST_CONTEXT`. It is a backend, not an
  interceptor: only this way do the responses end up in the HTTP transfer cache, from
  which the browser takes data during hydration.
- **Lists a page only derives something from stay out of the HTML.** The home page
  counts all markers and shows three events; sending the lists would add over 1 MB, and the
  browser hydrates only after the whole HTML has arrived. `ContentService.summary` sends
  the result alone in TransferState and fetches the lists past the transfer cache.
- **`<head>` is assembled by `app.js`** (`injectSeo`) for every response, rendered or
  not; `SeoService` does nothing on the server and only updates meta on in-app navigation.
- The first navigation on a server-rendered page skips IndexedDB in the resolver (the
  `RENDERED_ON_SERVER` flag in TransferState) — otherwise an older copy of the page from
  the offline database would not match the HTML.

## Do not change without checking

- **The `<!--seo:start-->` / `<!--seo:end-->` markers in `front/src/index.html`** — the
  server replaces the block between them with the meta of the particular page. Without
  them the site has no SEO, and no error says so.
- **`shared/seo-meta.js`** — shared by the server and the front end; both sides must
  compute the title and description identically. Types are in `shared/seo-meta.d.ts`.
- **`navigationRequestStrategy: "freshness"` in `front/ngsw-config.json`** — without it
  the service worker would answer navigations from the cached shell, so every page would
  get generic meta and no server-rendered content.
- **`/index.csr.html` as `index` and in `assetGroups` in `front/ngsw-config.json`** — with
  SSR the CSR shell has this name; it is the offline navigation fallback. `app.js` serves
  it (and `/index.html`) byte for byte, because ngsw checks its hash.
- **Hydration requires the server DOM to be identical to the client's first render.**
  CMS HTML goes in with `[appHtml]` (`front/src/app/shared/html.directive.ts`), never
  `[innerHTML]`: hydration would write innerHTML again, repaint the text and move LCP to
  the moment the JS runs. Put it on a `<div>`. Components with CMS HTML in a `<p>` or
  `<li>` (`TitleAndText`, `Gallery`, `MarkerCategoryList`) have `ngSkipHydration`, and
  tables have an explicit `<tbody>` — the browser rearranges the DOM of such constructs
  while parsing. A new component of this kind needs the same. `ngSkipHydration` costs LCP
  too: the component's server DOM is thrown away and painted again.
- **The IndexedDB schema in `front/src/app/core/idb.service.ts`** — database `geosilesia`
  v1, store `pages` (key `pageUrl`) and `posts` (key `id`, index `type`). A page the
  server answers as missing (`{ pages: [] }`: deleted, or now a draft) is removed from the
  store and shown as a 404 (`ResourceService.loadPageFromNetwork` returns `null`); only no
  answer at all (offline, an error) falls back to the stored copy. Users have these
  databases on disk; changing the version wipes their offline data.
