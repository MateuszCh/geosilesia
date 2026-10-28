import { ALBUM_PAGE, AlbumTypeData, CONTENT_PAGE, ContentTypeData, Page } from '../models/page.model';
import { formatDate } from './dates';
import {
    FactsData,
    GalleryData,
    NoticeData,
    PageHeroData,
    Row,
    RowType,
    TextRow,
    TitleAndTextData
} from '../models/row.model';

/**
 * How a CMS page is laid out in variant C. Pure functions of the page document, so the
 * server render and the browser's first render always agree (hydration).
 *
 * A page with a type (scripts/cms/18-page-types.js) says itself what goes where: a "Strona
 * treści" keeps its header, byline and side column in `typeData`, an album its category,
 * cover, author and dates. The rules below lay out pages without a type – the home page,
 * the map and pages of a database the script has not migrated yet: the header comes from a
 * `page_hero` row and the side column from the kinds of rows the mockups put beside the text.
 *
 * Pages saved before the redesign have no `page_hero` row and keep the author and dates in
 * a trailing italic paragraph. Until they are migrated, the header is built from the first
 * `heading` row (or the first title) and the byline is parsed from that paragraph.
 */

export interface Byline {
    author?: string;
    /** dd.mm.rrrr */
    published?: string;
    /** dd.mm.rrrr */
    updated?: string;
}

export type PageKind = 'home' | 'album' | 'content';

/** The page header of the mockups: a photo band, a light or a dark band, or a plain title. */
export type HeaderStyle = 'photo' | 'light' | 'dark' | 'plain';

export interface PageHeader {
    data: PageHeroData;
    style: HeaderStyle;
    /** A `facts` row right after the header – drawn inside the light and dark bands. */
    facts?: FactsData;
    /** The map button of the TOP 50 route, beside the title as in the mockup. */
    action?: { label: string; link: string };
    /** Above the title instead of the breadcrumbs. */
    eyebrow?: string;
    /** The dictionary comes first: its search field sits in the light band. */
    searchCount?: number;
    /** The byline leaves the light and dark bands, as in the mockups. */
    bylineBelow: boolean;
}

export interface PageLayout {
    kind: PageKind;
    /** Page header; undefined on the home page and on albums, which draw their own. */
    header?: PageHeader;
    byline?: Byline;
    /** Rows of the main column, without those consumed by the header. */
    rows: Row[];
    /** Rows shown in the side panel (`link_cards` in the "lista boczna" variant). */
    side: Row[];
    /** The page holds a row that needs the whole width, so it gets no side panel. */
    wide: boolean;
}

/**
 * The trailing paragraph of older pages, after tags are stripped:
 * "Ryszard Chybiorz / 03.06.2026 / Ostatnia aktualizacja 05.10.2026." – the publication date
 * is missing on some pages and a colon sometimes follows "aktualizacja".
 */
const BYLINE_PATTERN =
    /^\s*([^/:()]{2,60}?)\s*\/\s*(?:(\d{1,2}\.\d{1,2}\.\d{4})\s*\/\s*)?Ostatnia aktualizacja:?\s*(\d{1,2}\.\d{1,2}\.\d{4})\.?\s*$/i;

function stripTags(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseByline(html: string | undefined): Byline | undefined {
    if (!html) return undefined;
    const match = BYLINE_PATTERN.exec(stripTags(html));
    if (!match) return undefined;
    return { author: match[1].trim(), published: match[2], updated: match[3] };
}

/** Rows that need the full container width; a page holding one gets no side panel. */
const FULL_WIDTH: RowType[] = [
    'homepage_banner',
    'map',
    'gallery',
    'gallery_list',
    'dictionary',
    'top50',
    'news',
    'knowledge_base',
    'photos',
    'map_search',
    'facts',
    'category_grid',
    'numbered_list'
];

export function isFullWidth(row: Row): boolean {
    return FULL_WIDTH.includes(row.type);
}

/**
 * Rows beside the text: link cards set to "lista boczna" and, as in the mockups, the geosite
 * databases, a quote standing on its own (the motto of "Skarby natury") and the "A ponadto"
 * box of a numbered list (see withMoreBeside).
 */
function isSideRow(row: Row): boolean {
    if (row.type === 'link_cards') return row.data?.variant === 'lista boczna';
    if (row.type === 'numbered_list') return !row.data?.items?.length && !!row.data?.more_items?.length;
    if (row.type === 'title_and_text') {
        const text = row.data?.text ?? [];
        return !row.data?.title && text.length === 1 && text[0].paragraph_class === 'cytat' && !text[0].list?.length;
    }
    return row.type === 'geosites_logos';
}

/** A title_and_text row without the byline paragraph; undefined when nothing is left. */
function withoutByline(data: TitleAndTextData, found: (byline: Byline) => void): TitleAndTextData | undefined {
    const text: TextRow[] = [];
    for (const row of data.text ?? []) {
        const byline = !row.list?.length ? parseByline(row.paragraph) : undefined;
        if (byline) {
            found(byline);
        } else {
            text.push(row);
        }
    }
    if (!data.title && !text.length) return undefined;
    return text.length === (data.text ?? []).length ? data : { ...data, text };
}

function galleryWithoutByline(data: GalleryData): GalleryData {
    let byline: Byline | undefined;
    const paragraphs = (data.paragraphs ?? []).filter(paragraph => {
        const parsed = parseByline(paragraph?.paragraph);
        if (parsed) byline = parsed;
        return !parsed;
    });
    if (!byline) return data;
    return {
        ...data,
        paragraphs,
        author: data.author || byline.author,
        updated: data.updated || byline.updated,
        published: byline.published
    };
}

/**
 * Older pages mark a warning with a `heading` row of class "footnotes__heading" followed by
 * the warning's text; variant C draws both as one `notice` row.
 */
function mergeLegacyNotices(rows: Row[]): Row[] {
    const result: Row[] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const next = rows[i + 1];
        if (row.type === 'heading' && /\bfootnotes__heading\b/.test(row.data?.class ?? '')) {
            const notice: NoticeData = { title: row.data.text, variant: 'uwaga' };
            if (next?.type === 'title_and_text' && !next.data?.title) {
                notice.text = (next.data.text ?? [])
                    .filter(text => text.paragraph && !parseByline(text.paragraph))
                    .map(text => `<p>${text.paragraph}</p>`)
                    .join('');
            }
            result.push({ type: 'notice', data: notice });
            // The byline paragraph of the merged row must still reach the page header.
            if (notice.text !== undefined) {
                const byline = (next as Extract<Row, { type: 'title_and_text' }>).data.text?.filter(text =>
                    parseByline(text.paragraph)
                );
                if (byline?.length) result.push({ type: 'title_and_text', data: { text: byline } });
                i++;
            }
            continue;
        }
        result.push(row);
    }
    return result;
}

/** The "A ponadto" items of a numbered list go beside the text in a box of their own. */
function withMoreBeside(rows: Row[]): Row[] {
    return rows.flatMap(row => {
        if (row.type !== 'numbered_list' || !row.data?.items?.length || !row.data.more_items?.length) return [row];
        const { more_title, more_items, ...list } = row.data;
        return [
            { ...row, data: list },
            { type: 'numbered_list', data: { more_title, more_items } }
        ];
    });
}

function heroFromRow(row: Row | undefined): { hero: PageHeroData; consumed: 'row' | 'title' } | undefined {
    if (!row?.data) return undefined;
    if (row.type === 'heading' && row.data.text) {
        return { hero: { title: row.data.text }, consumed: 'row' };
    }
    if ((row.type === 'title_and_text' || row.type === 'news') && row.data.title) {
        return { hero: { title: row.data.title }, consumed: 'title' };
    }
    return undefined;
}

/**
 * The header and what it takes over from the rows that follow it, as in the mockups:
 * the figures of "Położenie" and "Geoparki", the search of "Słowa kluczowe" and the map
 * button of TOP 50.
 */
function headerOf(data: PageHeroData, rows: Row[]): { header: PageHeader; rows: Row[] } {
    const style: HeaderStyle = data.image
        ? 'photo'
        : data.variant === 'jasne'
          ? 'light'
          : data.variant === 'ciemne'
            ? 'dark'
            : 'plain';
    const header: PageHeader = {
        data,
        style,
        eyebrow: data.eyebrow?.trim() || undefined,
        bylineBelow: style === 'light' || style === 'dark'
    };
    const first = rows[0];

    if (first?.type === 'facts' && (style === 'light' || style === 'dark')) {
        header.facts = first.data ?? {};
        rows = rows.slice(1);
    } else if (first?.type === 'dictionary' && style === 'light') {
        header.searchCount = first.data?.items?.length ?? 0;
    } else if (first?.type === 'top50' && first.data?.variant !== 'zapowiedź' && first.data?.link && style === 'plain') {
        header.action = { label: first.data.link_label || 'Pokaż wszystkie 50 na mapie', link: first.data.link };
        header.eyebrow ??= 'Szlak czerwony';
        rows = [{ ...first, data: { ...first.data, link: undefined } }, ...rows.slice(1)];
    }
    return { header, rows };
}

/** The author and dates of a header; undefined when it has none of them. */
function heroByline(hero: PageHeroData, page: Page | undefined): Byline | undefined {
    if (!hero.author && !hero.published && !hero.updated) return undefined;
    return {
        author: hero.author,
        published: formatDate(hero.published),
        updated: formatDate(hero.updated) ?? formatDate(page?.updated)
    };
}

/**
 * Rows the side column of a "Strona treści" takes – what the mockups put beside the text.
 * The CMS offers every component there; one that needs the main column is left out rather
 * than squeezed into the narrow one.
 */
const SIDE_TYPES: RowType[] = ['link_cards', 'numbered_list', 'title_and_text', 'geosites_logos', 'notice'];

/** A "Strona treści": the header, byline and side column are the values of its type. */
function layoutContent(page: Page, source: Row[]): PageLayout {
    const { side, ...hero } = (page.typeData ?? {}) as ContentTypeData;
    const header = headerOf(
        { ...hero, title: hero.title || page.title },
        source.filter(row => row.type !== 'page_hero')
    );
    const sideRows = (side ?? [])
        .map(item => item?.component)
        .filter((row): row is Row => !!row?.type && SIDE_TYPES.includes(row.type));

    return {
        kind: 'content',
        header: header.header,
        byline: heroByline(hero, page),
        rows: header.rows,
        side: sideRows,
        wide: [...header.rows, ...sideRows].some(isFullWidth)
    };
}

/** An album: its category, cover, author and dates are the values of its type. */
function layoutAlbum(page: Page, source: Row[]): PageLayout {
    const album = (page.typeData ?? {}) as AlbumTypeData;
    const rows = source.map(row =>
        row.type === 'gallery' ? ({ ...row, data: { ...row.data, ...album } } as Row) : row
    );
    return { kind: 'album', rows, side: [], wide: true };
}

export function layoutPage(page: Page | undefined): PageLayout {
    const source = (page?.rows ?? []).filter(row => !!row?.type);

    if (page?.type === CONTENT_PAGE) return layoutContent(page, source);
    if (page?.type === ALBUM_PAGE) return layoutAlbum(page, source);

    // The home page and the map page draw their own header (the photo hero, the map panel).
    if (source.some(row => row.type === 'homepage_banner' || row.type === 'map')) {
        return { kind: 'home', rows: source, side: [], wide: true };
    }

    if (source.some(row => row.type === 'gallery')) {
        const rows = source.map(row =>
            row.type === 'gallery' ? { ...row, data: galleryWithoutByline(row.data ?? {}) } : row
        );
        return { kind: 'album', rows, side: [], wide: true };
    }

    let rows = mergeLegacyNotices(source);
    let hero: PageHeroData | undefined;

    const heroIndex = rows.findIndex(row => row.type === 'page_hero');
    if (heroIndex !== -1) {
        hero = (rows[heroIndex].data as PageHeroData) ?? {};
        rows.splice(heroIndex, 1);
    } else {
        const fallback = heroFromRow(rows[0]);
        if (fallback?.consumed === 'row') {
            rows.shift();
        } else if (fallback?.consumed === 'title') {
            rows[0] = { ...rows[0], data: { ...rows[0].data, title: undefined } } as Row;
        }
        hero = fallback?.hero ?? { title: page?.title };
    }

    // The byline paragraph leaves the content in any case: once page_hero carries the
    // author it would only repeat it.
    let parsed: Byline | undefined;
    rows = rows
        .map(row => {
            if (row.type !== 'title_and_text' || !row.data) return row;
            const data = withoutByline(row.data, byline => (parsed = byline));
            return data ? ({ ...row, data } as Row) : undefined;
        })
        .filter((row): row is Row => !!row);

    const byline = heroByline(hero, page) ?? parsed;

    const header = headerOf(hero, rows);
    rows = withMoreBeside(header.rows);

    return {
        kind: 'content',
        header: header.header,
        byline,
        rows: rows.filter(row => !isSideRow(row)),
        side: rows.filter(isSideRow),
        wide: rows.some(isFullWidth)
    };
}

const isPreview = (row: Row | undefined, type: RowType) =>
    row?.type === type && (row.data as { variant?: string } | undefined)?.variant === 'zapowiedź';

/**
 * Rows in display groups: the events preview followed by the knowledge base preview stand
 * side by side on the home page, as in the mockup; every other row stands alone.
 */
export function groupRows(rows: Row[]): Row[][] {
    const groups: Row[][] = [];
    for (let i = 0; i < rows.length; i++) {
        if (isPreview(rows[i], 'news') && isPreview(rows[i + 1], 'knowledge_base')) {
            groups.push([rows[i], rows[i + 1]]);
            i++;
        } else {
            groups.push([rows[i]]);
        }
    }
    return groups;
}
