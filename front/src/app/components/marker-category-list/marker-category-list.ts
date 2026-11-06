import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/content.service';
import { colorByName } from '../../core/categories';
import { pickPosts } from '../../core/post-refs';
import { IconPost, IconPostData } from '../../models/post.model';
import { MarkerCategoryListData } from '../../models/row.model';
import { HtmlDirective } from '../../shared/html.directive';

/**
 * Descriptions of the map categories. Each entry picks the category's `icon` post in the
 * CMS ("Kategoria") and takes its icon and colour from it – the colour as a band, as on
 * the home page cards. An entry without a category is shown with its text alone.
 */
@Component({
    selector: 'app-marker-category-list',
    templateUrl: './marker-category-list.html',
    imports: [HtmlDirective],
    // CMS HTML in <p [appHtml]>: if an editor puts a block element in it (<p>, <div>,
    // <ul>), the browser rearranges the server-sent DOM and hydration breaks. So the
    // component re-renders in the browser; the content is in the HTML for robots anyway.
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarkerCategoryList implements OnInit {
    readonly component = input.required<MarkerCategoryListData>();

    private readonly icons = signal<IconPost[]>([]);
    private readonly content = inject(ContentService);
    private readonly destroyRef = inject(DestroyRef);

    readonly items = computed(() =>
        (this.component().categories ?? []).map(entry => {
            // One category per entry: the field is a post field, so it could hold more.
            const [icon] = pickPosts(entry.category, this.icons());
            return { text: entry.text ?? '', icon: icon?.data?.icon || undefined, color: colorByName(icon?.data?.color) };
        })
    );

    ngOnInit(): void {
        this.content
            .posts<IconPostData>('icon')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(icons => this.icons.set(icons));
    }
}
