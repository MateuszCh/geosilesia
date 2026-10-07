/**
 * Links entered in the CMS sometimes lack the leading slash ("galeria/skaly"). The old
 * front end rendered them as plain href with <base href="/">, so the browser resolved
 * them against the root. routerLink resolves a path without "/" against the current
 * route – on the "/geosilesia-galeria" page that would give
 * "/geosilesia-galeria/galeria/skaly".
 */

/** Addresses that must not go through the router – they use a plain href. */
export function isExternalLink(link: string | undefined): boolean {
    return !!link && /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(link);
}

/** Internal link in absolute form, the way <base href="/"> would resolve it. */
export function internalLink(link: string | undefined): string | undefined {
    if (!link) return link;
    return link.startsWith('/') ? link : `/${link}`;
}
