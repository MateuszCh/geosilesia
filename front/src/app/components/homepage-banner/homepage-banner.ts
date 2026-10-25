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

const pad = (value: number) => String(value).padStart(2, '0');

/** Mostly upper-case text, as older banner titles were typed for the old design. */
function isShouting(text: string): boolean {
    const letters = text.replace(/[^\p{L}]/gu, '');
    const upper = letters.replace(/[^\p{Lu}]/gu, '');
    return letters.length >= 4 && upper.length / letters.length > 0.8;
}

/**
 * The home page hero: photographs from the banner, the site title on a forest panel and a
 * white caption card with the slide counter and arrows. Text never sits on the photo.
 */
@Component({
    selector: 'app-homepage-banner',
    templateUrl: './homepage-banner.html',
    imports: [SwipeDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomepageBanner {
    readonly component = input.required<HomepageBannerData>();

    readonly current = signal(0);
    readonly slides = computed<Slide[]>(() => (this.component().slides ?? []).filter(slide => slide.image));

    /** Variant C sets the title in sentence case; an all-caps title from the CMS is lowered. */
    readonly title = computed(() => {
        const title = this.component().title ?? '';
        if (!isShouting(title)) return title;
        const lower = title.toLocaleLowerCase('pl');
        return lower.charAt(0).toLocaleUpperCase('pl') + lower.slice(1);
    });

    readonly counter = computed(() => `${pad(this.current() + 1)} / ${pad(this.slides().length)}`);

    readonly meta = computed(() => {
        const slide = this.slides()[this.current()];
        const author = slide?.author ? (/^(fot|il)\./i.test(slide.author) ? slide.author : `Fot. ${slide.author}`) : '';
        return [slide?.place, slide?.text_english, author].filter(Boolean).join(' · ');
    });

    private timer: ReturnType<typeof setInterval> | undefined;
    private paused = false;
    private reducedMotion = false;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.stop());
        // Only in the browser – on the server the timer would just tick until the app is
        // destroyed. Autoplay is off for people who asked for reduced motion.
        afterNextRender(() => {
            this.reducedMotion = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            this.start();
        });
    }

    next(): void {
        const count = this.slides().length;
        if (count) this.current.update(index => (index + 1) % count);
        this.restart();
    }

    prev(): void {
        const count = this.slides().length;
        if (count) this.current.update(index => (index - 1 + count) % count);
        this.restart();
    }

    pause(): void {
        this.paused = true;
        this.stop();
    }

    resume(): void {
        this.paused = false;
        this.start();
    }

    /** Slide framing set by the editor in the CMS; no value = centre. */
    objectPosition(slide: Slide): string | null {
        if (!slide.left_position && !slide.top_position) return null;
        const x = slide.left_position ? `${slide.left_position}%` : 'center';
        const y = slide.top_position ? `${slide.top_position}%` : 'center';
        return `${x} ${y}`;
    }

    private start(): void {
        this.stop();
        const seconds = Number.parseInt(String(this.component().interval ?? ''), 10);
        if (this.paused || this.reducedMotion || this.slides().length < 2 || !seconds) return;
        this.timer = setInterval(() => {
            const count = this.slides().length;
            this.current.update(index => (index + 1) % count);
        }, seconds * 1000);
    }

    private restart(): void {
        if (this.timer !== undefined) this.start();
    }

    private stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }
}
