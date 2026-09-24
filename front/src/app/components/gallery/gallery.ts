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

/** Musi zgadzać się z czasem przejścia podglądu w _full-screen-mode.scss. */
const SLIDE_MS = 100;
const CLOSE_MS = 500;

@Component({
    selector: 'app-gallery',
    templateUrl: './gallery.html',
    imports: [ImageLoadedDirective, SwipeDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Gallery implements OnInit {
    readonly component = input.required<GalleryData>();

    /** Kolejność z CMS-a; ten sam porządek obowiązuje w miniaturach i w podglądzie. */
    readonly images = computed<GalleryImage[]>(() =>
        [...(this.component().catalogue ?? [])].sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0)
        )
    );

    readonly visible = signal(false);
    readonly currentImage = signal<number | undefined>(undefined);
    readonly nextImage = signal<number | undefined>(undefined);
    readonly prevImage = signal<number | undefined>(undefined);
    /** Kierunek przejścia – decyduje, z której strony wjeżdża kolejne zdjęcie. */
    readonly back = signal(false);
    /** Blokuje animację na czas ustawiania pozycji startowej. */
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
            // Wyjście ze strony przy otwartym podglądzie nie może zostawić
            // zablokowanego przewijania na <body>.
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
        // Indeksy czyścimy dopiero po wygaszeniu podglądu – wcześniej zdjęcie
        // zniknęłoby w trakcie animacji zamykania.
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

    /** Sąsiedzi zawijają się na końcach, żeby przewijanie było w kółko. */
    private setIndexes(current: number): void {
        this.currentImage.set(current);
        this.nextImage.set((current + 1) % this.count);
        this.prevImage.set((current - 1 + this.count) % this.count);
    }
}
