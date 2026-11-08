import { Injectable, inject } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { IdbService } from './idb.service';
import { pageKeySpellings } from './page-key';
import { Page, PagesResponse } from '../models/page.model';
import { AlbumSummary, AppData, Post } from '../models/post.model';

/**
 * The single place all API data passes through.
 *
 * Compared with resource.service.js it takes over a responsibility previously handled by
 * the hand-written service worker (sw.js): storing responses in IndexedDB. ngsw caches
 * responses in the Cache API, but it does not know our database, and that is where the
 * resolver and components read data from before the network responds. The storage rules
 * are unchanged: posts of a type are replaced as a whole, pages are added, /api/appData
 * replaces everything.
 */
@Injectable({ providedIn: 'root' })
export class ResourceService {
    private readonly api = inject(ApiService);
    private readonly idb = inject(IdbService);

    isOfflineAvailable(): boolean {
        return this.idb.isAvailable();
    }

    /**
     * The page key goes into the URL path, so slashes have to be encoded – otherwise
     * "galeria/skaly" would split into two segments and miss the /api/page/:pageUrl
     * route. The browser encodes non-ASCII characters by itself.
     */
    private pageUrlSegment(pageKey: string): string {
        return pageKey.replace(/\//g, '%2F');
    }

    /**
     * `pageView` marks the request as the user opening the page – the router resolver and
     * the page component's refresh – so the server counts it as an in-app navigation in its
     * visit statistics. Other reads of a page (the home page banner) leave it off.
     *
     * `null` means the server answered that the page does not exist – deleted, or marked
     * as a draft in the CMS – and `undefined` that there was no answer (offline, an error).
     * Only the latter may fall back to the copy in IndexedDB; on `null` that copy is
     * removed, so a page that became a draft is not shown from the offline database.
     */
    loadPageFromNetwork(
        pageKey: string,
        { pageView = false }: { pageView?: boolean } = {}
    ): Observable<Page | null | undefined> {
        return this.api
            .get<PagesResponse>(`/api/page/${this.pageUrlSegment(pageKey)}`, {
                headers: pageView ? { 'X-Page-View': '1' } : undefined
            })
            .pipe(
                map(response => {
                    const pages = response?.pages;
                    if (!Array.isArray(pages)) return undefined;
                    if (pages.length) {
                        void this.idb.putPages(pages);
                        return pages[0];
                    }
                    void this.idb.deletePages(pageKeySpellings(pageKey));
                    return null;
                }),
                catchError(() => of(undefined))
            );
    }

    loadPageFromCache(pageKey: string): Promise<Page | undefined> {
        return this.idb.getPage(pageKey);
    }

    loadPostsFromNetwork<T>(type: string, transfer = true): Observable<Post<T>[]> {
        return this.api.get<Post<T>[]>(`/api/posts/${type}`, { transfer }).pipe(
            map(posts => posts ?? []),
            tap(posts => {
                // An empty response is information too, but it does not wipe the cache:
                // during a brief backend outage the user would lose their offline data.
                if (posts.length) {
                    void this.idb.replacePostsOfType(type, posts as Post[]);
                }
            }),
            catchError(() => of([] as Post<T>[]))
        );
    }

    /** Every album (page with a `gallery` row) with its category, cover and photo count. */
    loadAlbums(): Observable<AlbumSummary[]> {
        return this.api.get<AlbumSummary[]>('/api/galleries').pipe(
            map(albums => albums ?? []),
            catchError(() => of([] as AlbumSummary[]))
        );
    }

    loadPostsFromCache<T>(type: string): Promise<Post<T>[]> {
        return this.idb.getPosts(type) as Promise<Post<T>[]>;
    }

    /**
     * Bulk prefetch for offline mode – the counterpart of pwa.run.js. Fired once after the
     * app starts, and deliberately delayed: it is the heaviest request of the site and
     * must not compete for bandwidth with the content the user is looking at.
     */
    prefetchAppData(): void {
        if (!this.idb.isAvailable()) return;
        this.api
            .get<AppData>('/api/appData')
            .pipe(catchError(() => of({} as AppData)))
            .subscribe(data => {
                void this.idb.replaceAll(data.pages ?? [], data.posts ?? []);
            });
    }
}
