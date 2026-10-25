import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, map } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { MarkerPostData } from '../../models/post.model';
import { FactsAuto, FactsData } from '../../models/row.model';

/** What each "Licz automatycznie" choice counts. */
const COUNTERS: Record<FactsAuto, (content: ContentService) => Observable<number>> = {
    'obiekty na mapie': content =>
        content
            .posts<MarkerPostData>('marker')
            .pipe(map(posts => posts.filter(post => post.data?.lat && post.data?.long).length)),
    kategorie: content => content.posts('icon').pipe(map(posts => posts.length)),
    'TOP 50': content => content.posts('top50').pipe(map(posts => posts.length)),
    albumy: content => content.albums().pipe(map(albums => albums.filter(album => !album.hidden).length)),
    wydarzenia: content => content.posts('wydarzenie').pipe(map(posts => posts.length))
};

/** The stats strip: figures typed in the CMS or counted from the data. */
@Component({
    selector: 'app-facts',
    templateUrl: './facts.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Facts implements OnInit {
    readonly component = input.required<FactsData>();

    private readonly counts = signal<Partial<Record<FactsAuto, number>>>({});
    private readonly content = inject(ContentService);
    private readonly destroyRef = inject(DestroyRef);

    readonly items = computed(() =>
        (this.component().items ?? []).map(item => {
            const auto = item.auto as FactsAuto | undefined;
            const counted = auto ? this.counts()[auto] : undefined;
            return {
                label: item.label ?? '',
                value: item.value || (counted !== undefined ? counted.toLocaleString('pl-PL') : '…')
            };
        })
    );

    ngOnInit(): void {
        const wanted = new Set(
            (this.component().items ?? [])
                .filter(item => !item.value && item.auto && item.auto in COUNTERS)
                .map(item => item.auto as FactsAuto)
        );
        wanted.forEach(auto =>
            COUNTERS[auto](this.content)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(count => this.counts.update(counts => ({ ...counts, [auto]: count })))
        );
    }
}
