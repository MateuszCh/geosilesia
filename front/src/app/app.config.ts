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
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
    providers: [
        provideBrowserGlobalErrorListeners(),
        provideRouter(
            routes,
            // Wynik resolvera trafia prosto do inputu `page` komponentu strony.
            withComponentInputBinding(),
            // Odpowiednik $window.scrollTo(0, 0) na $routeChangeSuccess.
            withInMemoryScrolling({ scrollPositionRestoration: 'top' })
        ),
        provideHttpClient(withFetch()),
        provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
        })
    ]
};
