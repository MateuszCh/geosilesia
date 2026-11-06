import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NumberedListData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { photoCredit } from '../../shared/photo-credit';
import { HtmlDirective } from '../../shared/html.directive';

/** "Skarby natury": numbered places that open in place, with an "A ponadto" side list. */
@Component({
    selector: 'app-numbered-list',
    templateUrl: './numbered-list.html',
    imports: [TrustedPipe, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NumberedList {
    readonly component = input.required<NumberedListData>();
    /** The first place starts open. */
    readonly open = signal<number | undefined>(0);
    /** Items without titles are plain numbered points ("Co warto wiedzieć"), not places to open. */
    readonly points = computed(() => {
        const items = this.component().items ?? [];
        return items.length > 0 && items.every(item => !item.title && item.text);
    });

    protected readonly photoCredit = photoCredit;

    protected readonly colors = [
        'var(--trail-red)',
        'var(--trail-blue)',
        'var(--trail-green)',
        'var(--trail-yellow)',
        'var(--trail-black)'
    ];

    toggle(index: number): void {
        this.open.update(open => (open === index ? undefined : index));
    }
}
