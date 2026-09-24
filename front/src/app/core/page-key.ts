/**
 * Klucz strony używany i w adresie API, i jako klucz w IndexedDB. Musi być liczony
 * identycznie w resolverze i w komponencie – inaczej resolver czytałby z bazy pod jednym
 * kluczem, a komponent odświeżał pod innym.
 *
 * "/" → "/", "/slownik" → "slownik", "/index.html" → "/" (ten adres to ta sama strona
 * główna, a service worker trzyma go w cache'u pod własną nazwą).
 */
export function pageKeyFromUrl(url: string): string {
    const path = url.split('?')[0].split('#')[0];
    let decoded: string;
    try {
        decoded = decodeURIComponent(path);
    } catch {
        decoded = path; // uszkodzona sekwencja %-owa – bierzemy jak leci
    }
    const key = decoded.replace(/^\/+/, '');
    return !key || key === 'index.html' ? '/' : key;
}
