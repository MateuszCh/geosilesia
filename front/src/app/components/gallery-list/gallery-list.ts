import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { internalLink, isExternalLink } from '../../core/cms-link';
import { GalleryListData } from '../../models/row.model';
import { ImageLoadedDirective } from '../../shared/image-loaded.directive';

const ALL_CATEGORIES = 'wszystkie';
/** Must match `transition: transform 0.3s` on .photos__list__item. */
const COLLAPSE_MS = 300;

@Component({
    selector: 'app-gallery-list',
    templateUrl: './gallery-list.html',
    imports: [ImageLoadedDirective, NgTemplateOutlet, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GalleryList {
    readonly component = input.required<GalleryListData>();

    protected readonly internalLink = internalLink;
    protected readonly isExternalLink = isExternalLink;

    /**
     * Briefly `undefined` after a category change – nothing matches then, so all tiles
     * shrink to zero. Only after that animation ends is the new category set, and the
     * matching tiles slide back in.
     */
    readonly selectedCategory = signal<string | undefined>(ALL_CATEGORIES);

    readonly categories = computed(() => {
        const galleries = this.component().galleries ?? [];
        const unique = [
            ...new Set(
                galleries
                    .map(gallery => gallery.category)
                    .filter((category): category is string => !!category)
            )
        ];
        unique.push(ALL_CATEGORIES);
        return unique;
    });

    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    }

    matches(category: string | undefined): boolean {
        const selected = this.selectedCategory();
        return selected === ALL_CATEGORIES || selected === category;
    }

    /** Outside the collapse phase a filtered-out tile leaves the layout so it leaves no gap. */
    isHidden(category: string | undefined): boolean {
        return this.selectedCategory() !== undefined && !this.matches(category);
    }

    changeCategory(category: string): void {
        if (this.selectedCategory() === category) return;
        clearTimeout(this.timer);
        this.selectedCategory.set(undefined);
        this.timer = setTimeout(
            () => this.selectedCategory.set(category),
            COLLAPSE_MS
        );
    }
}
