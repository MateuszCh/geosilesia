// Typy dla shared/seo-meta.js – ten plik opisuje wyłącznie API modułu, samej logiki
// nie duplikuje. Aplikacja Angulara importuje moduł wprost (CommonJS), serwer przez
// require(); .d.ts wygrywa w rozstrzyganiu modułów, więc TypeScript widzi sygnatury,
// a bundler i tak sięga po .js.

/** Strona z kolekcji `pages`; pola opcjonalne, bo pochodzą z CMS-a. */
export interface SeoPage {
    pageUrl?: string;
    seoTitle?: string;
    seoDescription?: string;
    updated?: string | number | Date;
    rows?: unknown[];
}

export interface SeoMetaResult {
    title: string;
    description: string;
}

export declare const SITE_NAME: string;
export declare const DEFAULT_TITLE: string;
export declare const DEFAULT_DESCRIPTION: string;
export declare const DEFAULT_IMAGE: string;
export declare const NOT_FOUND_TITLE: string;
export declare const MAX_DESCRIPTION: number;

export declare function stripHtml(html: unknown): string;
export declare function truncate(text: string, max: number): string;
export declare function fixCase(text: string): string;
export declare function escapeHtml(text: unknown): string;
/** "slownik", "/slownik/" i "//slownik" sprowadza do "/slownik". */
export declare function normalizePath(pageUrl?: string): string;
export declare function deriveTitle(page?: SeoPage): string;
export declare function deriveDescription(page?: SeoPage): string;
export declare function deriveMeta(page?: SeoPage): SeoMetaResult;
export declare function buildTitle(title?: string): string;
/** seoTitle/seoDescription z CMS-a mają pierwszeństwo przed derywacją z treści. */
export declare function buildMeta(page?: SeoPage): SeoMetaResult;
/** "" gdy `updated` jest puste albo nieparsowalne. */
export declare function updatedIso(page?: SeoPage): string;
