import { PLATFORM_ID, TransferState, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ResolveFn } from '@angular/router';
import { Observable, from, map, of, switchMap } from 'rxjs';
import { Page } from '../models/page.model';
import { ResourceService } from './resource.service';
import { pageKeyFromUrl } from './page-key';
import { RENDERED_ON_SERVER } from './ssr';

/**
 * Port of the resolver from routes.config.js: when offline mode is available we first look
 * in IndexedDB so the content shows up immediately, and only its absence sends us to the
 * network. The page component then fetches fresh data by itself.
 *
 * The exception is the first navigation on a server-rendered page: IndexedDB may hold an
 * older version than the one in the HTML, and hydration requires them to match. The render
 * data waits in the transfer cache, so the "network" answers immediately, without a request.
 *
 * A page the server does not have (`null` from the network: deleted, or a draft) resolves to
 * `undefined` like any missing page – the component shows the 404.
 */
export const pageResolver: ResolveFn<Page | undefined> = (
    route,
    state
): Observable<Page | undefined> => {
    const resource = inject(ResourceService);
    const key = pageKeyFromUrl(state.url);
    const fromNetwork = () =>
        resource.loadPageFromNetwork(key, { pageView: true }).pipe(map(page => page ?? undefined));

    const transferState = inject(TransferState);
    if (
        isPlatformBrowser(inject(PLATFORM_ID)) &&
        transferState.hasKey(RENDERED_ON_SERVER)
    ) {
        transferState.remove(RENDERED_ON_SERVER);
        return fromNetwork();
    }

    if (!resource.isOfflineAvailable()) {
        return fromNetwork();
    }
    return from(resource.loadPageFromCache(key)).pipe(
        switchMap(cached =>
            cached ? of(cached) : fromNetwork()
        )
    );
};
