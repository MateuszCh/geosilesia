import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TimelineData } from '../../models/row.model';
import { HtmlDirective } from '../../shared/html.directive';

/** Milestones along the dashed red route; points in the region are filled. */
@Component({
    selector: 'app-timeline',
    templateUrl: './timeline.html',
    imports: [HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Timeline {
    readonly component = input.required<TimelineData>();

    readonly hasHighlights = computed(() => (this.component().items ?? []).some(item => item.highlight));
}
