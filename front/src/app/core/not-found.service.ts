import { Injectable, computed, inject, signal } from '@angular/core';
import { ResourceService } from './resource.service';
import { internalLink } from './cms-link';
import { NotFoundPostData, Post } from '../models/post.model';

export interface NotFoundLink {
    label: string;
    link: string;
}

export interface SignpostBoard extends NotFoundLink {
    left: boolean;
}

/** Entries with a label and a link, the link in the form the router uses. */
function links<T extends { label?: string; link?: string }>(entries: (T | null)[] | undefined): (T & NotFoundLink)[] {
    return (entries ?? [])
        .filter((entry): entry is T => !!entry?.label && !!entry.link)
        .map(entry => ({ ...entry, label: entry.label!, link: internalLink(entry.link)! }));
}

/**
 * The single `not_found` post: the texts and links of the 404 page. Loaded the first time a
 * 404 is shown, network first like the navigation, IndexedDB when offline.
 */
@Injectable({ providedIn: 'root' })
export class NotFoundService {
    private readonly resource = inject(ResourceService);
    private readonly data = signal<NotFoundPostData | undefined>(undefined);
    private requested = false;

    readonly eyebrow = computed(() => this.data()?.eyebrow ?? '');
    readonly title = computed(() => this.data()?.title ?? '');
    readonly lead = computed(() => this.data()?.lead ?? '');
    readonly leadOffline = computed(() => this.data()?.lead_offline || this.lead());
    readonly buttons = computed<NotFoundLink[]>(() => links(this.data()?.buttons));
    readonly signpost = computed<SignpostBoard[]>(() =>
        links(this.data()?.signpost).map(board => ({
            label: board.label,
            link: board.link,
            left: /^w lewo/i.test(board.direction ?? '')
        }))
    );
    readonly offlineTitle = computed(() => this.data()?.offline_title ?? '');
    readonly offlineText = computed(() => this.data()?.offline_text ?? '');

    load(): void {
        if (this.requested) return;
        this.requested = true;
        this.resource.loadPostsFromNetwork<NotFoundPostData>('not_found').subscribe(posts => {
            if (posts.length) {
                this.set(posts);
                return;
            }
            if (this.resource.isOfflineAvailable()) {
                void this.resource.loadPostsFromCache<NotFoundPostData>('not_found').then(cached => this.set(cached));
            }
        });
    }

    private set(posts: Post<NotFoundPostData>[]): void {
        this.data.set(posts[0]?.data);
    }
}
