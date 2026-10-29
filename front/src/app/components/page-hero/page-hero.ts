import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Crumb, SectionLinks } from '../../core/navigation.service';
import { Byline, PageHeader } from '../../core/page-layout';
import { internalLink } from '../../core/cms-link';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { photoCredit } from '../../shared/photo-credit';
import { SectionBar } from '../section-bar/section-bar';
import { DictionarySearch } from '../dictionary/dictionary-search';
import { RowView } from '../row/row';
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
 * on a forest panel (text never sits directly on the photo), a light band, a dark band or a
 * plain title. Each form holds what the page's values put in the header: the section menu,
 * the "W nagłówku" component (the figures of Geoparki), the dictionary's search, the button
 * by the title and the byline.
 */
@Component({
    selector: 'app-page-hero',
    templateUrl: './page-hero.html',
    imports: [NgTemplateOutlet, RouterLink, TrustedPipe, SectionBar, DictionarySearch, RowView, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageHero {
    readonly header = input.required<PageHeader>();
    readonly crumbs = input<Crumb[]>([]);
    /** The author and dates, when the page puts them in the header. */
    readonly byline = input<Byline | undefined>();
    /** "Menu działu" in the header: the section's pages above the title. */
    readonly section = input<SectionLinks | undefined>();
    /** Two-way: the dictionary's search query, when the header holds its field. */
    readonly query = model('');

    readonly hero = computed(() => this.header().data);

    /** Under the photo, beside the lead: "W nagłówku", the search or the button. */
    readonly hasExtras = computed(() => {
        const { component, searchCount, action } = this.header();
        return !!component || searchCount !== undefined || !!action;
    });

    readonly caption = computed(() => {
        const { image_caption: caption, image_author: author } = this.hero();
        const text = caption ? (/^na zdjęciu/i.test(caption) ? caption : `Na zdjęciu: ${caption}`) : '';
        return [text, photoCredit(author)].filter(Boolean).join(' · ');
    });

    readonly bylineText = computed(() => bylineText(this.byline()));

    /** The action link may carry a query ("/mapa-atrakcji?top50=1"); the router needs it apart. */
    readonly action = computed(() => {
        const action = this.header().action;
        const link = internalLink(action?.link);
        if (!action || !link) return undefined;
        const [path, query = ''] = link.split('?');
        return { label: action.label, path, params: Object.fromEntries(new URLSearchParams(query)) };
    });
}
