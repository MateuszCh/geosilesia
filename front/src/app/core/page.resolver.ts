import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Observable, from, of, switchMap } from 'rxjs';
import { Page } from '../models/page.model';
import { ResourceService } from './resource.service';
import { pageKeyFromUrl } from './page-key';

/**
 * Port resolvera z routes.config.js: gdy tryb offline jest dostępny, najpierw sięgamy do
 * IndexedDB, żeby treść pojawiła się od razu, a dopiero jej brak wysyła nas do sieci.
 * Świeże dane dociąga potem sam komponent strony.
 */
export const pageResolver: ResolveFn<Page | undefined> = (
    route,
    state
): Observable<Page | undefined> => {
    const resource = inject(ResourceService);
    const key = pageKeyFromUrl(state.url);

    if (!resource.isOfflineAvailable()) {
        return resource.loadPageFromNetwork(key);
    }
    return from(resource.loadPageFromCache(key)).pipe(
        switchMap(cached =>
            cached ? of(cached) : resource.loadPageFromNetwork(key)
        )
    );
};
