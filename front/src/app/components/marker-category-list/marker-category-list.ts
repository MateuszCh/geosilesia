import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/content.service';
import { colorByName } from '../../core/categories';
import { IconPostData } from '../../models/post.model';
import { MarkerCategoryListData } from '../../models/row.model';

/**
 * Descriptions of the map categories. Each row entry picks an icon file in the CMS – the
 * same file as the category's `icon` post – so the entry is matched to its category by that
 * file and gets the category colour as a band, as on the home page cards. An icon that
 * belongs to no category is shown without one.
 */
@Component({
    selector: 'app-marker-category-list',
    templateUrl: './marker-category-list.html',
    // CMS HTML in <p [innerHTML]>: if an editor puts a block element in it (<p>, <div>,
    // <ul>), the browser rearranges the server-sent DOM and hydration breaks. So the
    // component re-renders in the browser; the content is in the HTML for robots anyway.
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarkerCategoryList implements OnInit {
    readonly component = input.required<MarkerCategoryListData>();

    /** Category colour by the category's icon file. */
    private readonly colors = signal(new Map<string, string>());
    private readonly content = inject(ContentService);
    private readonly destroyRef = inject(DestroyRef);

    readonly items = computed(() =>
        (this.component().categories ?? []).map(category => ({
            text: category.text ?? '',
            icon: category.icon,
            color: this.colors().get(iconKey(category.icon))
        }))
    );

    ngOnInit(): void {
        this.content
            .posts<IconPostData>('icon')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(icons =>
                this.colors.set(
                    new Map(
                        icons
                            .map(icon => [iconKey(icon.data?.icon), colorByName(icon.data?.color)] as const)
                            .filter((entry): entry is readonly [string, string] => !!entry[0] && !!entry[1])
                    )
                )
            );
    }
}

/** "uploads/x.png" and "/uploads/x.png" name the same file. */
function iconKey(src: string | undefined): string {
    const path = (src ?? '').trim();
    return path && !path.startsWith('/') ? `/${path}` : path;
}
