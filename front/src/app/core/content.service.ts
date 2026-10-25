import { Injectable, inject } from '@angular/core';
import { Observable, from, of, shareReplay, switchMap } from 'rxjs';
import { ResourceService } from './resource.service';
import { AlbumSummary, Post } from '../models/post.model';

/**
 * Posts and albums shared by several rows of one page (the home page counts markers in the
 * stats strip and in the category cards): each type is requested once per app and then
 * replayed. When the network gives nothing, the offline copy in IndexedDB is used.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
    private readonly resource = inject(ResourceService);
    private readonly posts$ = new Map<string, Observable<Post[]>>();
    private albums$: Observable<AlbumSummary[]> | undefined;

    posts<T>(type: string): Observable<Post<T>[]> {
        let posts = this.posts$.get(type);
        if (!posts) {
            posts = this.resource.loadPostsFromNetwork<unknown>(type).pipe(
                switchMap(fresh =>
                    fresh.length || !this.resource.isOfflineAvailable()
                        ? of(fresh)
                        : from(this.resource.loadPostsFromCache<unknown>(type))
                ),
                shareReplay({ bufferSize: 1, refCount: false })
            );
            this.posts$.set(type, posts);
        }
        return posts as Observable<Post<T>[]>;
    }

    albums(): Observable<AlbumSummary[]> {
        this.albums$ ??= this.resource.loadAlbums().pipe(shareReplay({ bufferSize: 1, refCount: false }));
        return this.albums$;
    }
}
