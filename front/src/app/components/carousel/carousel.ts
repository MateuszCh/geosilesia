import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
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
export class Carousel implements OnInit {
    readonly slides = input.required<Slide[]>();
    readonly custom = input.required<HomepageBannerData>();
    readonly interval = input<number | string | undefined>();

    /** Przesunięcie taśmy slajdów w procentach; 0 to pierwszy slajd, -100 drugi itd. */
    readonly left = signal(0);
    readonly currentSlide = computed(() => -this.left() / 100);
    private readonly maxLeft = computed(() => (this.slides().length - 1) * -100);

    private timer: ReturnType<typeof setInterval> | undefined;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.cancelInt());
    }

    ngOnInit(): void {
        this.setInt();
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

    /** Przewinięcie gestem zawija się na końcach taśmy. */
    swipeTo(index: number): void {
        this.cancelInt();
        const count = this.slides().length;
        const target = index < 0 ? count - 1 : index >= count ? 0 : index;
        this.goTo(target);
        this.setInt();
    }

    setInt(): void {
        // Zawsze po skasowaniu poprzedniego: setInt() woła też mouseleave na paginacji,
        // więc bez tego kilka najechań myszą zostawiłoby kilka równoległych liczników.
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

    /** Kadrowanie slajdu ustawiane przez redaktora w CMS-ie; brak wartości = środek. */
    objectPosition(slide: Slide): string | null {
        if (!slide.left_position && !slide.top_position) return null;
        const x = slide.left_position ? `${slide.left_position}%` : 'center';
        const y = slide.top_position ? `${slide.top_position}%` : 'center';
        return `${x} ${y}`;
    }
}
