import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HeadingData } from '../../models/row.model';

@Component({
    selector: 'app-heading',
    templateUrl: './heading.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Heading {
    readonly component = input.required<HeadingData>();
}
