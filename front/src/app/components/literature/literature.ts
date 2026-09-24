import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LiteratureData } from '../../models/row.model';

@Component({
    selector: 'app-literature',
    templateUrl: './literature.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Literature {
    readonly component = input.required<LiteratureData>();
}
