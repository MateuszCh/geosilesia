import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { LiteratureData } from '../../models/row.model';

/** Lists longer than this are shown shortened, with a button for the rest. */
const COLLAPSE_ABOVE = 10;

@Component({
    selector: 'app-literature',
    templateUrl: './literature.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Literature {
    readonly component = input.required<LiteratureData>();
    readonly expanded = signal(false);
    protected readonly collapsedCount = 5;

    readonly items = computed(() => (this.component().items ?? []).filter(item => item.author || item.item));
    readonly collapsible = computed(() => this.items().length > COLLAPSE_ABOVE);

    positionsLabel(count: number): string {
        const last = count % 10;
        const lastTwo = count % 100;
        return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'pozycje' : 'pozycji';
    }
}
