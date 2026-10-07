import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    OnInit,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { GalleryData, GalleryImage } from '../../models/row.model';
import { ImageLoadedDirective } from '../../shared/image-loaded.directive';
import { SwipeDirective } from '../../shared/swipe.directive';

/** Must match the preview transition duration in _full-screen-mode.scss. */
const SLIDE_MS = 100;
const CLOSE_MS = 500;

@Component({
    selector: 'app-gallery',
    templateUrl: './gallery.html',
    // CMS HTML in <p [innerHTML]>: if an editor puts a block element in it (<p>, <div>,
    // <ul>), the browser rearranges the server-sent DOM and hydration breaks. So the
    // component re-renders in the browser; the content is in the HTML for robots anyway.
    host: { ngSkipHydration: 'true' },
    imports: [ImageLoadedDirective, SwipeDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Gallery implements OnInit {
    readonly component = input.required<GalleryData>();

    /** Order from the CMS; the same order applies to thumbnails and the preview. */
    readonly images = computed<GalleryImage[]>(() =>
        [...(this.component().catalogue ?? [])].sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0)
        )
    );

    readonly visible = signal(false);
    readonly currentImage = signal<number | undefined>(undefined);
    readonly nextImage = signal<number | undefined>(undefined);
    readonly prevImage = signal<number | undefined>(undefined);
    /** Transition direction – decides from which side the next photo slides in. */
    readonly back = signal(false);
    /** Disables the animation while the starting position is being set. */
    readonly noMove = signal(false);

    private readonly doc = inject(DOCUMENT);
    private readonly destroyRef = inject(DestroyRef);
    private timers: ReturnType<typeof setTimeout>[] = [];

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.defaultPrevented) return;
        switch (event.key) {
            case 'ArrowLeft':
                this.prev();
                break;
            case 'ArrowRight':
                this.next();
                break;
            case 'Escape':
                this.close();
                break;
            default:
        }
    };

    ngOnInit(): void {
        this.destroyRef.onDestroy(() => {
            this.doc.defaultView?.removeEventListener('keydown', this.onKeyDown);
            this.timers.forEach(clearTimeout);
            // Leaving the page with the preview open must not leave scrolling locked
            // on <body>.
            this.doc.body.classList.remove('closedScroll');
        });
    }

    private get count(): number {
        return this.images().length;
    }

    private later(fn: () => void, ms: number): void {
        this.timers.push(setTimeout(fn, ms));
    }

    openFullMode(index: number): void {
        this.doc.defaultView?.addEventListener('keydown', this.onKeyDown);
        this.noMove.set(true);
        this.currentImage.set(index);
        this.nextImage.set(index + 1);
        this.prevImage.set(index - 1);
        this.visible.set(true);
        this.doc.body.classList.add('closedScroll');
    }

    close(): void {
        this.doc.defaultView?.removeEventListener('keydown', this.onKeyDown);
        this.doc.body.classList.remove('closedScroll');
        this.visible.set(false);
        // Indexes are cleared only after the preview fades out – otherwise the photo
        // would disappear during the closing animation.
        this.later(() => {
            this.currentImage.set(undefined);
            this.nextImage.set(undefined);
            this.prevImage.set(undefined);
        }, CLOSE_MS);
    }

    next(): void {
        this.back.set(false);
        this.later(() => {
            this.noMove.set(false);
            const current = this.currentImage() ?? 0;
            if (current + 1 === this.count) {
                this.setIndexes(0);
            } else {
                this.setIndexes(current + 1);
            }
        }, SLIDE_MS);
    }

    prev(): void {
        this.back.set(true);
        this.noMove.set(true);
        this.later(() => {
            this.noMove.set(false);
            const current = this.currentImage() ?? 0;
            this.setIndexes(current === 0 ? this.count - 1 : current - 1);
        }, SLIDE_MS);
    }

    /** Neighbours wrap around at the ends so browsing goes round in a loop. */
    private setIndexes(current: number): void {
        this.currentImage.set(current);
        this.nextImage.set((current + 1) % this.count);
        this.prevImage.set((current - 1 + this.count) % this.count);
    }
}
