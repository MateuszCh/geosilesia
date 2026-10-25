import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HeadingData } from '../../models/row.model';

/**
 * A heading inside the content. The page title is drawn by the page header, so an h1 row
 * that is not the first row is demoted to h2 – a page has one h1.
 */
@Component({
    selector: 'app-heading',
    templateUrl: './heading.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Heading {
    readonly component = input.required<HeadingData>();

    readonly headingClass = computed(() => {
        const base = this.component().type === 'h1' || this.component().type === 'h2' ? 'h-article' : 'h-sub';
        const small = /^h[4-6]$/.test(this.component().type ?? '') ? ' h-sub--small' : '';
        return `${base}${small} ${this.component().class ?? ''}`.trim();
    });
}
