import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { LiteratureData } from '../../models/row.model';
import { plural } from '../../shared/plural';

/** Lists longer than this are shown shortened, with a button for the rest – as in the mockups. */
const COLLAPSE_ABOVE = 4;

@Component({
    selector: 'app-literature',
    templateUrl: './literature.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Literature {
    readonly component = input.required<LiteratureData>();
    readonly expanded = signal(false);
    protected readonly collapsedCount = 3;

    readonly items = computed(() => (this.component().items ?? []).filter(item => item.author || item.item));
    readonly collapsible = computed(() => this.items().length > COLLAPSE_ABOVE);

    positionsLabel(count: number): string {
        return plural(count, 'pozycja', 'pozycje', 'pozycji');
    }
}
