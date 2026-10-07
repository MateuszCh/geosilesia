const express = require("express"),
    bodyParser = require("body-parser"),
    path = require("path"),
    fs = require("fs"),
    crypto = require("crypto"),
    MongoClient = require("mongodb").MongoClient,
    config = require("./config"),
    seoMeta = require("./shared/seo-meta"),
    { createRenderer } = require("./ssr");

const app = express();
app.set("port", process.env.PORT || 3000);
// On the hosting Node sits behind a proxy – without this req.protocol always returns
// "http", so the fallback base URL (when config.siteUrl is missing) would be built with
// the wrong scheme. We trust ONLY the first hop, because further X-Forwarded-Proto
// entries come from the client.
// Note: the base URL taken from the request is only a fallback. Neither X-Forwarded-Host
// nor the Host header itself is trustworthy – the client can forge both if the proxy
// does not overwrite them – so "siteUrl" in config.json is mandatory in production.
app.set("trust proxy", 1);

// Global indexing switch – one flag for the whole site, no per-page settings.
// Deliberately OFF by default: a fresh clone or a staging instance without the entry
// in config.json must never end up in Google. Compared with `true`, not truthiness –
// "false" stored as a string has to block as well.
const allowIndexing = config.allowIndexing === true;

if (!allowIndexing) {
    console.warn(
        '[seo] "allowIndexing" is not set to true – the site sends noindex' +
            " and blocks robots in robots.txt. Set it in config.json in production."
    );
}

let db;
const collections = {};
let databaseError = false;

const client = new MongoClient(config.mongoUrl);

client.connect()
    .then(client => {
        db = client.db(config.dbName);
        collections.posts = db.collection("posts");
        collections.pages = db.collection("pages");
        collections.files = db.collection("files");
        app.listen(app.get("port"), () => console.log("Running on port 3000"));
    })
    .catch(err => {
        databaseError = err;
        console.log(new Date(), err);
        app.listen(app.get("port"), () => console.log("Running on port 3000"));
    });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// A header rather than just <meta>: it also covers files from /uploads (images, PDFs),
// which have nowhere to put a meta tag and which Google indexes separately. It has to
// come before all routes and before express.static, otherwise static responses skip it.
if (!allowIndexing) {
    app.use((req, res, next) => {
        res.set("X-Robots-Tag", "noindex, nofollow");
        next();
    });
}

app.get("/api*", (req, res, next) => {
    if (databaseError) {
        res.status(503).send({ error: "Resource unavailable" });
    } else {
        next();
    }
});

// Data for the /api/* routes lives outside the handlers because server-side rendering
// uses it too (ssrApi below) – both paths must return exactly the same thing.
function postsOfType(type) {
    return collections.posts.find({ type }).toArray();
}

// Replaces the catalogue name in "gallery" rows with the list of files from the files
// collection. Each gallery gets the result of its own query – previously responses were
// assigned by index among all galleries while queries were only made for those with
// a catalogue, so a gallery without one shifted the files of the following ones
// (visible in /api/appData/).
function attachGalleries(pages) {
    const galleries = [];
    (pages || []).forEach(page => {
        (page.rows || []).forEach(row => {
            if (row.type === "gallery" && row.data && row.data.catalogue) {
                galleries.push(row);
            }
        });
    });
    return Promise.all(
        galleries.map(gallery =>
            collections.files
                .find({ catalogues: gallery.data.catalogue })
                .toArray()
                .then(files => {
                    gallery.data.catalogue = files;
                })
        )
    ).then(() => pages);
}

// The server matches a page by its normalized path, so "/slownik/" returns 200 with
// full meta. If the API compared pageUrl literally, the same address would come back
// empty to the SPA and the user would see a 404 on an existing page. Instead of a regex
// (expensive, no index) we enumerate the handful of accepted spellings.
function pageUrlCandidates(pageUrl) {
    const normalized = seoMeta.normalizePath(pageUrl);
    if (normalized === "/") return ["/", ""];
    const bare = normalized.slice(1);
    return [bare, normalized, `${bare}/`, `${normalized}/`];
}

function pageData(pageUrl) {
    return collections.pages
        .find({ pageUrl: { $in: pageUrlCandidates(pageUrl) } })
        .toArray()
        .then(attachGalleries)
        .then(pages => ({ pages }));
}

app.get("/api/posts/:type", (req, res, next) => {
    postsOfType(req.params.type)
        .then(posts => res.send(posts))
        .catch(next);
});

app.get("/api/page/", (req, res, next) => {
    collections.pages
        .find({ pageUrl: "/" })
        .toArray()
        .then(page => res.send(page))
        .catch(next);
});

app.get("/api/appData/", (req, res, next) => {
    Promise.all([
        collections.pages.find({}).toArray().then(attachGalleries),
        collections.posts.find({}).toArray()
    ])
        .then(([pages, posts]) => res.send({ pages, posts }))
        .catch(next);
});

app.get("/api/page/:pageUrl", (req, res, next) => {
    pageData(req.params.pageUrl)
        .then(data => res.send(data))
        .catch(next);
});

//////////////////////
// SEO (sitemap, meta) //
//////////////////////

// Output directory of `ng build` (builder @angular/build:application).
const FRONT_DIR = path.resolve(`${__dirname}/front/dist/geosilesia/browser`);
// CSR shell – with outputMode "server" the build names it index.csr.html. Served instead
// of an SSR render for 404s, when the database is down and when rendering fails.
const INDEX_PATH = path.resolve(`${FRONT_DIR}/index.csr.html`);
const SEO_START = "<!--seo:start-->";
const SEO_END = "<!--seo:end-->";
const PAGES_TTL = 30 * 60 * 1000;

let pagesCache = null;
let pagesCacheAt = 0;

// In-memory list of pages – used by both the sitemap and the meta injection.
// Pages are edited by an external application writing straight to Mongo, so changes
// show up after the TTL at the latest, without a restart or a front-end rebuild.
function getPages() {
    if (databaseError || !collections.pages) {
        return Promise.reject(new Error("Database unavailable"));
    }
    if (pagesCache && Date.now() - pagesCacheAt < PAGES_TTL) {
        return Promise.resolve(pagesCache);
    }
    return collections.pages
        .find({})
        .toArray()
        .then(pages => {
            pagesCache = pages;
            pagesCacheAt = Date.now();
            return pages;
        });
}

let indexCache = null;
let indexMtime = 0;

// The built shell changes with every `ng build`, so we watch its mtime instead of
// reading the file once at process start.
function getIndexHtml() {
    return fs.promises.stat(INDEX_PATH).then(stat => {
        if (indexCache && stat.mtimeMs === indexMtime) {
            return indexCache;
        }
        return fs.promises.readFile(INDEX_PATH, "utf8").then(html => {
            indexCache = html;
            indexMtime = stat.mtimeMs;
            return html;
        });
    });
}

if (!config.siteUrl) {
    console.warn(
        '[seo] "siteUrl" is missing in config.json – canonical, OG and sitemap URLs will' +
            " be built from request headers. Set it in production."
    );
}

function siteUrl(req) {
    const configured = (config.siteUrl || "").replace(/\/+$/, "");
    return configured || `${req.protocol}://${req.get("host")}`;
}

// req.path is percent-encoded while pageUrl in the database stores characters as-is
// ("galeria/minerały-województwa-śląskiego"), so without decoding such pages would not
// be matched and would end up as 404s.
function decodePath(reqPath) {
    try {
        return decodeURIComponent(reqPath);
    } catch (err) {
        return reqPath; // malformed %-sequence – compare as is
    }
}

// normalizePath brings both sides of the comparison to the same form (leading slash,
// no trailing one), so "/slownik", "slownik" and "slownik/" are one page.
function findPage(pages, reqPath) {
    const wanted = seoMeta.normalizePath(decodePath(reqPath));
    return pages.find(page => seoMeta.normalizePath(page.pageUrl) === wanted);
}

// Computes the title and description of a page; no page means a 404.
function metaForPage(page) {
    if (!page) {
        return {
            title: seoMeta.NOT_FOUND_TITLE,
            description: seoMeta.DEFAULT_DESCRIPTION
        };
    }
    return seoMeta.buildMeta(page);
}

// Escaping "<" prevents database content from breaking out of the <script>.
function jsonLdScript(data, attrs) {
    return (
        `<script type="application/ld+json"${attrs ? " " + attrs : ""}>` +
        JSON.stringify(data).replace(/</g, "\\u003c") +
        "</script>"
    );
}

// Builds the contents of the <!--seo:start--> … <!--seo:end--> block.
// `updated` (ISO or "") only appears for pages that have a modification date.
function buildSeoBlock(meta, base, canonical, updated) {
    const e = seoMeta.escapeHtml;
    const title = meta.title;
    const description = meta.description;
    const image = base + seoMeta.DEFAULT_IMAGE;

    return [
        allowIndexing ? "" : `<meta name="robots" content="noindex, nofollow">`,
        `<title>${e(title)}</title>`,
        `<meta name="description" content="${e(description)}">`,
        `<link rel="canonical" href="${e(canonical)}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${e(seoMeta.SITE_NAME)}">`,
        `<meta property="og:title" content="${e(title)}">`,
        `<meta property="og:description" content="${e(description)}">`,
        `<meta property="og:url" content="${e(canonical)}">`,
        `<meta property="og:image" content="${e(image)}">`,
        updated
            ? `<meta property="og:updated_time" content="${e(updated)}">`
            : "",
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${e(title)}">`,
        `<meta name="twitter:description" content="${e(description)}">`,
        `<meta name="twitter:image" content="${e(image)}">`,
        jsonLdScript({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: seoMeta.SITE_NAME,
            url: base,
            description: seoMeta.DEFAULT_DESCRIPTION,
            logo: image
        }),
        // Per-page node – marked with data-seo so that SeoService updates this one on
        // SPA navigation and not the site-wide Organization above.
        updated
            ? jsonLdScript(
                  {
                      "@context": "https://schema.org",
                      "@type": "WebPage",
                      url: canonical,
                      name: title,
                      description: description,
                      dateModified: updated
                  },
                  'data-seo="webpage"'
              )
            : ""
    ]
        .filter(Boolean)
        .join("");
}

// Generic meta block of the shell: canonical points to "/", because it is the same
// document without the content of any particular page. Used on the fallback path when
// the database is down — /index.html itself is served untouched so that its hash in the
// service worker manifest still matches.
function defaultSeoBlock(base) {
    return buildSeoBlock(
        {
            title: seoMeta.DEFAULT_TITLE,
            description: seoMeta.DEFAULT_DESCRIPTION
        },
        base,
        base + "/",
        "" // generic shell – no date of a particular page
    );
}

function injectSeo(html, block) {
    const start = html.indexOf(SEO_START);
    const end = html.indexOf(SEO_END);
    if (start === -1 || end === -1 || end < start) return html;
    return html.slice(0, start + SEO_START.length) + block + html.slice(end);
}

///////////////////////////
// SSR (Angular rendering) //
///////////////////////////

// Counterparts of the /api/page/:pageUrl and /api/posts/:type routes for server-side
// rendering. Requests made during a render do not go over the network – under Passenger
// the process has no predictable port. The JSON round trip yields exactly what the
// browser receives (ObjectIds and dates as strings) – otherwise the server HTML would
// differ from the client's first render.
function ssrApi(apiPath) {
    const match = /^\/api\/(page|posts)\/([^/]+)$/.exec(apiPath);
    if (!match) {
        return Promise.reject(new Error(`unsupported request ${apiPath}`));
    }
    if (databaseError) {
        return Promise.reject(new Error("Database unavailable"));
    }
    const param = decodePath(match[2]);
    const data = match[1] === "page" ? pageData(param) : postsOfType(param);
    return data.then(result => JSON.parse(JSON.stringify(result)));
}

// Rendered HTML lives as long as the page list (PAGES_TTL): a CMS change shows up in the
// content no later than in the meta and the sitemap. The SEO block is injected only when
// sending, because it depends on the request's base URL while the cache is shared.
const renderer = createRenderer({
    api: ssrApi,
    ttl: PAGES_TTL,
    // HTML without the markers would mean a page without meta – the CSR shell is better.
    accept: html => html.includes(SEO_START) && html.includes(SEO_END)
});

// Called by the CMS (frodo) after every saved page, post or file, so that changes do not
// wait for PAGES_TTL – the TTL stays only as a safety net. It clears the caches of this
// process only. Disabled (404) without "cacheClearSecret" in config.json.
function sha256(value) {
    return crypto.createHash("sha256").update(String(value)).digest();
}

app.post("/internal/cache/clear", (req, res) => {
    if (!config.cacheClearSecret) {
        res.status(404).type("text/plain").send("Not found");
        return;
    }
    // Hashes have equal lengths, which timingSafeEqual requires; the comparison then takes
    // the same time whatever the header contains.
    const given = sha256(req.get("X-Cache-Secret") || "");
    if (!crypto.timingSafeEqual(given, sha256(config.cacheClearSecret))) {
        res.status(403).type("text/plain").send("Forbidden");
        return;
    }
    pagesCache = null;
    renderer.clear();
    console.log(new Date(), "[ssr] cache cleared");
    res.status(204).end();
});

// Diagnostic header: whether the response is a cached render, a fresh render or the shell.
function renderLabel(result) {
    if (!result) return "csr";
    return result.hit ? "ssr-hit" : "ssr-miss";
}

// These routes must precede express.static, otherwise the file on disk would win.
app.get("/sitemap.xml", (req, res) => {
    // 404 rather than an empty <urlset>: an empty sitemap says "site without content",
    // while we mean "there is no sitemap here". It also saves a database query.
    if (!allowIndexing) {
        res.status(404).type("text/plain").send("Not found");
        return;
    }
    getPages()
        .then(pages => {
            const base = siteUrl(req);
            // The key is the normalized path, because "x" and "/x" lead to the same URL.
            // On a collision the newer date wins – the sitemap should report the last change.
            const byPath = new Map();
            pages.forEach(page => {
                if (!page || !page.pageUrl) return;
                const pagePath = seoMeta.normalizePath(page.pageUrl);
                const updated = seoMeta.updatedIso(page);
                const current = byPath.get(pagePath);
                if (!current || updated > current) byPath.set(pagePath, updated);
            });
            const urls = Array.from(byPath.entries())
                .map(([pagePath, updated]) => {
                    // The sitemap requires URLs that are percent-encoded AND
                    // entity-escaped – encodeURI only on the path, so as not to
                    // touch "://" in the base URL.
                    const loc = seoMeta.escapeHtml(base + encodeURI(pagePath));
                    // Date only, no time: the "updated" field is sometimes stored with
                    // day precision, and a full timestamp would suggest precision it lacks.
                    const lastmod = updated
                        ? `\n        <lastmod>${updated.slice(0, 10)}</lastmod>`
                        : "";
                    return `    <url>\n        <loc>${loc}</loc>${lastmod}\n    </url>`;
                })
                .join("\n");
            res.type("application/xml").send(
                '<?xml version="1.0" encoding="UTF-8"?>\n' +
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                    urls +
                    "\n</urlset>\n"
            );
        })
        // 503, not a client error – the crawler should come back later (same as /api/*).
        .catch(() => res.status(503).type("text/plain").send("Resource unavailable"));
});

app.get("/robots.txt", (req, res) => {
    if (!allowIndexing) {
        // No Sitemap line – it would point to a URL that returns 404 anyway.
        res.type("text/plain").send("User-agent: *\nDisallow: /\n");
        return;
    }
    res.type("text/plain").send(
        `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`
    );
});

// /index.csr.html (the CSR shell) and /index.html are the same document as "/", so
// without this they would be indexed separately as duplicates. We neither redirect nor
// inject meta here: the shell is listed in the service worker manifest (ngsw.json) with
// its hash and is fetched exactly at this URL. Changing a single byte would break the
// hash, and ngsw would treat the resource as corrupted and switch to degraded mode.
// Canonicalization is therefore done with the HTTP Link header — Google treats it on par
// with <link rel="canonical"> in the markup. /index.html stays for clients with an old
// ngsw manifest.
app.get(["/index.html", "/index.csr.html"], (req, res, next) => {
    getIndexHtml()
        .then(html => {
            res.set("Link", `<${siteUrl(req)}/>; rel="canonical"`);
            res.type("html").send(html);
        })
        .catch(next);
});

app.use("/uploads", express.static(`${__dirname}/uploads`));
// index: false – otherwise serve-static would answer "/" with index.html by itself
// and the home page would be the only one without server-side meta.
app.use("/", express.static(FRONT_DIR, { index: false }));

app.get(["*"], (req, res, next) => {
    const base = siteUrl(req);
    getPages()
        .then(
            pages => {
                const page = findPage(pages, req.path);
                // The canonical is built from the matched page's pageUrl, not from the
                // request path – otherwise "/slownik" and "/slownik/" would each claim
                // to be canonical, i.e. duplicate content.
                const canonical =
                    base +
                    encodeURI(
                        page
                            ? seoMeta.normalizePath(page.pageUrl)
                            : decodePath(req.path)
                    );
                // Only existing pages are rendered, and under their normalized path:
                // the cache key space is the number of pages in the database, not any
                // address someone sends. A 404 gets the shell, as before.
                const rendered = page
                    ? renderer.render(seoMeta.normalizePath(page.pageUrl))
                    : Promise.resolve(null);
                return rendered.then(result =>
                    (result ? Promise.resolve(result.html) : getIndexHtml()).then(html => {
                        res.status(page ? 200 : 404)
                            .set("X-Render", renderLabel(result))
                            .type("html")
                            .send(
                                injectSeo(
                                    html,
                                    buildSeoBlock(
                                        metaForPage(page),
                                        base,
                                        canonical,
                                        seoMeta.updatedIso(page)
                                    )
                                )
                            );
                    })
                );
            },
            // A database outage must not turn the site into 404s – we simply do not
            // know whether the page exists. 503 with Retry-After tells the crawler
            // "come back later" and keeps the URL in the index (same as /sitemap.xml),
            // while the user gets the shell, which can restore content from IndexedDB.
            // Generic meta is injected: a canonical pointing to "/" does not vouch for
            // an arbitrary address, and the block in index.html cannot carry absolute
            // URLs because the domain is unknown at build time.
            () =>
                getIndexHtml().then(html =>
                    res
                        .status(503)
                        .set("Retry-After", "120")
                        .set("X-Render", renderLabel(null))
                        .type("html")
                        .send(injectSeo(html, defaultSeoBlock(base)))
                )
        )
        .catch(next);
});

app.use((err, req, res, next) => {
    console.log(err);
    console.log(err.message);
    if (typeof err === "string") {
        res.status(422).send({ error: err });
    } else if (typeof err.message === "string") {
        res.status(422).send({ error: err.message });
    } else if (err.errors) {
        const firstError = Object.keys(err.errors)[0];
        res.status(422).send({ error: err.errors[firstError].message });
    } else {
        res.status(422).send(err.message);
    }
});
