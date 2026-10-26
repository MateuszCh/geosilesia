import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { colorByName } from '../../core/categories';
import { internalLink, isExternalLink } from '../../core/cms-link';
import { LinkCardsData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';

/** Cards leading to other pages: "Poznaj region" on the home page, "Zobacz w terenie" beside articles. */
@Component({
    selector: 'app-link-cards',
    templateUrl: './link-cards.html',
    imports: [NgTemplateOutlet, RouterLink, TrustedPipe],
    // The intro is CMS HTML in [innerHTML] – see TitleAndText.
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LinkCards {
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
                return {
                    title: item.title!,
                    description: item.description,
                    image: item.image || undefined,
                    href: internal ? path : item.link!,
                    params: internal ? Object.fromEntries(new URLSearchParams(query)) : {},
                    internal,
                    color: colorByName(item.color) ?? 'var(--trail-red)'
                };
            })
    );
}
