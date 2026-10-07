import {
    ChangeDetectionStrategy,
    Component,
    OnInit,
    inject,
    input,
    signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { ResourceService } from '../../core/resource.service';
import { EventPost } from '../../models/post.model';
import { NewsData } from '../../models/row.model';

@Component({
    selector: 'app-news',
    templateUrl: './news.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class News implements OnInit {
    readonly component = input.required<NewsData>();

    readonly events = signal<EventPost[]>([]);
    readonly active = signal<number | null>(0);

    private readonly resource = inject(ResourceService);
    private readonly destroyRef = inject(DestroyRef);
    /** Network data takes precedence – once it has arrived, the IndexedDB result will not overwrite it. */
    private loadedFromNetwork = false;

    ngOnInit(): void {
        if (this.resource.isOfflineAvailable()) {
            void this.resource
                .loadPostsFromCache<EventPost['data']>('wydarzenie')
                .then(cached => {
                    if (!this.loadedFromNetwork && cached.length) {
                        this.setEvents(cached);
                    }
                });
        }
        this.resource
            .loadPostsFromNetwork<EventPost['data']>('wydarzenie')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(posts => {
                if (posts.length) {
                    this.loadedFromNetwork = true;
                    this.setEvents(posts);
                }
            });
    }

    toggle(index: number): void {
        this.active.update(active => (active === index ? null : index));
    }

    /** Events with a publication date in the future are hidden; the rest newest first. */
    private setEvents(events: EventPost[]): void {
        const now = Date.now();
        this.events.set(
            events
                .filter(event => {
                    const publication = event.data?.date_of_publication;
                    if (!publication) return false;
                    return new Date(publication).getTime() < now;
                })
                .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
        );
    }
}
