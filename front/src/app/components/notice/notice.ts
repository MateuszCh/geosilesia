import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NoticeData } from '../../models/row.model';
import { HtmlDirective } from '../../shared/html.directive';

/** A framed note: the citation pattern, a warning or a piece of information. */
@Component({
    selector: 'app-notice',
    templateUrl: './notice.html',
    imports: [HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Notice {
    readonly component = input.required<NoticeData>();

    readonly variant = computed(() => (this.component().variant ?? 'uwaga').trim());
}
