import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NoticeData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { HtmlDirective } from '../../shared/html.directive';

/** A framed note: the citation pattern, a warning or a piece of information. */
@Component({
    selector: 'app-notice',
    templateUrl: './notice.html',
    imports: [TrustedPipe, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Notice {
    readonly component = input.required<NoticeData>();

    readonly variant = computed(() => (this.component().variant ?? 'uwaga').trim());
}
