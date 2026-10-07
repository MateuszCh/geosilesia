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
const SERVER_ENTRY = path.resolve(`${__dirname}/front/dist/geosilesia/server/server.mjs`);
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
    // Key: the normalized page path. The map holds a Promise, so concurrent requests for
    // the same page wait for one render instead of starting their own.
    const cache = new Map();

    // The bundle is imported once per process – Node keeps ES modules until the process
    // exits, so a new build is picked up only by a restart (npm run deploy does it), which
    // also clears this cache. The file is checked first, so that a request made before the
    // first build does not leave a failed import behind; a failed load is retried on the
    // next request.
    function loadEntry() {
        if (!entry) {
            const loading = fs.promises
                .access(SERVER_ENTRY)
                .then(() => import(pathToFileURL(SERVER_ENTRY).href));
            loading.catch(err => {
                if (entry === loading) entry = null;
                console.log(new Date(), "[ssr]", err.message);
            });
            entry = loading;
        }
        return entry;
    }

    function sweep(now) {
        cache.forEach((cached, key) => {
            if (now - cached.at >= ttl) cache.delete(key);
        });
    }

    function startRender(server, pagePath, now) {
        // A database error does not abort the render – components catch it and show an
        // empty page or a 404. Such HTML must not stay in the cache for the whole TTL.
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

    /**
     * Drops every rendered page (clearContentCaches in app.js). A render still in progress
     * no longer lands in the cache – its entry is gone – so the next request renders anew.
     */
    function clear() {
        cache.clear();
    }

    return { render, clear };
}

module.exports = { createRenderer };
