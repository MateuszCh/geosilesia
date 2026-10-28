// SEO logic shared by the server (app.js) and the browser (seo.service.ts).
// No DOM and no Angular — the same rules must give the same result on both sides.
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
    var TITLE_SUFFIX = ' - ' + SITE_NAME;
    var NOT_FOUND_TITLE = 'Nie znaleziono strony' + TITLE_SUFFIX;
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

    // fromCharCode truncates to 16 bits, so it would lose characters outside the BMP
    // (e.g. emoji entered in the CMS as &#128512;). The original entity is kept when the
    // number is outside the Unicode range.
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

    // Tags that break the line when rendered. `textContent` would glue words together
    // across them ("ma<br>kota" → "makota"), so they are replaced with a space — otherwise
    // the meta description gets made-up compound words. Extra spaces are collapsed by
    // \s+ below anyway.
    var BLOCK_TAGS =
        /<\/?(br|p|div|li|ul|ol|dl|dt|dd|tr|td|th|table|thead|tbody|h[1-6]|hr|section|article|aside|header|footer|nav|main|figure|figcaption|blockquote|pre)\b[^>]*>/gi;

    // Otherwise the equivalent of `div.innerHTML = html; div.textContent`.
    function stripHtml(html) {
        if (!html) return '';
        var text = String(html)
            .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
            .replace(BLOCK_TAGS, ' ')
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

    // Titles are sometimes entered in the CMS in ALL CAPS, because that is how they look
    // in the page banner. In <title> and OG it reads like shouting, and search engines
    // rewrite such titles anyway. The check deliberately applies to the WHOLE title – this
    // way abbreviations in a normal sentence ("KWK Katowice", "TOP 50") stay untouched.
    function isShouting(text) {
        var letters = 0;
        var upper = 0;
        for (var i = 0; i < text.length; i++) {
            var ch = text.charAt(i);
            if (ch.toLowerCase() === ch.toUpperCase()) continue; // not a letter
            letters++;
            if (ch === ch.toUpperCase()) upper++;
        }
        return letters >= 4 && upper / letters > 0.8;
    }

    // Capitalizes the first LETTER, not the first character – so a word starting with
    // a quotation mark or a parenthesis („cuda) also comes out right.
    function capitalizeFirstLetter(word) {
        for (var i = 0; i < word.length; i++) {
            var ch = word.charAt(i);
            if (ch.toLowerCase() !== ch.toUpperCase()) {
                return word.slice(0, i) + ch.toUpperCase() + word.slice(i + 1);
            }
        }
        return word;
    }

    // An acronym is recognized by the lack of vowels ("KWK", "GZM", "PGG"). In Polish
    // a word without a vowel practically does not exist, so this check does not touch
    // ordinary words, while it protects names that as "Kwk Katowice" would look like a typo.
    var VOWELS = /[aąeęioóuy]/i;

    function isAcronym(word) {
        var letters = word.replace(/[^\wÀ-ž]/g, '');
        return letters.length >= 2 && letters.length <= 5 && !VOWELS.test(letters);
    }

    // Every word capitalized, the rest lowercase — except acronyms.
    function toTitleCase(text) {
        return text.replace(/\S+/g, function (word) {
            return isAcronym(word) ? word : capitalizeFirstLetter(word.toLowerCase());
        });
    }

    function fixCase(text) {
        return text && isShouting(text) ? toTitleCase(text) : text;
    }

    // Canonical form of a path: leading slash, no trailing one (except "/" itself).
    // pageUrl in the database has no leading slash (except "/" of the home page), but is
    // sometimes stored with a trailing one ("slownik/") – without this normalization such
    // a page would not match the request "/slownik" and would announce its own canonical.
    function normalizePath(pageUrl) {
        if (!pageUrl) return '/';
        var withSlash = pageUrl.charAt(0) === '/' ? pageUrl : '/' + pageUrl;
        var collapsed = withSlash.replace(/^\/+/, '/'); // "//slownik" is the same address
        return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
    }

    function rowText(rows, type, field) {
        for (var i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i].type === type && rows[i].data && rows[i].data[field]) {
                return stripHtml(rows[i].data[field]);
            }
        }
        return '';
    }

    // A field of the page header (variant C): a value of a "Strona treści" page, or of the
    // page_hero row of a page without a type (scripts/cms/18-page-types.js).
    function heroText(page, field) {
        if (page.type === 'tresc') {
            return page.typeData && page.typeData[field] ? stripHtml(page.typeData[field]) : '';
        }
        return rowText(page.rows || [], 'page_hero', field);
    }

    // Title from the page content: 1) homepage_banner.title, 2) the header's title,
    // 3) heading (prefer h1), 4) gallery.title (albums), 5) title_and_text.title.
    function deriveTitle(page) {
        if (!page) return '';
        var rows = page.rows || [];
        var fromBanner = rowText(rows, 'homepage_banner', 'title');
        if (fromBanner) return fromBanner;
        var fromHero = heroText(page, 'title');
        if (fromHero) return fromHero;
        var firstHeading = null;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i].type === 'heading' && rows[i].data && rows[i].data.text) {
                if (rows[i].data.type === 'h1') return stripHtml(rows[i].data.text);
                if (!firstHeading) firstHeading = rows[i].data.text;
            }
        }
        if (firstHeading) return stripHtml(firstHeading);
        return rowText(rows, 'gallery', 'title') || rowText(rows, 'title_and_text', 'title');
    }

    // The trailing "Ryszard Chybiorz / 03.06.2026 / Ostatnia aktualizacja 05.10.2026." of
    // older pages is a byline, not a description.
    var BYLINE = /^[^/:()]{2,60}\/\s*(\d{1,2}\.\d{1,2}\.\d{4}\s*\/\s*)?Ostatnia aktualizacja/i;

    function firstParagraph(paragraphs, field) {
        for (var j = 0; j < (paragraphs || []).length; j++) {
            var para = paragraphs[j] && paragraphs[j][field];
            if (para) {
                var text = stripHtml(para);
                if (text && !BYLINE.test(text)) return truncate(text, MAX_DESCRIPTION);
            }
        }
        return '';
    }

    // Description: the lead of the page header (variant C), else the first paragraph of the
    // content – a text row, or the album's own text.
    function deriveDescription(page) {
        if (!page) return '';
        var rows = page.rows || [];
        var lead = heroText(page, 'lead');
        if (lead) return truncate(lead, MAX_DESCRIPTION);
        for (var i = 0; i < rows.length; i++) {
            if (!rows[i] || !rows[i].data) continue;
            var text = '';
            if (rows[i].type === 'title_and_text') text = firstParagraph(rows[i].data.text, 'paragraph');
            else if (rows[i].type === 'gallery') text = firstParagraph(rows[i].data.paragraphs, 'paragraph');
            if (text) return text;
        }
        return '';
    }

    // page.title is the CMS label and the default source of the title. Exceptions:
    // - the home page has an internal "Homepage" there, so only the content counts;
    // - elsewhere the title derived from the content wins when it is longer, because
    //   a short menu label ("Budowa") loses the phrase people search for.
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
            // seoDescription is written by an editor, so it is not truncated to
            // MAX_DESCRIPTION – the limit guards against an arbitrary paragraph opening,
            // not against a deliberate decision.
            description:
                stripHtml(page && page.seoDescription) ||
                deriveDescription(page) ||
                DEFAULT_DESCRIPTION
        };
    }

    // Plain substring search, no word boundary: "GeoSilesia" is distinctive enough not to
    // appear inside another word, and without \b spellings like "GeoSilesia:" or
    // "(GeoSilesia)" are handled too.
    function hasSiteName(text) {
        return text.toLowerCase().indexOf(SITE_NAME.toLowerCase()) !== -1;
    }

    // The suffix depends on WHAT is in the title, not where it comes from. One check
    // replaces two former exceptions: a manual seoTitle that already contains the site
    // name does not get it twice, and the home page with the "GeoSilesia" banner stays
    // without a suffix without a separate condition on the "/" path. It works regardless
    // of the separator the editor used.
    function buildTitle(rawTitle) {
        if (!rawTitle) return DEFAULT_TITLE;
        return hasSiteName(rawTitle) ? rawTitle : rawTitle + TITLE_SUFFIX;
    }

    // Final page meta – the only place where the title suffix is decided.
    // seoTitle takes precedence over the content title and goes through the same rule:
    // it gets the site name only if the editor did not type it. It does not go through
    // fixCase, though – the all-caps correction lives in deriveMeta and applies only to
    // the title derived from the content, because a manual entry is the editor's
    // deliberate decision.
    function buildMeta(page) {
        var derived = deriveMeta(page);
        var explicit = stripHtml(page && page.seoTitle);
        return {
            title: buildTitle(explicit || derived.title),
            description: derived.description
        };
    }

    // The CMS stores "updated" as a number of milliseconds, but the field is sometimes
    // a Date (BSON) or a string of digits after serialization – Date understands the
    // number but not such a string. Unparsable values are skipped: a crawler prefers no
    // <lastmod> to a garbage date.
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
