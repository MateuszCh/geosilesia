// Wspólna logika SEO dla serwera (app.js) i przeglądarki (seo.service.js).
// Bez DOM i bez Angulara — te same reguły muszą dać ten sam wynik po obu stronach.
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.GeoSeoMeta = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var SITE_NAME = 'GeoSilesia';
    var DEFAULT_TITLE = 'GeoSilesia';
    var DEFAULT_DESCRIPTION =
        'GeoSilesia to „Edukacyjno-informacyjny serwis internetowy o dziedzictwie geologicznym, geomorfologicznym i poprzemysłowym województwa śląskiego”.';
    var DEFAULT_IMAGE = '/images/icons/app-icon-512x512.png';
    var NOT_FOUND_TITLE = 'Nie znaleziono strony – ' + SITE_NAME;
    var MAX_DESCRIPTION = 160;

    var ENTITIES = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
        bdquo: '„',
        ldquo: '“',
        rdquo: '”',
        sbquo: '‚',
        lsquo: '‘',
        rsquo: '’',
        ndash: '–',
        mdash: '—',
        hellip: '…'
    };

    // fromCharCode obcina do 16 bitów, więc gubiłoby znaki spoza BMP (np. emoji
    // wstawione w CMS-ie jako &#128512;). Zachowujemy oryginalną encję, gdy liczba
    // wykracza poza zakres Unicode.
    function fromCodePoint(number, original) {
        if (!isFinite(number) || number < 0 || number > 0x10ffff) return original;
        return String.fromCodePoint
            ? String.fromCodePoint(number)
            : String.fromCharCode(number);
    }

    function decodeEntities(text) {
        return text
            .replace(/&#x([0-9a-f]+);/gi, function (m, hex) {
                return fromCodePoint(parseInt(hex, 16), m);
            })
            .replace(/&#(\d+);/g, function (m, dec) {
                return fromCodePoint(parseInt(dec, 10), m);
            })
            .replace(/&([a-z]+);/gi, function (m, name) {
                var value = ENTITIES[name.toLowerCase()];
                return value === undefined ? m : value;
            });
    }

    // Odpowiednik dawnego `div.innerHTML = html; div.textContent` — znaczniki znikają
    // bez wstawiania spacji, więc sklejanie tekstu jest takie samo jak w przeglądarce.
    function stripHtml(html) {
        if (!html) return '';
        var text = String(html)
            .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
            .replace(/<[^>]*>/g, '');
        return decodeEntities(text).replace(/\s+/g, ' ').trim();
    }

    function truncate(text, max) {
        if (!text || text.length <= max) return text;
        var cut = text.substring(0, max);
        var lastSpace = cut.lastIndexOf(' ');
        if (lastSpace > 40) cut = cut.substring(0, lastSpace);
        return cut.trim() + '…';
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Tytuły bywają wpisane w CMS-ie WERSALIKAMI, bo tak wyglądają w bannerze na stronie.
    // W <title> i w OG czyta się to jak krzyk, a wyszukiwarki i tak takie tytuły przepisują.
    // Warunek celowo dotyczy CAŁEGO tytułu – dzięki temu skróty w normalnym zdaniu
    // ("KWK Katowice", "TOP 50") zostają nietknięte.
    function isShouting(text) {
        var letters = 0;
        var upper = 0;
        for (var i = 0; i < text.length; i++) {
            var ch = text.charAt(i);
            if (ch.toLowerCase() === ch.toUpperCase()) continue; // nie-litera
            letters++;
            if (ch === ch.toUpperCase()) upper++;
        }
        return letters >= 4 && upper / letters > 0.8;
    }

    // Podnosi pierwszą LITERĘ, nie pierwszy znak – dzięki temu wyraz zaczynający się
    // cudzysłowem czy nawiasem („cuda) też wychodzi poprawnie.
    function capitalizeFirstLetter(word) {
        for (var i = 0; i < word.length; i++) {
            var ch = word.charAt(i);
            if (ch.toLowerCase() !== ch.toUpperCase()) {
                return word.slice(0, i) + ch.toUpperCase() + word.slice(i + 1);
            }
        }
        return word;
    }

    // Każdy wyraz z wielkiej litery, reszta znaków małymi.
    function toTitleCase(text) {
        return text.toLowerCase().replace(/\S+/g, capitalizeFirstLetter);
    }

    function fixCase(text) {
        return text && isShouting(text) ? toTitleCase(text) : text;
    }

    // pageUrl w bazie nie ma wiodącego ukośnika (poza "/" strony głównej).
    function normalizePath(pageUrl) {
        if (!pageUrl) return '/';
        var withSlash = pageUrl.charAt(0) === '/' ? pageUrl : '/' + pageUrl;
        return withSlash.replace(/^\/+/, '/'); // "//strona" to ten sam adres
    }

    // Tytuł z treści strony: 1) homepage_banner.title, 2) heading (preferuj h1),
    // 3) title_and_text.title.
    function deriveTitle(page) {
        if (!page || !page.rows || !page.rows.length) return '';
        var rows = page.rows;
        var i;
        for (i = 0; i < rows.length; i++) {
            if (rows[i].type === 'homepage_banner' && rows[i].data && rows[i].data.title) {
                return stripHtml(rows[i].data.title);
            }
        }
        var firstHeading = null;
        for (i = 0; i < rows.length; i++) {
            if (rows[i].type === 'heading' && rows[i].data && rows[i].data.text) {
                if (rows[i].data.type === 'h1') return stripHtml(rows[i].data.text);
                if (!firstHeading) firstHeading = rows[i].data.text;
            }
        }
        if (firstHeading) return stripHtml(firstHeading);
        for (i = 0; i < rows.length; i++) {
            if (rows[i].type === 'title_and_text' && rows[i].data && rows[i].data.title) {
                return stripHtml(rows[i].data.title);
            }
        }
        return '';
    }

    // Opis z pierwszego akapitu treści.
    function deriveDescription(page) {
        if (!page || !page.rows || !page.rows.length) return '';
        var rows = page.rows;
        for (var i = 0; i < rows.length; i++) {
            if (
                rows[i].type === 'title_and_text' &&
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
        return '';
    }

    // page.title to etykieta z CMS-a i domyślne źródło tytułu. Wyjątki:
    // - strona główna ma tam wewnętrzne "Homepage", więc liczy się wyłącznie treść;
    // - poza nią tytuł wyprowadzony z treści wygrywa, gdy jest dłuższy, bo krótka
    //   etykieta menu ("Budowa") gubi frazę, po której ludzie szukają.
    function deriveMeta(page) {
        var fromContent = deriveTitle(page) || '';
        var fromPage = (page && page.title) || '';
        var title =
            page && normalizePath(page.pageUrl) === '/'
                ? fromContent || fromPage
                : fromContent.length > fromPage.length
                ? fromContent
                : fromPage;
        return {
            title: fixCase(title),
            // seoDescription wpisuje redaktor, więc nie przycinamy go do MAX_DESCRIPTION –
            // limit chroni przed przypadkowym początkiem akapitu, a nie przed świadomą decyzją.
            description:
                stripHtml(page && page.seoDescription) ||
                deriveDescription(page) ||
                DEFAULT_DESCRIPTION
        };
    }

    function buildTitle(rawTitle, page) {
        if (!rawTitle) return DEFAULT_TITLE;
        if (page && normalizePath(page.pageUrl) === '/') return rawTitle;
        return rawTitle + ' – ' + SITE_NAME;
    }

    // Finalne meta strony – jedyne miejsce, w którym zapada decyzja o sufiksie w tytule.
    // seoTitle to gotowy <title> wpisany ręcznie: nie poprawiamy w nim wielkości liter ani
    // nie doklejamy nazwy serwisu, bo "… – GeoSilesia" wpisane przez redaktora zdublowałoby się.
    function buildMeta(page) {
        var derived = deriveMeta(page);
        var explicit = stripHtml(page && page.seoTitle);
        return {
            title: explicit || buildTitle(derived.title, page),
            description: derived.description
        };
    }

    // CMS zapisuje "updated" jako liczbę milisekund, ale pole bywa też Date (BSON) albo
    // ciągiem cyfr po serializacji – Date rozumie liczbę, lecz nie taki ciąg. Wartości,
    // których nie da się sparsować, pomijamy: crawler woli brak <lastmod> niż datę-śmiecia.
    function updatedIso(page) {
        var raw = page && page.updated;
        if (!raw) return '';
        if (typeof raw === 'string' && /^\d+$/.test(raw)) raw = Number(raw);
        var date = raw instanceof Date ? raw : new Date(raw);
        return isNaN(date.getTime()) ? '' : date.toISOString();
    }

    return {
        SITE_NAME: SITE_NAME,
        DEFAULT_TITLE: DEFAULT_TITLE,
        DEFAULT_DESCRIPTION: DEFAULT_DESCRIPTION,
        DEFAULT_IMAGE: DEFAULT_IMAGE,
        NOT_FOUND_TITLE: NOT_FOUND_TITLE,
        MAX_DESCRIPTION: MAX_DESCRIPTION,
        stripHtml: stripHtml,
        truncate: truncate,
        fixCase: fixCase,
        escapeHtml: escapeHtml,
        normalizePath: normalizePath,
        deriveTitle: deriveTitle,
        deriveDescription: deriveDescription,
        deriveMeta: deriveMeta,
        buildTitle: buildTitle,
        buildMeta: buildMeta,
        updatedIso: updatedIso
    };
});
