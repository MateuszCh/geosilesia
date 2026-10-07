import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { Page } from '../models/page.model';
import { Post } from '../models/post.model';

/**
 * The schema MUST stay as the former pwa.service.js and sw.js assumed: database
 * "geosilesia" version 1, store "pages" keyed by pageUrl and "posts" keyed by id with
 * a type index. Users have these databases on disk – changing the name or version
 * would wipe their offline data on the first visit after deployment.
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
     * Condition copied 1:1 from pwa.service.js – offline mode requires a service worker
     * AND IndexedDB, because without the former nobody would fill this database.
     */
    isAvailable(): boolean {
        return (
            this.isBrowser &&
            'serviceWorker' in navigator &&
            'indexedDB' in window
        );
    }

    private open(): Promise<IDBPDatabase<GeoSilesiaDB>> {
        // Opened lazily, not in the constructor: the service lives in the root injector,
        // so otherwise every app start would touch IndexedDB, even where offline mode is
        // not an option at all.
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
        // Pages without pageUrl are skipped – it is the store key, put would throw and
        // abort the whole transaction together with the valid records.
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

    /** Replaces all posts of a given type – exactly what clearPostsByType did in sw.js. */
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

    /** Full replacement of the contents after the /api/appData prefetch. */
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
