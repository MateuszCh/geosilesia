import { Injectable, computed, inject, signal } from '@angular/core';
import { ResourceService } from './resource.service';
import { colorByName } from './categories';
import { PostRefs, pickPosts } from './post-refs';
import { AlbumCategoryPostData, Post } from '../models/post.model';

/** The query parameter of the album list that picks a category. */
export const ALBUM_CATEGORY_PARAM = 'kategoria';

export interface AlbumCategory {
    /** The post's id; albums pick their category by it. */
    key: string;
    /** Names the category in the album list's address: "/geosilesia-galeria?kategoria=inne". */
    slug: string;
    label: string;
    color: string;
}

/** Colour of an album without a category, or of one whose post has no colour. */
const NO_CATEGORY_COLOR = 'var(--muted)';

/**
 * Album categories: the `album_category` posts, in their "Kolejność". The front end keeps
 * no categories of its own; an album and an entry of the manual list pick one ("post" field).
 * Network first like the navigation, IndexedDB when offline.
 */
@Injectable({ providedIn: 'root' })
export class AlbumCategories {
    private readonly resource = inject(ResourceService);
    private readonly posts = signal<Post<AlbumCategoryPostData>[]>([]);
    private requested = false;

    readonly all = computed<AlbumCategory[]>(() =>
        [...this.posts()]
            .filter(post => post.data?.name)
            .sort((a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0))
            .map(post => ({
                key: String(post.id),
                slug: post.data.slug?.trim() || String(post.id),
                label: post.data.name!,
                color: colorByName(post.data.color) ?? NO_CATEGORY_COLOR
            }))
    );

    load(): void {
        if (this.requested) return;
        this.requested = true;
        this.resource.loadPostsFromNetwork<AlbumCategoryPostData>('album_category').subscribe(posts => {
            if (posts.length) {
                this.posts.set(posts);
                return;
            }
            if (this.resource.isOfflineAvailable()) {
                void this.resource.loadPostsFromCache<AlbumCategoryPostData>('album_category').then(cached => this.posts.set(cached));
            }
        });
    }

    /** The category an album picks; none when it picks none or its post is gone. */
    picked(value: PostRefs | null | undefined): AlbumCategory | undefined {
        const [post] = pickPosts(value, this.posts());
        return post ? this.all().find(category => category.key === String(post.id)) : undefined;
    }

    bySlug(slug: string | null | undefined): AlbumCategory | undefined {
        return slug ? this.all().find(category => category.slug === slug) : undefined;
    }

    byKey(key: string | undefined): AlbumCategory | undefined {
        return key ? this.all().find(category => category.key === key) : undefined;
    }
}
