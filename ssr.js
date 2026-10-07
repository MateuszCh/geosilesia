// Server-side rendering of pages (Angular SSR) with an in-memory cache of the result.
//
// app.js remains the HTTP server – it only takes the finished page HTML from here. Every
// failure (no build, an exception, a timeout, a database error during the render) ends
// with `null`, and app.js then serves the plain CSR shell, i.e. exactly what the site
// served before SSR was introduced.
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

// Output of `ng build` (outputMode: "server"); server.mjs exports render()
// from front/src/server.ts.
const SERVER_DIR = path.resolve(`${__dirname}/front/dist/geosilesia/server`);
const SERVER_ENTRY = path.join(SERVER_DIR, "server.mjs");
// Copies of the server bundle we actually import from (see loadBuild). It lives in dist,
// so every `ng build` cleans it up by itself.
const RUNTIME_DIR = path.resolve(`${__dirname}/front/dist/geosilesia/ssr-runtime`);
// Fixed render origin, never taken from request headers: the client can forge Host,
// and the result lands in a cache shared by everyone. "localhost" is listed in
// security.allowedHosts in angular.json.
const RENDER_ORIGIN = "http://localhost";
// How long a request waits. A longer render finishes in the background and fills the
// cache for the following requests.
const RENDER_WAIT = 5000;
// Hard limit for a background render – a stuck render must not hold memory forever.
const RENDER_ABORT = 30000;

/**
 * @param {object} options
 * @param {(apiPath: string) => Promise<unknown>} options.api data for /api/… requests
 *        made during a render (SsrApiBackend in front/src/app/core/ssr.ts)
 * @param {number} options.ttl lifetime of rendered HTML in ms
 * @param {(html: string) => boolean} options.accept rejects HTML that cannot be used
 */
function createRenderer({ api, ttl, accept }) {
    let entry = null;
    let entryMtime = 0;
    // Key: the normalized page path. The map holds a Promise, so concurrent requests for
    // the same page wait for one render instead of starting their own.
    const cache = new Map();

    // Node keeps imported ES modules until the process exits, and the bundle files (apart
    // from chunks) have the same names in every build – importing from dist again would
    // return the old code. So every build is imported from its own copy. The PID is part
    // of the name because Passenger can run several application processes at once.
    function loadBuild(mtime) {
        const target = path.join(RUNTIME_DIR, `${process.pid}-${Math.round(mtime)}`);
        return fs.promises
            .cp(SERVER_DIR, target, { recursive: true })
            .then(() => fs.promises.stat(SERVER_ENTRY))
            .then(stat => {
                // The build wrote files while we were copying – the copy may be inconsistent.
                if (stat.mtimeMs !== mtime) throw new Error("build still being written");
                return import(pathToFileURL(path.join(target, "server.mjs")).href);
            });
    }

    // A new build replaces files under a process that keeps running – just like
    // getIndexHtml() in app.js we watch the mtime instead of requiring a restart. Old HTML
    // (referencing JS files that no longer exist) is dropped from the cache at that point.
    function loadEntry() {
        return fs.promises.stat(SERVER_ENTRY).then(stat => {
            if (!entry || stat.mtimeMs !== entryMtime) {
                entryMtime = stat.mtimeMs;
                cache.clear();
                const loading = loadBuild(stat.mtimeMs);
                // A failed load is retried on the next request.
                loading.catch(err => {
                    if (entry === loading) entry = null;
                    console.log(new Date(), "[ssr]", err.message);
                });
                entry = loading;
            }
            return entry;
        });
    }

    function sweep(now) {
        cache.forEach((cached, key) => {
            if (now - cached.at >= ttl) cache.delete(key);
        });
    }

    function startRender(server, pagePath, now) {
        // A database error does not abort the render – components catch it and show an
        // empty page or a 404. Such HTML must not stay in the cache for 10 minutes.
        let apiFailed = false;
        const context = {
            api: apiPath =>
                api(apiPath).catch(err => {
                    apiFailed = true;
                    throw err;
                })
        };
        const promise = server
            .render(
                RENDER_ORIGIN + encodeURI(pagePath),
                context,
                AbortSignal.timeout(RENDER_ABORT)
            )
            .then(html => {
                if (!html || apiFailed || !accept(html)) {
                    throw new Error(`failed to render page ${pagePath}`);
                }
                return html;
            });
        const cached = { promise, at: now };
        cache.set(pagePath, cached);
        promise.catch(err => {
            if (cache.get(pagePath) === cached) cache.delete(pagePath);
            console.log(new Date(), "[ssr]", err.message);
        });
        return promise;
    }

    /**
     * HTML of the page at `pagePath`, or `null` when the CSR shell has to be served.
     * Never rejects. `hit` tells whether the request found an existing cache entry.
     */
    function render(pagePath) {
        const result = loadEntry().then(server => {
            const now = Date.now();
            const cached = cache.get(pagePath);
            if (cached && now - cached.at < ttl) {
                return cached.promise.then(html => ({ html, hit: true }));
            }
            sweep(now);
            return startRender(server, pagePath, now).then(html => ({ html, hit: false }));
        });

        let timer;
        const timeout = new Promise(resolve => {
            timer = setTimeout(() => resolve(null), RENDER_WAIT);
        });
        return Promise.race([result.catch(() => null), timeout]).finally(() =>
            clearTimeout(timer)
        );
    }

    return { render };
}

module.exports = { createRenderer };
