import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Crumb, SectionLinks } from '../../core/navigation.service';
import { Byline, PageHeader } from '../../core/page-layout';
import { internalLink } from '../../core/cms-link';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { photoCredit } from '../../shared/photo-credit';
import { Facts } from '../facts/facts';
import { SectionBar } from '../section-bar/section-bar';
import { HtmlDirective } from '../../shared/html.directive';

/** "Ryszard Chybiorz · 03.06.2026 · ostatnia aktualizacja 05.10.2026" */
export function bylineText(byline: Byline | undefined): string {
    if (!byline) return '';
    return [byline.author, byline.published, byline.updated ? `ostatnia aktualizacja ${byline.updated}` : '']
        .filter(Boolean)
        .join(' · ');
}

/**
 * Header of a content page, in one of the mockups' four forms: a photo band with the title
 * on a forest panel (text never sits directly on the photo), a light band with the
 * section's pages above the title, a dark band with the page's figures, or a plain title.
 */
@Component({
    selector: 'app-page-hero',
    templateUrl: './page-hero.html',
    imports: [NgTemplateOutlet, RouterLink, TrustedPipe, Facts, SectionBar, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageHero {
    readonly header = input.required<PageHeader>();
    readonly crumbs = input<Crumb[]>([]);
    readonly byline = input<Byline | undefined>();
    /** The section's pages – shown inside the light band only. */
    readonly section = input<SectionLinks | undefined>();

    readonly hero = computed(() => this.header().data);

    readonly caption = computed(() => {
        const { image_caption: caption, image_author: author } = this.hero();
        const text = caption ? (/^na zdjęciu/i.test(caption) ? caption : `Na zdjęciu: ${caption}`) : '';
        return [text, photoCredit(author)].filter(Boolean).join(' · ');
    });

    readonly bylineText = computed(() => (this.header().bylineBelow ? '' : bylineText(this.byline())));

    /** The action link may carry a query ("/mapa-atrakcji?top50=1"); the router needs it apart. */
    readonly action = computed(() => {
        const action = this.header().action;
        const link = internalLink(action?.link);
        if (!action || !link) return undefined;
        const [path, query = ''] = link.split('?');
        return { label: action.label, path, params: Object.fromEntries(new URLSearchParams(query)) };
    });
}
