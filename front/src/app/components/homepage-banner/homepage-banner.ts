import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { HomepageBannerData } from '../../models/row.model';
import { ScrollService } from '../../core/scroll.service';
import { Carousel } from '../carousel/carousel';

@Component({
    selector: 'app-homepage-banner',
    templateUrl: './homepage-banner.html',
    imports: [Carousel],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomepageBanner {
    readonly component = input.required<HomepageBannerData>();

    private readonly scroll = inject(ScrollService);

    /** Clicking the heading scrolls down to the first section below the banner. */
    scrollToFirstSection(): void {
        this.scroll.scrollToId('section-1');
    }
}
