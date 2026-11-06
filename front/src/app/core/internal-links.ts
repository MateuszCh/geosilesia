import { DOCUMENT, EnvironmentProviders, PLATFORM_ID, inject, provideAppInitializer } from '@angular/core';
import { ViewportScroller, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

/** Addresses the server answers itself: the API, uploaded files, sitemap.xml, robots.txt. */
const SERVER_PATH = /^\/(api|uploads)(\/|$)|\.[a-z0-9]+$/i;

/**
 * Links to the site's own pages written as a plain <a href> – in CMS text, and in the few
 * templates that take a link from the CMS – open in the app, as a routerLink does, instead
 * of loading the whole site again. Files, the API and other sites keep the browser's
 * behaviour, and so do links the reader opens in a new tab or window.
 *
 * "#id" jumps within the page. On its own the browser resolves it against <base href="/">
 * and opens the home page – which is what "Przejdź do treści" did on every other page.
 */
export function provideInternalLinks(): EnvironmentProviders {
    return provideAppInitializer(() => {
        if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
        const router = inject(Router);
        const scroller = inject(ViewportScroller);
        const doc = inject(DOCUMENT);

        doc.addEventListener('click', event => {
            const link = followedLink(event);
            if (!link) return;
            const href = link.getAttribute('href') ?? '';
            if (href.startsWith('#')) {
                event.preventDefault();
                scroller.scrollToAnchor(decodeURIComponent(href.slice(1)));
                return;
            }
            if (link.origin !== doc.location.origin || SERVER_PATH.test(link.pathname)) return;
            event.preventDefault();
            void router.navigateByUrl(link.pathname + link.search + link.hash);
        });
    });
}

/** The link a plain click follows in this tab; nothing when the app has nothing to do. */
function followedLink(event: MouseEvent): HTMLAnchorElement | undefined {
    // A routerLink has already handled it; modifier keys open a new tab or window.
    if (event.defaultPrevented || event.button !== 0) return undefined;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return undefined;
    const link = (event.target as Element | null)?.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return undefined;
    if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return undefined;
    return link;
}
