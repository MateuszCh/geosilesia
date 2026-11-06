import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * The search field of the dictionary. It stands above the terms, or – when the page's
 * light header band holds it, as in the mockup – in the header beside the title.
 */
@Component({
    selector: 'app-dictionary-search',
    templateUrl: './dictionary-search.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DictionarySearch {
    readonly count = input(0);
    readonly query = model('');

    entriesLabel(count: number): string {
        return count === 1 ? 'haśle' : 'hasłach';
    }
}
