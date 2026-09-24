import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DictionaryData } from '../../models/row.model';

@Component({
    selector: 'app-dictionary',
    templateUrl: './dictionary.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Dictionary {
    readonly component = input.required<DictionaryData>();
}
