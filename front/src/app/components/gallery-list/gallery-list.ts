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
/** Musi zgadzać się z `transition: transform 0.3s` na .photos__list__item. */
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
     * Krótko po zmianie kategorii jest `undefined` – wtedy nic nie pasuje, więc wszystkie
     * kafelki zjeżdżają do zera. Dopiero po zakończeniu tej animacji ustawiamy nową
     * kategorię i pasujące kafelki wjeżdżają z powrotem.
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

    /** Poza fazą zwijania odfiltrowany kafelek znika z układu, żeby nie zostawiał dziury. */
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
