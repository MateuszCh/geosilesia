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
