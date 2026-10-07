import { Row } from './row.model';

/** A document from the `pages` collection. `pageUrl` is the IndexedDB key. */
export interface Page {
    pageUrl: string;
    seoTitle?: string;
    seoDescription?: string;
    /** The CMS stores it as a number of ms, but it may be a Date (BSON) or a digit string. */
    updated?: string | number | Date;
    rows?: Row[];
}

/** Response of /api/page/:pageUrl and /api/page/. */
export interface PagesResponse {
    pages?: Page[];
}
