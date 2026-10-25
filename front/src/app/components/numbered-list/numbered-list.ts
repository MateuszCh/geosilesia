import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { NumberedListData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { photoCredit } from '../../shared/photo-credit';

/** "Skarby natury": numbered places that open in place, with an "A ponadto" side list. */
@Component({
    selector: 'app-numbered-list',
    templateUrl: './numbered-list.html',
    imports: [TrustedPipe],
    // Descriptions are CMS HTML in [innerHTML] – see TitleAndText.
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NumberedList {
    readonly component = input.required<NumberedListData>();
    /** The first place starts open. */
    readonly open = signal<number | undefined>(0);

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
