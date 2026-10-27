import { Injectable, PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { Observable, from, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { ResourceService } from './resource.service';
import { AlbumSummary, MarkerPostData, Post } from '../models/post.model';

/**
 * Posts and albums shared by several rows of one page (the home page counts markers in the
 * stats strip and in the category cards): each type is requested once per app and then
 * replayed. When the network gives nothing, the offline copy in IndexedDB is used.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
    private readonly resource = inject(ResourceService);
    private readonly transferState = inject(TransferState);
    private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
    private readonly posts$ = new Map<string, Observable<Post[]>>();
    private albums$: Observable<AlbumSummary[]> | undefined;

    /** `transfer: false` – see ApiService.get; such a list is requested and kept apart. */
    posts<T>(type: string, transfer = true): Observable<Post<T>[]> {
        const key = transfer ? type : `${type}:no-transfer`;
        let posts = this.posts$.get(key);
        if (!posts) {
            posts = this.resource.loadPostsFromNetwork<unknown>(type, transfer).pipe(
                switchMap(fresh =>
                    fresh.length || !this.resource.isOfflineAvailable()
                        ? of(fresh)
                        : from(this.resource.loadPostsFromCache<unknown>(type))
                ),
                shareReplay({ bufferSize: 1, refCount: false })
            );
            this.posts$.set(key, posts);
        }
        return posts as Observable<Post<T>[]>;
    }

    albums(): Observable<AlbumSummary[]> {
        this.albums$ ??= this.resource.loadAlbums().pipe(shareReplay({ bufferSize: 1, refCount: false }));
        return this.albums$;
    }

    /**
     * A small value computed from whole post lists – a count, the latest few events. The
     * server sends only the value, in TransferState, and fetches the lists past the HTTP
     * transfer cache, so they stay out of the HTML (all markers alone weigh almost 1 MB,
     * and the browser can hydrate only after the whole HTML has arrived). The browser then
     * takes the server's value for the rest of the visit; without one (a page first opened
     * without the render) it computes the value itself.
     */
    summary<T>(key: string, compute: () => Observable<T>): Observable<T> {
        const stateKey = makeStateKey<T>(`summary:${key}`);
        if (this.transferState.hasKey(stateKey)) {
            return of(this.transferState.get(stateKey, null) as T);
        }
        return compute().pipe(
            tap(value => {
                if (this.isServer) this.transferState.set(stateKey, value);
            })
        );
    }

    /** Places on the map per category key; a marker listing a category twice counts once. */
    markerCountsByCategory(): Observable<Record<string, number>> {
        return this.summary('markers-by-category', () =>
            this.posts<MarkerPostData>('marker', false).pipe(
                map(markers => {
                    const counts: Record<string, number> = {};
                    markers.forEach(marker =>
                        new Set(marker.data?.categories ?? []).forEach(key => (counts[key] = (counts[key] ?? 0) + 1))
                    );
                    return counts;
                })
            )
        );
    }

    /** Number of posts of a type, for lists too heavy to send just to be counted. */
    postCount(type: string): Observable<number> {
        return this.summary(`count:${type}`, () => this.posts(type, false).pipe(map(posts => posts.length)));
    }

    /** Markers that have coordinates, i.e. are actually shown on the map. */
    locatedMarkerCount(): Observable<number> {
        return this.summary('count:marker-located', () =>
            this.posts<MarkerPostData>('marker', false).pipe(
                map(markers => markers.filter(marker => marker.data?.lat && marker.data?.long).length)
            )
        );
    }
}
