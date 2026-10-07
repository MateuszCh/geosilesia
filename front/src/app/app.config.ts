import {
    ApplicationConfig,
    isDevMode,
    provideBrowserGlobalErrorListeners
} from '@angular/core';
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

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(
            routes,
            // The resolver result goes straight into the page component's `page` input.
            withComponentInputBinding(),
            // Equivalent of $window.scrollTo(0, 0) on $routeChangeSuccess.
            withInMemoryScrolling({ scrollPositionRestoration: 'top' })
        ),
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
