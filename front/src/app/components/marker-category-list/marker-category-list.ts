import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MarkerCategoryListData } from '../../models/row.model';

@Component({
    selector: 'app-marker-category-list',
    templateUrl: './marker-category-list.html',
    // CMS HTML in <p [innerHTML]>: if an editor puts a block element in it (<p>, <div>,
    // <ul>), the browser rearranges the server-sent DOM and hydration breaks. So the
    // component re-renders in the browser; the content is in the HTML for robots anyway.
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarkerCategoryList {
    readonly component = input.required<MarkerCategoryListData>();
}
