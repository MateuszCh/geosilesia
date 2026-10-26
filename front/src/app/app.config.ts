import {
    ApplicationConfig,
    inject,
    isDevMode,
    provideAppInitializer,
    provideBrowserGlobalErrorListeners
} from '@angular/core';
import { ViewportScroller } from '@angular/common';
import {
    provideRouter,
    withComponentInputBinding,
    withInMemoryScrolling
} from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
    provideClientHydration,
    withEventReplay,
    withHttpTransferCacheOptions
} from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { provideScrollRestoration } from './core/scroll-restoration';

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
            })
        ),
        // A little room above the fragment's element.
        provideAppInitializer(() => inject(ViewportScroller).setOffset([0, 24])),
        // Back/forward also once the rest of the page has loaded, and after leaving the app.
        provideScrollRestoration(),
        provideHttpClient(withFetch()),
        // Hydration takes over the server-rendered DOM. The HTTP transfer cache replays the
        // API responses from the render at startup, so the client's first view matches the
        // HTML. By default it skips requests with withCredentials, which ApiService always
        // sets – the API data is public, so they are enabled explicitly. withEventReplay
        // replays clicks made before the JS loaded.
        provideClientHydration(
            withHttpTransferCacheOptions({ includeRequestsWithCredentials: true }),
            withEventReplay()
        ),
        provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
        })
    ]
};
