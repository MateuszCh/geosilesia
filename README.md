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
| `ssr.js` | Renders pages with the Angular server bundle and caches the HTML for 1 hour |
| `shared/seo-meta.js` | SEO rules (title, description, paths) shared by the server and the browser |
| `front/` | Angular 22 application with server-side rendering and hydration |
| `config.json` | Local configuration, not in git — copy `config.example.json` |
| `uploads/` | Files uploaded through the CMS, not in git |

The front end has no routes of its own — every address is a page from the `pages`
collection, and the API decides whether it exists.

## Configuration

`config.json` in the repository root (template: `config.example.json`):

| Key | Meaning |
|---|---|
| `mongoUrl`, `dbName` | MongoDB connection |
| `siteUrl` | Public base URL used for canonical, Open Graph and sitemap URLs. **Mandatory in production** — without it URLs are built from request headers, which a client can forge |
| `deployDomain` | Domain of the app on MyDevil, as shown by `devil www list`. Used only by `npm run deploy` for `devil www restart`; it may differ from the host in `siteUrl` (e.g. without `www`) |
| `allowIndexing` | Must be exactly `true` for search engines to index the site. Missing or anything else means `noindex` everywhere (meta, `X-Robots-Tag`), `Disallow: /` in robots.txt and a 404 for the sitemap — so a fresh clone or staging never ends up in Google |

## Requirements

- Node.js `^22.22.3`, `^24.15.0` or `>=26` (required by Angular 22).

## Local development

First setup:

```bash
npm install                   # server dependencies (root)
cd front && npm ci            # front-end dependencies, exactly as pinned in the lockfile
```

Run `cd front && npm ci` again whenever `front/package-lock.json` changes (e.g. after
pulling someone else's dependency update).

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

### Debugging hydration

Replace `npm run build` with `cd front && npm run watch`. It keeps rebuilding a
development build into `front/dist`, `npm run watch` in the root restarts the backend after
every build,
and the browser console shows hydration statistics and hydration errors (NG05xx).

### When to restart the backend

After any change to `app.js`, `ssr.js` or `shared/`, and after every front-end build — the
server bundle is loaded once per process. `npm run watch` in the root does it
automatically (nodemon). A change in `shared/` also needs a front-end rebuild, because
the front end bundles `shared/seo-meta.js`.

## Build and deployment

On the server:

```bash
git pull
npm run deploy   # front: npm ci + ng build, then devil www restart <deployDomain>
```

Every deployment restarts the Node process, always after the build — the new server
expects the new build. The restart is also what clears all in-memory caches (rendered
HTML, page list, CSR shell). The domain is taken from `deployDomain` in `config.json`;
without it the script stops before building. If the root `package.json` changed, run
`npm install --omit=dev` in the root first.

- `front/dist/` is in `.gitignore`, so every deployment has to build.
- `npm ci` deletes `node_modules` and installs exactly the versions pinned in
  `package-lock.json`, never modifying it. Never use plain `npm install` in `front/` on
  the server: it may pick newer versions within the ranges — `@angular/build` 22.2 pulls
  `sass-embedded`, which hangs the build on the server's platform. That is also why
  `front/package-lock.json` must stay in the repository.
- A front-end-only change needs the restart too: `ssr.js` imports the server bundle once
  per process (Node never unloads ES modules), so without a restart the old bundle keeps
  rendering pages.

## SSR

`app.js` remains the HTTP server; Angular only provides the `render()` function
(`front/src/server.ts`), which `ssr.js` calls.

- **Only existing pages are rendered**, under their normalized `pageUrl`. The result
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
  Components with CMS HTML in `<p [innerHTML]>` (`TitleAndText`, `Gallery`,
  `MarkerCategoryList`) have `ngSkipHydration`, and tables have an explicit `<tbody>` —
  the browser rearranges the DOM of such constructs while parsing. A new component of
  this kind needs the same.
- **The IndexedDB schema in `front/src/app/core/idb.service.ts`** — database `geosilesia`
  v1, store `pages` (key `pageUrl`) and `posts` (key `id`, index `type`). Users have these
  databases on disk; changing the version wipes their offline data.
