import { GalleryData, PageHeroData, Row } from './row.model';

/**
 * Keys of the page types in the CMS settings (scripts/cms/18-page-types.js). The home page
 * and the map page have none: their own rows draw them.
 */
export const CONTENT_PAGE = 'tresc';
export const ALBUM_PAGE = 'album';

/**
 * Values of a "Strona treści" page: its header and byline (what the `page_hero` row held)
 * and the column beside the text.
 */
export interface ContentTypeData extends PageHeroData {
    /** A repeater of "component" fields; each value has the shape of a page row. */
    side?: { component?: Row | null }[];
    /** "W nagłówku": a component drawn in the header. */
    header_component?: Row | null;
    /** "Przycisk przy tytule". */
    action_label?: string;
    action_link?: string;
    /** "Autor i daty"; empty = in the header. */
    byline?: '' | 'pod treścią' | 'w kolumnie bocznej' | 'w ramce literatury' | string;
    /** "Menu działu"; empty = none. */
    section_menu?: '' | 'w nagłówku' | 'obok tekstu' | string;
    /** The "Dalej w dziale" card at the end of the side column. */
    next_card?: boolean;
}

/** Values of an "Album" page: what the album list and the album's header show. */
export type AlbumTypeData = Pick<GalleryData, 'category' | 'cover' | 'author' | 'published' | 'updated' | 'hidden'>;

/** A document from the `pages` collection. `pageUrl` is the IndexedDB key. */
export interface Page {
    pageUrl: string;
    /** CMS label of the page; the fallback page title. */
    title?: string;
    seoTitle?: string;
    seoDescription?: string;
    /** The CMS stores it as a number of ms, but it may be a Date (BSON) or a digit string. */
    updated?: string | number | Date;
    /** Key of the page's type (CONTENT_PAGE, ALBUM_PAGE); pages not migrated yet have none. */
    type?: string;
    /** Values of the fields of the page's type. */
    typeData?: ContentTypeData | AlbumTypeData;
    rows?: Row[];
}

/** Response of /api/page/:pageUrl and /api/page/. */
export interface PagesResponse {
    pages?: Page[];
}
