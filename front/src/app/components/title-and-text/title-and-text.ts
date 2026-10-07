import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TitleAndTextData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';

@Component({
    selector: 'app-title-and-text',
    templateUrl: './title-and-text.html',
    // CMS HTML in <p [innerHTML]>: if an editor puts a block element in it (<p>, <div>,
    // <ul>), the browser rearranges the server-sent DOM and hydration breaks. So the
    // component re-renders in the browser; the content is in the HTML for robots anyway.
    host: { ngSkipHydration: 'true' },
    imports: [TrustedPipe],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TitleAndText {
    readonly component = input.required<TitleAndTextData>();
}
