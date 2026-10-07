import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FootnotesData } from '../../models/row.model';

@Component({
    selector: 'app-footnotes',
    templateUrl: './footnotes.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Footnotes {
    readonly component = input.required<FootnotesData>();
}
