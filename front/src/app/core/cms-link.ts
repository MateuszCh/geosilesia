/**
 * Linki wpisywane w CMS-ie bywają bez wiodącego ukośnika ("galeria/skaly"). Stary front
 * renderował je przez zwykłe href z <base href="/">, więc przeglądarka rozwiązywała je
 * względem korzenia. routerLink rozwiązuje ścieżkę bez "/" względem bieżącej trasy – na
 * podstronie "/geosilesia-galeria" dałoby to "/geosilesia-galeria/galeria/skaly".
 */

/** Adresy, których nie wolno puszczać przez router – idą zwykłym href. */
export function isExternalLink(link: string | undefined): boolean {
    return !!link && /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(link);
}

/** Link wewnętrzny w postaci bezwzględnej, tak jak rozwiązałby go <base href="/">. */
export function internalLink(link: string | undefined): string | undefined {
    if (!link) return link;
    return link.startsWith('/') ? link : `/${link}`;
}
