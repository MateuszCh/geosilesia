(function() {
    angular.module("geosilesia").service("seoService", [
        "$document",
        "$location",
        function($document, $location) {
            var SITE_NAME = "GeoSilesia";
            var DEFAULT_TITLE = "GeoSilesia";
            var DEFAULT_DESCRIPTION =
                "GeoSilesia to „Edukacyjno-informacyjny serwis internetowy o dziedzictwie geologicznym, geomorfologicznym i poprzemysłowym województwa śląskiego”.";
            var DEFAULT_IMAGE = "/images/icons/app-icon-512x512.png";
            var MAX_DESCRIPTION = 160;

            var head = $document[0].head;

            function origin() {
                // $location.absUrl bez ścieżki — bierzemy z window dla pewności
                return window.location.origin;
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

            function upsertLink(rel, href) {
                var el = head.querySelector('link[rel="' + rel + '"]');
                if (!el) {
                    el = $document[0].createElement("link");
                    el.setAttribute("rel", rel);
                    head.appendChild(el);
                }
                el.setAttribute("href", href);
            }

            function stripHtml(html) {
                if (!html) return "";
                var tmp = $document[0].createElement("div");
                tmp.innerHTML = html;
                return (tmp.textContent || tmp.innerText || "")
                    .replace(/\s+/g, " ")
                    .trim();
            }

            function truncate(text, max) {
                if (!text || text.length <= max) return text;
                var cut = text.substring(0, max);
                var lastSpace = cut.lastIndexOf(" ");
                if (lastSpace > 40) cut = cut.substring(0, lastSpace);
                return cut.trim() + "…";
            }

            // Wyprowadza tytuł strony z jej treści (bez pól meta w DB):
            // 1) homepage_banner.title, 2) pierwszy heading (preferuj h1),
            // 3) pierwszy title_and_text.title.
            function deriveTitle(page) {
                if (!page || !page.rows || !page.rows.length) return "";
                var rows = page.rows;
                var i;
                for (i = 0; i < rows.length; i++) {
                    if (rows[i].type === "homepage_banner" && rows[i].data && rows[i].data.title) {
                        return stripHtml(rows[i].data.title);
                    }
                }
                var firstHeading = null;
                for (i = 0; i < rows.length; i++) {
                    if (rows[i].type === "heading" && rows[i].data && rows[i].data.text) {
                        if (rows[i].data.type === "h1") return stripHtml(rows[i].data.text);
                        if (!firstHeading) firstHeading = rows[i].data.text;
                    }
                }
                if (firstHeading) return stripHtml(firstHeading);
                for (i = 0; i < rows.length; i++) {
                    if (rows[i].type === "title_and_text" && rows[i].data && rows[i].data.title) {
                        return stripHtml(rows[i].data.title);
                    }
                }
                return "";
            }

            // Wyprowadza opis z pierwszego akapitu treści.
            function deriveDescription(page) {
                if (!page || !page.rows || !page.rows.length) return "";
                var rows = page.rows;
                for (var i = 0; i < rows.length; i++) {
                    if (
                        rows[i].type === "title_and_text" &&
                        rows[i].data &&
                        rows[i].data.text &&
                        rows[i].data.text.length
                    ) {
                        for (var j = 0; j < rows[i].data.text.length; j++) {
                            var para = rows[i].data.text[j].paragraph;
                            if (para) {
                                var text = stripHtml(para);
                                if (text) return truncate(text, MAX_DESCRIPTION);
                            }
                        }
                    }
                }
                return "";
            }

            function buildTitle(rawTitle, page) {
                if (!rawTitle) return DEFAULT_TITLE;
                if (page && page.pageUrl === "/") return rawTitle;
                return rawTitle + " – " + SITE_NAME;
            }

            function absolute(url) {
                if (!url) return url;
                if (/^https?:\/\//.test(url)) return url;
                return origin() + (url.charAt(0) === "/" ? "" : "/") + url;
            }

            function apply(data) {
                var canonical = origin() + $location.path();

                setDocumentTitle(data.title);
                upsertMeta('meta[name="description"]', "name", "description", data.description);
                upsertLink("canonical", canonical);

                upsertMeta('meta[property="og:title"]', "property", "og:title", data.title);
                upsertMeta('meta[property="og:description"]', "property", "og:description", data.description);
                upsertMeta('meta[property="og:url"]', "property", "og:url", canonical);
                upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
                upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
                upsertMeta('meta[property="og:image"]', "property", "og:image", absolute(data.image));

                upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
                upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", data.title);
                upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", data.description);
                upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", absolute(data.image));
            }

            // Ustawia meta na podstawie danych strony (wyprowadzone z treści).
            function applyForPage(page) {
                var rawTitle = deriveTitle(page);
                var description = deriveDescription(page) || DEFAULT_DESCRIPTION;
                apply({
                    title: buildTitle(rawTitle, page),
                    description: description,
                    image: DEFAULT_IMAGE
                });
            }

            // Ustawia neutralne meta dla strony 404 (soft-404).
            function applyNotFound() {
                apply({
                    title: "Nie znaleziono strony – " + SITE_NAME,
                    description: DEFAULT_DESCRIPTION,
                    image: DEFAULT_IMAGE
                });
            }

            return {
                applyForPage: applyForPage,
                applyNotFound: applyNotFound
            };
        }
    ]);
})();
