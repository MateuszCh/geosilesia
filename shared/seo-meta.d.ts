// Types for shared/seo-meta.js – this file only describes the module's API and does not
// duplicate its logic. The Angular app imports the module directly (CommonJS), the server
// via require(); .d.ts wins in module resolution, so TypeScript sees the signatures while
// the bundler still picks up the .js.

/** A page from the `pages` collection; fields are optional because they come from the CMS. */
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
/** Turns "slownik", "/slownik/" and "//slownik" into "/slownik". */
export declare function normalizePath(pageUrl?: string): string;
export declare function deriveTitle(page?: SeoPage): string;
export declare function deriveDescription(page?: SeoPage): string;
export declare function deriveMeta(page?: SeoPage): SeoMetaResult;
export declare function buildTitle(title?: string): string;
/** seoTitle/seoDescription from the CMS take precedence over values derived from the content. */
export declare function buildMeta(page?: SeoPage): SeoMetaResult;
/** "" when `updated` is empty or unparsable. */
export declare function updatedIso(page?: SeoPage): string;
