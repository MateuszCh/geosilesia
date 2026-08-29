const express = require("express"),
    bodyParser = require("body-parser"),
    path = require("path"),
    fs = require("fs"),
    MongoClient = require("mongodb").MongoClient,
    config = require("./config"),
    seoMeta = require("./shared/seo-meta");

const app = express();
app.set("port", process.env.PORT || 3000);
// Na hostingu Node stoi za proxy – bez tego req.protocol zawsze zwraca "http".
// Ufamy WYŁĄCZNIE pierwszemu przeskokowi: przy `true` dowolny klient mógłby podać
// X-Forwarded-Host i tym samym podstawić własną domenę do canonical i sitemapy.
app.set("trust proxy", 1);

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

app.get("/api*", (req, res, next) => {
    if (databaseError) {
        res.status(503).send({ error: "Resource unavailable" });
    } else {
        next();
    }
});

app.get("/api/posts/:type", (req, res, next) => {
    collections.posts
        .find({ type: req.params.type })
        .toArray()
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

function processRequest(res, posts, pages) {
    function sendResponse(pages, posts) {
        const data = {};
        if (pages) data.pages = pages;
        if (posts) data.posts = posts;
        res.send(data);
    }

    const galleries = [];
    if (pages && pages.length) {
        pages.forEach(page => {
            if (page.rows) {
                page.rows.forEach(row => {
                    if (row.type === "gallery") {
                        galleries.push(row);
                    }
                });
            }
        });
    }
    if (galleries.length) {
        const promises = [];
        galleries.forEach(gallery => {
            if (gallery.data.catalogue) {
                promises.push(
                    collections.files
                        .find({ catalogues: gallery.data.catalogue })
                        .toArray()
                );
            }
        });
        if (promises.length) {
            Promise.all(promises).then(responses => {
                responses.forEach((response, i) => {
                    galleries[i].data.catalogue = response;
                });
                sendResponse(pages, posts);
            });
        } else {
            sendResponse(pages, posts);
        }
    } else {
        sendResponse(pages, posts);
    }
}
app.get("/api/appData/", (req, res, next) => {
    Promise.all([
        collections.pages.find({}).toArray(),
        collections.posts.find({}).toArray()
    ])
        .then(response => {
            processRequest(res, response[1], response[0]);
        })
        .catch(next);
});

app.get("/api/page/:pageUrl", (req, res, next) => {
    collections.pages
        .find({ pageUrl: req.params.pageUrl })
        .toArray()
        .then(pages => {
            processRequest(res, undefined, pages);
        })
        .catch(next);
});

//////////////////////
// SEO (sitemap, meta) //
//////////////////////

const INDEX_PATH = path.resolve(`${__dirname}/front/public/index.html`);
const SEO_START = "<!--seo:start-->";
const SEO_END = "<!--seo:end-->";
const PAGES_TTL = 10 * 60 * 1000;

let pagesCache = null;
let pagesCacheAt = 0;

// Lista stron trzymana w pamięci – z niej korzysta i sitemapa, i wstrzykiwanie meta.
// Strony edytuje zewnętrzna aplikacja piszące wprost do Mongo, więc zmiany widać
// najpóźniej po upływie TTL, bez potrzeby restartu czy przebudowy frontu.
function getPages() {
    if (databaseError || !collections.pages) {
        return Promise.reject(new Error("Baza niedostępna"));
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

// Zbudowany index.html zmienia się przy każdym `gulp watch`, więc pilnujemy mtime
// zamiast wczytywać plik raz na starcie procesu.
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
        '[seo] Brak "siteUrl" w config.json – adresy w canonical, OG i sitemapie będą' +
            " składane z nagłówków żądania. Ustaw go na produkcji."
    );
}

function siteUrl(req) {
    const configured = (config.siteUrl || "").replace(/\/+$/, "");
    return configured || `${req.protocol}://${req.get("host")}`;
}

// req.path jest procentowo zakodowany, a pageUrl w bazie trzyma znaki wprost
// ("galeria/minerały-województwa-śląskiego"), więc bez dekodowania takie strony
// nie zostałyby dopasowane i poszłyby jako 404.
function decodePath(reqPath) {
    try {
        return decodeURIComponent(reqPath);
    } catch (err) {
        return reqPath; // uszkodzona sekwencja %-owa – porównujemy jak leci
    }
}

function findPage(pages, reqPath) {
    let wanted = seoMeta.normalizePath(decodePath(reqPath));
    if (wanted.length > 1) wanted = wanted.replace(/\/+$/, "");
    return pages.find(
        page => seoMeta.normalizePath(page.pageUrl) === wanted
    );
}

// Wylicza tytuł i opis dla strony; brak strony oznacza 404.
function metaForPage(page) {
    if (!page) {
        return {
            title: seoMeta.NOT_FOUND_TITLE,
            description: seoMeta.DEFAULT_DESCRIPTION
        };
    }
    const derived = seoMeta.deriveMeta(page);
    return {
        title: seoMeta.buildTitle(derived.title, page),
        description: derived.description
    };
}

// Składa zawartość bloku <!--seo:start--> … <!--seo:end-->.
function buildSeoBlock(meta, base, canonical) {
    const e = seoMeta.escapeHtml;
    const title = meta.title;
    const description = meta.description;
    const image = base + seoMeta.DEFAULT_IMAGE;

    // Ucieczka "<" chroni przed wyjściem ze <script> treścią z bazy.
    const jsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: seoMeta.SITE_NAME,
        url: base,
        description: seoMeta.DEFAULT_DESCRIPTION,
        logo: image
    }).replace(/</g, "\\u003c");

    return [
        `<title>${e(title)}</title>`,
        `<meta name="description" content="${e(description)}">`,
        `<link rel="canonical" href="${e(canonical)}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${e(seoMeta.SITE_NAME)}">`,
        `<meta property="og:title" content="${e(title)}">`,
        `<meta property="og:description" content="${e(description)}">`,
        `<meta property="og:url" content="${e(canonical)}">`,
        `<meta property="og:image" content="${e(image)}">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${e(title)}">`,
        `<meta name="twitter:description" content="${e(description)}">`,
        `<meta name="twitter:image" content="${e(image)}">`,
        `<script type="application/ld+json">${jsonLd}</script>`
    ].join("");
}

function injectSeo(html, block) {
    const start = html.indexOf(SEO_START);
    const end = html.indexOf(SEO_END);
    if (start === -1 || end === -1 || end < start) return html;
    return html.slice(0, start + SEO_START.length) + block + html.slice(end);
}

// Trasy muszą wyprzedzać express.static, inaczej wygrałby plik z dysku.
app.get("/sitemap.xml", (req, res) => {
    getPages()
        .then(pages => {
            const base = siteUrl(req);
            const urls = pages
                .map(page => page && page.pageUrl)
                .filter(Boolean)
                .filter((url, i, all) => all.indexOf(url) === i)
                .map(url => {
                    // Sitemapa wymaga adresów zakodowanych procentowo ORAZ
                    // z ucieczką encji – encodeURI tylko na ścieżce, żeby nie
                    // ruszać "://" w adresie bazowym.
                    const loc = seoMeta.escapeHtml(
                        base + encodeURI(seoMeta.normalizePath(url))
                    );
                    return `    <url>\n        <loc>${loc}</loc>\n    </url>`;
                })
                .join("\n");
            res.type("application/xml").send(
                '<?xml version="1.0" encoding="UTF-8"?>\n' +
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                    urls +
                    "\n</urlset>\n"
            );
        })
        // 503, nie błąd klienta – crawler ma wrócić później (tak samo jak /api/*).
        .catch(() => res.status(503).type("text/plain").send("Resource unavailable"));
});

app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(
        `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`
    );
});

// /index.html to ten sam dokument co "/", więc bez tego byłby indeksowany osobno
// jako duplikat. Nie przekierowujemy: ten adres jest w STATIC_FILES service workera,
// a przekierowanie sprawiłoby, że cache.addAll zapisałby pod nim stronę główną wraz
// z jej meta i zatruł generyczny shell offline. Zamiast tego oddajemy shell
// z domyślnymi meta i canonical wskazującym na "/".
app.get("/index.html", (req, res, next) => {
    getIndexHtml()
        .then(html => {
            const base = siteUrl(req);
            res.type("html").send(
                injectSeo(
                    html,
                    buildSeoBlock(
                        {
                            title: seoMeta.DEFAULT_TITLE,
                            description: seoMeta.DEFAULT_DESCRIPTION
                        },
                        base,
                        base + "/"
                    )
                )
            );
        })
        .catch(next);
});

app.use("/uploads", express.static(`${__dirname}/uploads`));
// index: false – bez tego serve-static sam obsłużyłby "/" plikiem index.html
// i strona główna jako jedyna nie dostałaby meta z serwera.
app.use("/", express.static(`${__dirname}/front/public`, { index: false }));

app.get(["*"], (req, res, next) => {
    getIndexHtml()
        .then(html => {
            const base = siteUrl(req);
            return getPages()
                .then(pages => {
                    const page = findPage(pages, req.path);
                    // Canonical budujemy z pageUrl znalezionej strony, nie z adresu
                    // żądania – inaczej "/slownik" i "/slownik/" ogłaszałyby się
                    // kanonicznymi osobno, czyli powstałby duplikat treści.
                    const canonical =
                        base +
                        encodeURI(
                            page
                                ? seoMeta.normalizePath(page.pageUrl)
                                : decodePath(req.path)
                        );
                    res.status(page ? 200 : 404)
                        .type("html")
                        .send(
                            injectSeo(
                                html,
                                buildSeoBlock(metaForPage(page), base, canonical)
                            )
                        );
                })
                // Awaria bazy nie może zamienić serwisu w 404 dla crawlerów –
                // oddajemy stronę z fallbackowym blokiem meta z index.html.
                .catch(() => res.type("html").send(html));
        })
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
