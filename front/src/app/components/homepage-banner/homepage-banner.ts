import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    afterNextRender,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { HomepageBannerData, Slide } from '../../models/row.model';
import { SwipeDirective } from '../../shared/swipe.directive';
import { photoCredit } from '../../shared/photo-credit';

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

    /**
     * Slides whose photo may download. At first only the first one: it is the largest
     * element of the page (LCP), and the other six – stacked inside the viewport, so
     * loading="lazy" does not hold them back – would all download with it and take its
     * bandwidth. Once the page has loaded, the neighbours of the current slide join, and
     * so on as the carousel moves; a slide the user opens earlier loads on the spot.
     */
    private readonly loading = signal<ReadonlySet<number>>(new Set([0]));
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
        return [slide?.place, slide?.text_english, photoCredit(slide?.author)].filter(Boolean).join(' · ');
    });

    private timer: ReturnType<typeof setInterval> | undefined;
    private paused = false;
    private reducedMotion = false;
    private pageLoaded = false;

    constructor() {
        const destroyRef = inject(DestroyRef);
        const doc = inject(DOCUMENT);
        destroyRef.onDestroy(() => this.stop());
        // Only in the browser – on the server the timer would just tick until the app is
        // destroyed. Autoplay is off for people who asked for reduced motion, and waits for
        // the page to load, so that the next photo does not compete with the first one.
        afterNextRender(() => {
            this.reducedMotion = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            const onLoad = () => {
                this.pageLoaded = true;
                this.load(this.current());
                this.start();
            };
            if (doc.readyState === 'complete') {
                onLoad();
            } else {
                doc.defaultView?.addEventListener('load', onLoad, { once: true });
                destroyRef.onDestroy(() => doc.defaultView?.removeEventListener('load', onLoad));
            }
        });
    }

    loads(index: number): boolean {
        return this.loading().has(index);
    }

    next(): void {
        const count = this.slides().length;
        if (count) this.show((this.current() + 1) % count);
        this.restart();
    }

    prev(): void {
        const count = this.slides().length;
        if (count) this.show((this.current() - 1 + count) % count);
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
        if (!this.pageLoaded || this.paused || this.reducedMotion || this.slides().length < 2 || !seconds) return;
        this.timer = setInterval(() => this.show((this.current() + 1) % this.slides().length), seconds * 1000);
    }

    private show(index: number): void {
        this.current.set(index);
        this.load(index);
    }

    /** Lets the photo of slide `index` download – with its neighbours once the page has loaded. */
    private load(index: number): void {
        const count = this.slides().length;
        if (!count) return;
        const wanted = this.pageLoaded ? [index, (index + 1) % count, (index - 1 + count) % count] : [index];
        if (wanted.every(slide => this.loading().has(slide))) return;
        this.loading.update(loading => new Set([...loading, ...wanted]));
    }

    private restart(): void {
        if (this.timer !== undefined) this.start();
    }

    private stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }
}
