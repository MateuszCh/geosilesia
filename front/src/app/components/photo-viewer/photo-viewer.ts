import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    afterNextRender,
    computed,
    inject,
    input,
    model,
    output
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

    private readonly doc = inject(DOCUMENT);

    constructor() {
        const returnFocus = this.doc.activeElement as HTMLElement | null;
        this.doc.body.classList.add('closedScroll');
        afterNextRender(() => this.doc.querySelector<HTMLElement>('.lightbox__close')?.focus());
        inject(DestroyRef).onDestroy(() => {
            this.doc.body.classList.remove('closedScroll');
            returnFocus?.focus();
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
