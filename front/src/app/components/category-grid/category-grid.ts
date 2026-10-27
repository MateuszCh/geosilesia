import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { NavigationService } from '../../core/navigation.service';
import { categoryLook } from '../../core/categories';
import { internalLink } from '../../core/cms-link';
import { IconPost, IconPostData } from '../../models/post.model';
import { CategoryGridData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { plural } from '../../shared/plural';
import { HtmlDirective } from '../../shared/html.directive';

/** "Co chcesz zobaczyć?": one card per map category, opening the map filtered by it. */
@Component({
    selector: 'app-category-grid',
    templateUrl: './category-grid.html',
    imports: [RouterLink, TrustedPipe, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryGrid implements OnInit {
    readonly component = input.required<CategoryGridData>();

    private readonly icons = signal<IconPost[]>([]);
    private readonly counts = signal(new Map<string, number>());
    private readonly content = inject(ContentService);
    private readonly navigation = inject(NavigationService);
    private readonly destroyRef = inject(DestroyRef);

    readonly mapLink = computed(() => internalLink(this.component().map_link) || this.navigation.cta().link);

    readonly categories = computed(() =>
        [...this.icons()]
            .filter(icon => icon.data?.category)
            .sort((a, b) => (Number(a.data.position) || 99) - (Number(b.data.position) || 99))
            .map(icon => {
                const count = this.counts().get(icon.data.category!) ?? 0;
                return {
                    key: icon.data.category!,
                    name: icon.data.name || icon.data.category!,
                    ...categoryLook(icon.data),
                    countLabel: `${count} ${plural(count, 'miejsce', 'miejsca', 'miejsc')}`
                };
            })
    );

    ngOnInit(): void {
        forkJoin({
            icons: this.content.posts<IconPostData>('icon'),
            counts: this.content.markerCountsByCategory()
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(({ icons, counts }) => {
                this.counts.set(new Map(Object.entries(counts)));
                this.icons.set(icons);
            });
    }
}
