import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    afterNextRender,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { HomepageBannerData, Slide } from '../../models/row.model';
import { SwipeDirective } from '../../shared/swipe.directive';

@Component({
    selector: 'app-carousel',
    templateUrl: './carousel.html',
    imports: [SwipeDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Carousel {
    readonly slides = input.required<Slide[]>();
    readonly custom = input.required<HomepageBannerData>();
    readonly interval = input<number | string | undefined>();

    /** Offset of the slide strip in percent; 0 is the first slide, -100 the second, etc. */
    readonly left = signal(0);
    readonly currentSlide = computed(() => -this.left() / 100);
    private readonly maxLeft = computed(() => (this.slides().length - 1) * -100);

    private timer: ReturnType<typeof setInterval> | undefined;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.cancelInt());
        // Only after rendering in the browser – on the server the timer would just keep
        // ticking in the background until the app is destroyed.
        afterNextRender(() => this.setInt());
    }

    next(): void {
        this.left.update(left => (left === this.maxLeft() ? 0 : left - 100));
    }

    prev(): void {
        this.left.update(left => (left !== 0 ? left + 100 : this.maxLeft()));
    }

    goTo(index: number): void {
        this.left.set(index * -100);
    }

    /** Swiping wraps around at the ends of the strip. */
    swipeTo(index: number): void {
        this.cancelInt();
        const count = this.slides().length;
        const target = index < 0 ? count - 1 : index >= count ? 0 : index;
        this.goTo(target);
        this.setInt();
    }

    setInt(): void {
        // Always after clearing the previous one: setInt() is also called on mouseleave of
        // the pagination, so without this several hovers would leave several parallel timers.
        this.cancelInt();
        const seconds = Number.parseInt(String(this.interval() ?? ''), 10);
        if (this.slides().length > 1 && seconds) {
            this.timer = setInterval(() => this.next(), seconds * 1000);
        }
    }

    cancelInt(): void {
        if (this.timer !== undefined) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /** Slide framing set by the editor in the CMS; no value = centre. */
    objectPosition(slide: Slide): string | null {
        if (!slide.left_position && !slide.top_position) return null;
        const x = slide.left_position ? `${slide.left_position}%` : 'center';
        const y = slide.top_position ? `${slide.top_position}%` : 'center';
        return `${x} ${y}`;
    }
}
