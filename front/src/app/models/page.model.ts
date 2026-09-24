import { Row } from './row.model';

/** Dokument z kolekcji `pages`. `pageUrl` jest kluczem w IndexedDB. */
export interface Page {
    pageUrl: string;
    seoTitle?: string;
    seoDescription?: string;
    /** CMS zapisuje jako liczbę ms, ale bywa Date (BSON) albo ciągiem cyfr. */
    updated?: string | number | Date;
    rows?: Row[];
}

/** Odpowiedź /api/page/:pageUrl oraz /api/page/. */
export interface PagesResponse {
    pages?: Page[];
}
