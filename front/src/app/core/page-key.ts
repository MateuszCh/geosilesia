import * as seoMeta from '../../../../shared/seo-meta';

/**
 * Page key used both in the API URL and as the IndexedDB key. It must be computed the
 * same way in the resolver and in the component – otherwise the resolver would read from
 * the database under one key and the component would refresh under another.
 *
 * "/" → "/", "/slownik" → "slownik", "/index.html" → "/" (that address is the same home
 * page, which the service worker cached under its own name).
 */
export function pageKeyFromUrl(url: string): string {
    const path = url.split('?')[0].split('#')[0];
    let decoded: string;
    try {
        decoded = decodeURIComponent(path);
    } catch {
        decoded = path; // malformed %-sequence – take it as is
    }
    const key = decoded.replace(/^\/+/, '');
    return !key || key === 'index.html' ? '/' : key;
}

/**
 * Every spelling of a page's pageUrl that the server matches to this key – the same list
 * as pageUrlCandidates in app.js. IndexedDB stores a page under its pageUrl as the CMS wrote
 * it, so removing a page that no longer exists has to try all of them.
 */
export function pageKeySpellings(key: string): string[] {
    const normalized = seoMeta.normalizePath(key);
    if (normalized === '/') return ['/', ''];
    const bare = normalized.slice(1);
    return [bare, normalized, `${bare}/`, `${normalized}/`];
}
