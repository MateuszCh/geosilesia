import {
    ApplicationConfig,
    inject,
    isDevMode,
    provideAppInitializer,
    provideBrowserGlobalErrorListeners
} from '@angular/core';
import { ViewportScroller } from '@angular/common';
import {
    ActivatedRouteSnapshot,
    provideRouter,
    withComponentInputBinding,
    withInMemoryScrolling,
    withViewTransitions
} from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
    provideClientHydration,
    withEventReplay,
    withIncrementalHydration,
    withNoHttpTransferCache
} from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { provideScrollRestoration } from './core/scroll-restoration';
import { provideInternalLinks } from './core/internal-links';

/** The URL path of a router state, from its root snapshot down to the leaf. */
function routePath(root: ActivatedRouteSnapshot): string {
    const segments: string[] = [];
    for (let route: ActivatedRouteSnapshot | null = root; route; route = route.firstChild) {
        segments.push(...route.url.map(segment => segment.path));
    }
    return segments.join('/');
}

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(
            routes,
            // The resolver result goes straight into the page component's `page` input.
            withComponentInputBinding(),
            // A new page opens at the top, a link with a fragment ("#top50-12") at that
            // element, and back/forward where the reader left the page.
            withInMemoryScrolling({
                scrollPositionRestoration: 'enabled',
                anchorScrolling: 'enabled'
            }),
            // Pages crossfade (styles in _base.scss). Not on the page load – the server
            // already rendered it – and not when only the fragment or query changes, which
            // keeps the reader on the same page.
            withViewTransitions({
                skipInitialTransition: true,
                onViewTransitionCreated: ({ transition, from, to }) => {
                    if (routePath(from) === routePath(to)) transition.skipTransition();
                }
            })
        ),
        // A little room above the fragment's element.
        provideAppInitializer(() => inject(ViewportScroller).setOffset([0, 24])),
        // Back/forward also once the rest of the page has loaded, and after leaving the app.
        provideScrollRestoration(),
        // Plain links to the site's pages (CMS text) open in the app too.
        provideInternalLinks(),
        provideHttpClient(withFetch()),
        // Hydration takes over the server-rendered DOM. The API responses of the render
        // reach the browser through ApiService's own TransferState entries, which last the
        // whole visit – Angular's HTTP transfer cache stops at the first stable moment,
        // before the deferred rows hydrate, so it is off. withEventReplay replays clicks
        // made before the JS loaded. withIncrementalHydration lets the rows' @defer blocks
        // (row.html) be rendered by the server and hydrated – with their code loaded – only
        // when they scroll into view.
        provideClientHydration(
            withNoHttpTransferCache(),
            withEventReplay(),
            withIncrementalHydration()
        ),
        provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
        })
    ]
};
