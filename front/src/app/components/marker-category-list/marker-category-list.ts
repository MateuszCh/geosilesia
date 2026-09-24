import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MarkerCategoryListData } from '../../models/row.model';

@Component({
    selector: 'app-marker-category-list',
    templateUrl: './marker-category-list.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarkerCategoryList {
    readonly component = input.required<MarkerCategoryListData>();
}
