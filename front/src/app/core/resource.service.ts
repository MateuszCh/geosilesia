import { Injectable, inject } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { IdbService } from './idb.service';
import { Page, PagesResponse } from '../models/page.model';
import { AppData, Post } from '../models/post.model';

/**
 * Jedno miejsce, przez które przechodzą dane z API.
 *
 * Względem resource.service.js dochodzi tu odpowiedzialność, którą wcześniej pełnił
 * ręczny service worker (sw.js): zapis odpowiedzi do IndexedDB. ngsw cache'uje odpowiedzi
 * w Cache API, ale nie zna naszej bazy, a to z niej resolver i komponenty czytają dane
 * zanim sieć odpowie. Reguły zapisu przeniesione bez zmian: posty danego typu wymieniane
 * w całości, strony dopisywane, /api/appData zastępuje komplet.
 */
@Injectable({ providedIn: 'root' })
export class ResourceService {
    private readonly api = inject(ApiService);
    private readonly idb = inject(IdbService);

    isOfflineAvailable(): boolean {
        return this.idb.isAvailable();
    }

    /**
     * Klucz strony trafia do ścieżki adresu, więc ukośniki trzeba zakodować – inaczej
     * "galeria/skaly" rozpadłoby się na dwa segmenty i nie trafiło w trasę
     * /api/page/:pageUrl. Znaki spoza ASCII koduje sama przeglądarka.
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
                // Pusta odpowiedź też jest informacją, ale nie kasujemy nią cache'u:
                // przy chwilowej awarii backendu użytkownik straciłby dane offline.
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
     * Zbiorczy prefetch pod tryb offline – odpowiednik pwa.run.js. Odpalany raz, po
     * starcie aplikacji, i celowo z opóźnieniem: to najcięższe zapytanie serwisu,
     * a nie ma prawa konkurować o łącze z treścią, którą użytkownik właśnie ogląda.
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
