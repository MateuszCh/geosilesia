import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { LiteratureData } from '../../models/row.model';
import { plural } from '../../shared/plural';

/** Lists longer than this are shown shortened, with a button for the rest – as in the mockups. */
const COLLAPSE_ABOVE = 4;

const collator = new Intl.Collator('pl', { sensitivity: 'base', numeric: true });
const sortKey = (item: { author?: string; item?: string }): string =>
    `${item.author ?? ''} ${item.item ?? ''}`.trim();

@Component({
    selector: 'app-literature',
    templateUrl: './literature.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Literature {
    readonly component = input.required<LiteratureData>();
    /** The page's author and dates, at the bottom of the box, as in the mockup of the dictionary. */
    readonly byline = input('');
    readonly expanded = signal(false);
    protected readonly collapsedCount = 3;

    /** Alphabetical by author, then by the rest of the entry (Polish collation). */
    readonly items = computed(() =>
        (this.component().items ?? [])
            .filter(item => item.author || item.item)
            .sort((a, b) => collator.compare(sortKey(a), sortKey(b)))
    );
    readonly collapsible = computed(() => this.items().length > COLLAPSE_ABOVE);

    positionsLabel(count: number): string {
        return plural(count, 'pozycja', 'pozycje', 'pozycji');
    }
}
