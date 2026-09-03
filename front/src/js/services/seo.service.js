(function() {
    angular.module("geosilesia").service("seoService", [
        "$document",
        "$location",
        function($document, $location) {
            // Derywacja title/description jest wspólna z serwerem – shared/seo-meta.js
            // (doklejany do bundla przed tym plikiem przez task `js` w gulpfile).
            var meta = window.GeoSeoMeta;

            var head = $document[0].head;

            // Serwer wstrzykuje canonical zbudowany z config.siteUrl. Gdybyśmy liczyli
            // origin z window.location, przy wejściu przez inny host (www vs bez, http
            // vs https) klient zamazałby go adresem, którego akurat użył odwiedzający —
            // czyli dokładnie tym duplikatem treści, przed którym siteUrl chroni.
            // Czytamy więc origin raz, z canonical wstawionego przez serwer.
            var cachedOrigin = null;

            function serverOrigin() {
                var el = head.querySelector('link[rel="canonical"]');
                var href = el ? el.getAttribute("href") || "" : "";
                var match = /^(https?:\/\/[^/]+)/.exec(href);
                return match ? match[1] : "";
            }

            function origin() {
                if (cachedOrigin === null) {
                    // Fallback dotyczy sytuacji bez wstrzyknięcia – np. gdy shell
                    // przyszedł z cache'u service workera.
                    cachedOrigin = serverOrigin() || window.location.origin;
                }
                return cachedOrigin;
            }

            function setDocumentTitle(title) {
                $document[0].title = title;
            }

            function upsertMeta(selector, attrName, attrValue, content) {
                var el = head.querySelector(selector);
                if (!el) {
                    el = $document[0].createElement("meta");
                    el.setAttribute(attrName, attrValue);
                    head.appendChild(el);
                }
                el.setAttribute("content", content);
            }

            // Dla pól, których część stron nie ma: przy nawigacji SPA nie wystarczy nie
            // ustawić tagu – trzeba go usunąć, inaczej zostałby w <head> z datą poprzedniej
            // strony.
            function setOrRemoveMeta(selector, attrName, attrValue, content) {
                if (content) {
                    upsertMeta(selector, attrName, attrValue, content);
                    return;
                }
                var el = head.querySelector(selector);
                if (el) el.parentNode.removeChild(el);
            }

            // To samo dla per-stronowego JSON-LD. Selektor celuje w data-seo="webpage",
            // żeby nie ruszyć ogólnoserwisowego bloku Organization.
            function setOrRemoveWebPageJsonLd(data) {
                var selector = 'script[type="application/ld+json"][data-seo="webpage"]';
                var el = head.querySelector(selector);
                if (!data) {
                    if (el) el.parentNode.removeChild(el);
                    return;
                }
                if (!el) {
                    el = $document[0].createElement("script");
                    el.setAttribute("type", "application/ld+json");
                    el.setAttribute("data-seo", "webpage");
                    head.appendChild(el);
                }
                el.textContent = JSON.stringify(data);
            }

            function upsertLink(rel, href) {
                var el = head.querySelector('link[rel="' + rel + '"]');
                if (!el) {
                    el = $document[0].createElement("link");
                    el.setAttribute("rel", rel);
                    head.appendChild(el);
                }
                el.setAttribute("href", href);
            }

            function absolute(url) {
                if (!url) return url;
                if (/^https?:\/\//.test(url)) return url;
                return origin() + (url.charAt(0) === "/" ? "" : "/") + url;
            }

            function apply(data) {
                // Ścieżkę bierzemy z pageUrl strony, nie z $location.path() – inaczej
                // wejście na "/slownik/" ogłosiłoby się kanonicznym osobno od "/slownik".
                var canonical = origin() + encodeURI(data.path || $location.path());

                setDocumentTitle(data.title);
                upsertMeta('meta[name="description"]', "name", "description", data.description);
                upsertLink("canonical", canonical);

                upsertMeta('meta[property="og:title"]', "property", "og:title", data.title);
                upsertMeta('meta[property="og:description"]', "property", "og:description", data.description);
                upsertMeta('meta[property="og:url"]', "property", "og:url", canonical);
                upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
                upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", meta.SITE_NAME);
                upsertMeta('meta[property="og:image"]', "property", "og:image", absolute(data.image));

                upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
                upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", data.title);
                upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", data.description);
                upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", absolute(data.image));

                setOrRemoveMeta(
                    'meta[property="og:updated_time"]',
                    "property",
                    "og:updated_time",
                    data.updated
                );
                setOrRemoveWebPageJsonLd(
                    data.updated
                        ? {
                              "@context": "https://schema.org",
                              "@type": "WebPage",
                              url: canonical,
                              name: data.title,
                              description: data.description,
                              dateModified: data.updated
                          }
                        : null
                );
            }

            // Ustawia meta na podstawie danych strony (seoTitle/seoDescription, a w ich
            // braku – wyprowadzone z treści).
            function applyForPage(page) {
                var built = meta.buildMeta(page);
                apply({
                    title: built.title,
                    description: built.description,
                    image: meta.DEFAULT_IMAGE,
                    path: page && page.pageUrl ? meta.normalizePath(page.pageUrl) : "",
                    updated: meta.updatedIso(page)
                });
            }

            // Ustawia neutralne meta dla strony 404 (soft-404).
            function applyNotFound() {
                apply({
                    title: meta.NOT_FOUND_TITLE,
                    description: meta.DEFAULT_DESCRIPTION,
                    image: meta.DEFAULT_IMAGE,
                    updated: ""
                });
            }

            return {
                applyForPage: applyForPage,
                applyNotFound: applyNotFound
            };
        }
    ]);
})();
