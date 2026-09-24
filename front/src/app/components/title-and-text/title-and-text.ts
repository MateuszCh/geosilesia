import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TitleAndTextData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';

@Component({
    selector: 'app-title-and-text',
    templateUrl: './title-and-text.html',
    imports: [TrustedPipe],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TitleAndText {
    readonly component = input.required<TitleAndTextData>();
}
