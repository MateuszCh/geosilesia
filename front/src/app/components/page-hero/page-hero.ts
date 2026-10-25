import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Crumb } from '../../core/navigation.service';
import { Byline } from '../../core/page-layout';
import { PageHeroData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { photoCredit } from '../../shared/photo-credit';

/**
 * Header of a content page: a photo band with the title on a forest panel, or – without a
 * photo – a plain title block. Text never sits directly on the photo.
 */
@Component({
    selector: 'app-page-hero',
    templateUrl: './page-hero.html',
    imports: [NgTemplateOutlet, RouterLink, TrustedPipe],
    // The lead is CMS HTML in [innerHTML] – see TitleAndText.
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageHero {
    readonly hero = input.required<PageHeroData>();
    readonly crumbs = input<Crumb[]>([]);
    readonly byline = input<Byline | undefined>();

    readonly caption = computed(() => {
        const { image_caption: caption, image_author: author } = this.hero();
        const text = caption ? (/^na zdjęciu/i.test(caption) ? caption : `Na zdjęciu: ${caption}`) : '';
        return [text, photoCredit(author)].filter(Boolean).join(' · ');
    });

    /** "Ryszard Chybiorz · 03.06.2026 · ostatnia aktualizacja 05.10.2026" */
    readonly bylineText = computed(() => {
        const byline = this.byline();
        if (!byline) return '';
        return [
            byline.author,
            byline.published,
            byline.updated ? `ostatnia aktualizacja ${byline.updated}` : ''
        ]
            .filter(Boolean)
            .join(' · ');
    });
}
