import { Injectable, computed, inject, signal } from '@angular/core';
import { ResourceService } from './resource.service';
import { internalLink } from './cms-link';
import { Top50SettingsPostData } from '../models/post.model';

/**
 * The single `top50_settings` post: the route's page and the "TOP 50 nr …" labels of a place
 * on the map and on an album page. Network first like the navigation, IndexedDB when offline.
 */
@Injectable({ providedIn: 'root' })
export class Top50Settings {
    private readonly resource = inject(ResourceService);
    private readonly data = signal<Top50SettingsPostData | undefined>(undefined);
    private requested = false;

    readonly routeLink = computed(() => internalLink(this.data()?.route_link || undefined));

    load(): void {
        if (this.requested) return;
        this.requested = true;
        this.resource.loadPostsFromNetwork<Top50SettingsPostData>('top50_settings').subscribe(posts => {
            if (posts.length) {
                this.data.set(posts[0].data);
                return;
            }
            if (this.resource.isOfflineAvailable()) {
                void this.resource
                    .loadPostsFromCache<Top50SettingsPostData>('top50_settings')
                    .then(cached => this.data.set(cached[0]?.data));
            }
        });
    }

    /** "TOP 50 nr 12" on the map; empty without a number or a label. */
    placeLabel(number: number | undefined): string {
        return withNumber(this.data()?.place_label, number);
    }

    /** "TOP 50 · nr 12" on an album page. */
    albumLabel(number: number | undefined): string {
        return withNumber(this.data()?.album_label, number);
    }
}

function withNumber(label: string | undefined, number: number | undefined): string {
    return label && number ? label.replace(/\{nr\}/g, String(number)) : '';
}
