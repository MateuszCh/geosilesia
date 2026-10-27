import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { colorByName } from '../../core/categories';
import { internalLink, isExternalLink } from '../../core/cms-link';
import { ContentService } from '../../core/content.service';
import { LinkCardsData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { plural } from '../../shared/plural';
import { HtmlDirective } from '../../shared/html.directive';

/**
 * How a side list is drawn, as in the mockups: several places in a box ("Zobacz w terenie"),
 * one place with a photo as a figure (Geoparki), one link without a photo as a forest card
 * (the map on Geostanowiska, TOP 50 on Skarby natury).
 */
export type SideForm = 'list' | 'figure' | 'card';

/** Cards leading to other pages: "Poznaj region" on the home page, "Zobacz w terenie" beside articles. */
@Component({
    selector: 'app-link-cards',
    templateUrl: './link-cards.html',
    imports: [NgTemplateOutlet, RouterLink, TrustedPipe, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LinkCards implements OnInit {
    readonly component = input.required<LinkCardsData>();

    readonly side = computed(() => this.component().variant === 'lista boczna');

    readonly cards = computed(() =>
        (this.component().items ?? [])
            .filter(item => item.title && item.link)
            .map(item => {
                const internal = !isExternalLink(item.link);
                // An internal link may carry a query ("/mapa-atrakcji?kategoria=…"); the router
                // needs it apart from the path.
                const [path, query = ''] = (internal ? internalLink(item.link)! : item.link!).split('?');
                const params: Record<string, string> = internal ? Object.fromEntries(new URLSearchParams(query)) : {};
                return {
                    title: item.title!,
                    description: item.description,
                    image: item.image || undefined,
                    href: internal ? path : item.link!,
                    params,
                    internal,
                    color: colorByName(item.color) ?? 'var(--trail-red)'
                };
            })
    );

    readonly form = computed<SideForm>(() => {
        const cards = this.cards();
        if (cards.length !== 1) return 'list';
        return cards[0].image ? 'figure' : 'card';
    });

    /** A forest card leading to a map category shows how many places it holds. */
    private readonly mapCount = signal<number | undefined>(undefined);
    readonly cardTitle = computed(() => {
        const count = this.mapCount();
        if (count !== undefined) return `${count} ${plural(count, 'miejsce', 'miejsca', 'miejsc')} na mapie`;
        return this.cards()[0]?.description || this.cards()[0]?.title;
    });

    private readonly content = inject(ContentService);
    private readonly destroyRef = inject(DestroyRef);

    ngOnInit(): void {
        const category = this.side() && this.form() === 'card' ? this.cards()[0].params['kategoria'] : undefined;
        if (!category) return;
        this.content
            .markerCountsByCategory()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(counts => {
                if (counts[category]) this.mapCount.set(counts[category]);
            });
    }
}
