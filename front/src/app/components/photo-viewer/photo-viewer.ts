import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    ElementRef,
    afterNextRender,
    afterRenderEffect,
    computed,
    inject,
    input,
    model,
    output,
    signal,
    viewChild
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SwipeDirective } from '../../shared/swipe.directive';

export interface ViewerPhoto {
    src?: string;
    /** Short name, shown as the heading. */
    title?: string;
    /** Longer text under it. */
    description?: string;
    author?: string;
}

/**
 * Scrolls `element` to `left` with an ease-out and returns a function that stops it. Native
 * smooth scrolling stalls in Chrome when the scroll position is set while it runs, which the
 * looping thumbnail strip does on every step.
 */
function glide(element: HTMLElement, left: number, duration = 300): () => void {
    const from = element.scrollLeft;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
        const progress = Math.min(Math.max((now - start) / duration, 0), 1);
        element.scrollLeft = from + (left - from) * (1 - (1 - progress) ** 3);
        if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
}

/**
 * The dark photo viewer of albums and photo grids: the photo with arrows, a white
 * description panel and thumbnails. Arrow keys browse, Escape closes; focus moves into
 * the dialog and back to where it came from.
 */
@Component({
    selector: 'app-photo-viewer',
    templateUrl: './photo-viewer.html',
    imports: [RouterLink, SwipeDirective],
    host: { '(document:keydown)': 'onKeyDown($event)' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhotoViewer {
    readonly photos = input.required<ViewerPhoto[]>();
    readonly index = model.required<number>();
    readonly title = input('');
    readonly section = input('');
    readonly color = input('var(--trail-red)');
    readonly backLabel = input('Wróć do albumu');
    readonly moreLink = input<string | undefined>();
    readonly moreLabel = input('Wszystkie albumy');
    readonly closed = output<void>();

    readonly photo = computed<ViewerPhoto | undefined>(() => this.photos()[this.index()]);

    /** How many thumbnails the strip shows at once; measured in the browser. */
    private readonly thumbsInView = signal(Infinity);

    /** With two spare thumbnails on each side of the visible ones, the strip runs in a loop. */
    private readonly looping = computed(() => this.photos().length >= this.thumbsInView() + 4);

    /**
     * The CSS order of each thumbnail. In a loop the current photo sits in the middle with
     * the others wrapped around it, so the first photo follows the last one and the strip
     * never has to rewind to the other end.
     */
    readonly thumbOrders = computed(() => {
        if (!this.looping()) return [];
        const count = this.photos().length;
        const first = this.index() - Math.floor(count / 2);
        return this.photos().map((_, index) => (index - first + count) % count);
    });

    private readonly doc = inject(DOCUMENT);
    private readonly thumbs = viewChild<ElementRef<HTMLElement>>('thumbs');

    constructor() {
        const returnFocus = this.doc.activeElement as HTMLElement | null;
        this.doc.body.classList.add('closedScroll');
        afterNextRender(() => this.doc.querySelector<HTMLElement>('.lightbox__close')?.focus());
        inject(DestroyRef).onDestroy(() => {
            this.doc.body.classList.remove('closedScroll');
            returnFocus?.focus();
        });

        afterRenderEffect(onCleanup => {
            const strip = this.thumbs()?.nativeElement;
            if (!strip) return;
            const observer = new ResizeObserver(() => {
                const first = strip.children.item(0);
                const second = strip.children.item(1);
                if (!first || !second) return;
                const step = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
                this.thumbsInView.set(strip.clientWidth / step);
            });
            observer.observe(strip);
            onCleanup(() => observer.disconnect());
        });

        // Keep the current photo's thumbnail centred in the strip, whichever way the
        // photo changed (arrows, keys, swipe, a click on a thumbnail). A turn of the loop
        // moves the thumbnails, so the strip first follows the one it centred last time and
        // glides on from there. It jumps on opening and for visitors who reduce motion.
        let centred: { photo: number; left: number } | undefined;
        afterRenderEffect(onCleanup => {
            const strip = this.thumbs()?.nativeElement;
            const photo = this.index();
            this.thumbOrders();
            const thumb = strip?.children.item(photo);
            if (!strip || !thumb) return;
            const leftOf = (element: Element) =>
                element.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
            const previous = centred && strip.children.item(centred.photo);
            if (centred && previous) strip.scrollLeft += leftOf(previous) - centred.left;
            const left = leftOf(thumb);
            const target = left - (strip.clientWidth - thumb.clientWidth) / 2;
            const reducedMotion = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (centred && centred.photo !== photo && !reducedMotion) onCleanup(glide(strip, target));
            else strip.scrollLeft = target;
            centred = { photo, left };
        });
    }

    next(): void {
        const count = this.photos().length;
        this.index.update(index => (index + 1) % count);
    }

    prev(): void {
        const count = this.photos().length;
        this.index.update(index => (index - 1 + count) % count);
    }

    onKeyDown(event: KeyboardEvent): void {
        if (event.defaultPrevented) return;
        switch (event.key) {
            case 'ArrowLeft':
                this.prev();
                break;
            case 'ArrowRight':
                this.next();
                break;
            case 'Escape':
                this.closed.emit();
                break;
            default:
        }
    }
}
