import { Injectable, inject } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { IdbService } from './idb.service';
import { Page, PagesResponse } from '../models/page.model';
import { AppData, Post } from '../models/post.model';

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

    loadPageFromNetwork(pageKey: string): Observable<Page | undefined> {
        return this.api
            .get<PagesResponse>(`/api/page/${this.pageUrlSegment(pageKey)}`)
            .pipe(
                tap(response => {
                    if (response?.pages?.length) {
                        void this.idb.putPages(response.pages);
                    }
                }),
                map(response => response?.pages?.[0]),
                catchError(() => of(undefined))
            );
    }

    loadPageFromCache(pageKey: string): Promise<Page | undefined> {
        return this.idb.getPage(pageKey);
    }

    loadPostsFromNetwork<T>(type: string): Observable<Post<T>[]> {
        return this.api.get<Post<T>[]>(`/api/posts/${type}`).pipe(
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
