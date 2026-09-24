import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { Page } from '../models/page.model';
import { Post } from '../models/post.model';

/**
 * Schemat MUSI zostać taki, jak zakładał dawny pwa.service.js i sw.js: baza
 * "geosilesia" w wersji 1, store "pages" z kluczem pageUrl oraz "posts" z kluczem id
 * i indeksem type. Użytkownicy mają te bazy na dyskach – zmiana nazwy albo wersji
 * kasowałaby ich dane offline przy pierwszym wejściu po wdrożeniu.
 */
interface GeoSilesiaDB extends DBSchema {
    pages: { key: string; value: Page };
    posts: { key: string | number; value: Post; indexes: { type: string } };
}

@Injectable({ providedIn: 'root' })
export class IdbService {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private db: Promise<IDBPDatabase<GeoSilesiaDB>> | null = null;

    /**
     * Warunek przepisany 1:1 z pwa.service.js – o trybie offline decyduje obecność
     * service workera ORAZ IndexedDB, bo bez pierwszego nikt tej bazy nie zapełni.
     */
    isAvailable(): boolean {
        return (
            this.isBrowser &&
            'serviceWorker' in navigator &&
            'indexedDB' in window
        );
    }

    private open(): Promise<IDBPDatabase<GeoSilesiaDB>> {
        // Otwieramy leniwie, nie w konstruktorze: serwis jest w root injectorze, więc
        // inaczej każde odpalenie aplikacji dotykałoby IndexedDB, także tam, gdzie
        // offline w ogóle nie wchodzi w grę.
        this.db ??= openDB<GeoSilesiaDB>('geosilesia', 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('pages')) {
                    db.createObjectStore('pages', { keyPath: 'pageUrl' });
                }
                if (!db.objectStoreNames.contains('posts')) {
                    const posts = db.createObjectStore('posts', {
                        keyPath: 'id'
                    });
                    posts.createIndex('type', 'type', { unique: false });
                }
            }
        });
        return this.db;
    }

    async getPage(pageUrl: string): Promise<Page | undefined> {
        if (!this.isAvailable()) return undefined;
        return (await this.open()).get('pages', pageUrl);
    }

    async getPosts(type: string): Promise<Post[]> {
        if (!this.isAvailable()) return [];
        return (await this.open()).getAllFromIndex('posts', 'type', type);
    }

    async putPages(pages: Page[]): Promise<void> {
        if (!this.isAvailable()) return;
        const db = await this.open();
        const tx = db.transaction('pages', 'readwrite');
        // Strony bez pageUrl odpadają – to klucz store'a, put rzuciłby błędem
        // i przerwał całą transakcję razem z poprawnymi rekordami.
        await Promise.all(
            pages.filter(page => page?.pageUrl).map(page => tx.store.put(page))
        );
        await tx.done;
    }

    async putPosts(posts: Post[]): Promise<void> {
        if (!this.isAvailable()) return;
        const db = await this.open();
        const tx = db.transaction('posts', 'readwrite');
        await Promise.all(
            posts.filter(post => post?.id !== undefined).map(post => tx.store.put(post))
        );
        await tx.done;
    }

    /** Wymiana kompletu postów danego typu – dokładnie to robił clearPostsByType w sw.js. */
    async replacePostsOfType(type: string, posts: Post[]): Promise<void> {
        if (!this.isAvailable()) return;
        const db = await this.open();
        const tx = db.transaction('posts', 'readwrite');
        let cursor = await tx.store.index('type').openKeyCursor(IDBKeyRange.only(type));
        while (cursor) {
            void tx.store.delete(cursor.primaryKey);
            cursor = await cursor.continue();
        }
        for (const post of posts) {
            if (post?.id !== undefined) void tx.store.put(post);
        }
        await tx.done;
    }

    /** Pełna wymiana zawartości po prefetchu /api/appData. */
    async replaceAll(pages: Page[], posts: Post[]): Promise<void> {
        if (!this.isAvailable()) return;
        const db = await this.open();
        if (pages.length) {
            const tx = db.transaction('pages', 'readwrite');
            await tx.store.clear();
            await Promise.all(
                pages.filter(page => page?.pageUrl).map(page => tx.store.put(page))
            );
            await tx.done;
        }
        if (posts.length) {
            const tx = db.transaction('posts', 'readwrite');
            await tx.store.clear();
            await Promise.all(
                posts.filter(post => post?.id !== undefined).map(post => tx.store.put(post))
            );
            await tx.done;
        }
    }
}
