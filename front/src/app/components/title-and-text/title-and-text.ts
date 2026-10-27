import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ParagraphClass, TitleAndTextData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { HtmlDirective } from '../../shared/html.directive';

type ParagraphKind = 'quote' | 'lead' | 'bold' | 'plain';

@Component({
    selector: 'app-title-and-text',
    templateUrl: './title-and-text.html',
    // CMS HTML in <p [appHtml]>: if an editor puts a block element in it (<p>, <div>,
    // <ul>), the browser rearranges the server-sent DOM and hydration breaks. So the
    // component re-renders in the browser; the content is in the HTML for robots anyway.
    host: { ngSkipHydration: 'true' },
    imports: [TrustedPipe, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TitleAndText {
    readonly component = input.required<TitleAndTextData>();

    /** `paragraph_class` holds a choice in variant C and a CSS class on older pages. */
    kind(value: ParagraphClass | undefined): ParagraphKind {
        switch ((value ?? '').trim()) {
            case 'cytat':
                return 'quote';
            case 'wstęp':
                return 'lead';
            case 'pogrubiony':
            case 'fw-bold':
                return 'bold';
            default:
                return 'plain';
        }
    }
}
