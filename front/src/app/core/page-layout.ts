import { ALBUM_PAGE, AlbumTypeData, CONTENT_PAGE, ContentTypeData, Page } from '../models/page.model';
import { formatDate } from './dates';
import { DictionaryData, PageHeroData, Row } from '../models/row.model';

/**
 * How a CMS page is laid out in variant C. Pure functions of the page document, so the
 * server render and the browser's first render always agree (hydration).
 *
 * The rows of a page are drawn one after another, as the CMS lists them; nothing is moved,
 * merged or left out by its kind or its neighbours. Whatever goes elsewhere is a field the
 * editor sets: a "Strona treści" keeps its header, side column, button, section menu and
 * byline in `typeData`, an album its category, cover, author and dates, and a component
 * holding others has "component" fields for them (scripts/cms/18–21).
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

/** "Autor i daty": in the header, under the text, in the side column or in the literature box. */
export type BylinePlace = 'header' | 'below' | 'side' | 'literature';

export interface PageHeader {
    data: PageHeroData;
    style: HeaderStyle;
    /** "W nagłówku": a component drawn in the header, as the figures of Geoparki. */
    component?: Row;
    /** "Przycisk przy tytule", as the map button of TOP 50. */
    action?: { label: string; link: string };
    /** Above the title instead of the breadcrumbs. */
    eyebrow?: string;
    /** The number of terms of the dictionary whose search field the header holds. */
    searchCount?: number;
}

export interface PageLayout {
    kind: PageKind;
    /** Page header; undefined on pages without a type and on albums, which draw their own. */
    header?: PageHeader;
    byline?: Byline;
    bylinePlace: BylinePlace;
    /** "Menu działu": the section's pages in the header or beside the text. */
    menu?: 'header' | 'side';
    /** The "Dalej w dziale" card closes the side column. */
    nextCard: boolean;
    /** The page's rows, in the CMS order. */
    rows: Row[];
    /** "Kolumna boczna". */
    side: Row[];
}

const BYLINE_PLACES: Record<string, BylinePlace> = {
    'pod treścią': 'below',
    'w kolumnie bocznej': 'side',
    'w ramce literatury': 'literature'
};

const MENU_PLACES: Record<string, PageLayout['menu']> = {
    'w nagłówku': 'header',
    'obok tekstu': 'side'
};

/** The author and dates of a header; undefined when it has none of them. */
function heroByline(hero: PageHeroData, page: Page | undefined): Byline | undefined {
    if (!hero.author && !hero.published && !hero.updated) return undefined;
    return {
        author: hero.author,
        published: formatDate(hero.published),
        updated: formatDate(hero.updated) ?? formatDate(page?.updated)
    };
}

function headerStyle(data: PageHeroData): HeaderStyle {
    if (data.image) return 'photo';
    if (data.variant === 'jasne') return 'light';
    if (data.variant === 'ciemne') return 'dark';
    return 'plain';
}

const isRow = (row: Row | null | undefined): row is Row => !!row?.type;

/** A "Strona treści": the header, side column, section menu and byline are the values of its type. */
function layoutContent(page: Page, rows: Row[]): PageLayout {
    const {
        side,
        header_component: component,
        action_label: actionLabel,
        action_link: actionLink,
        byline,
        section_menu: menu,
        next_card: nextCard,
        ...hero
    } = (page.typeData ?? {}) as ContentTypeData;
    const data: PageHeroData = { ...hero, title: hero.title || page.title };
    const search = rows.find(row => row.type === 'dictionary' && row.data?.search_in_header);

    return {
        kind: 'content',
        header: {
            data,
            style: headerStyle(data),
            component: isRow(component) ? component : undefined,
            action: actionLink ? { label: actionLabel || actionLink, link: actionLink } : undefined,
            eyebrow: data.eyebrow?.trim() || undefined,
            searchCount: search ? ((search.data as DictionaryData)?.items?.length ?? 0) : undefined
        },
        byline: heroByline(hero, page),
        bylinePlace: BYLINE_PLACES[byline ?? ''] ?? 'header',
        menu: MENU_PLACES[menu ?? ''],
        nextCard: !!nextCard,
        rows,
        side: (side ?? []).map(item => item?.component).filter(isRow)
    };
}

/** An album: its category, cover, author and dates are the values of its type. */
function layoutAlbum(page: Page, rows: Row[]): PageLayout {
    const album = (page.typeData ?? {}) as AlbumTypeData;
    return {
        kind: 'album',
        rows: rows.map(row => (row.type === 'gallery' ? ({ ...row, data: { ...row.data, ...album } } as Row) : row)),
        side: [],
        bylinePlace: 'header',
        nextCard: false
    };
}

export function layoutPage(page: Page | undefined): PageLayout {
    const rows = (page?.rows ?? []).filter(isRow);

    if (page?.type === CONTENT_PAGE) return layoutContent(page, rows);
    if (page?.type === ALBUM_PAGE) return layoutAlbum(page, rows);

    // A page without a type has no header of its own: its rows run the full width (the home
    // page and the map, whose banner and map panel hold the title).
    return { kind: 'home', rows, side: [], bylinePlace: 'header', nextCard: false };
}
