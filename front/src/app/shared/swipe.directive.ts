import { Directive, ElementRef, inject, output } from '@angular/core';

// Thresholds copied from ngTouch: the gesture has to be clearly horizontal, otherwise
// ordinary scrolling with a finger would trigger a slide change.
const MIN_DISTANCE = 30;
const MAX_VERTICAL = 75;
const MAX_VERTICAL_RATIO = 0.3;

/**
 * Replaces ng-swipe-left / ng-swipe-right from the ngTouch module (carousel and gallery).
 * Pointer Events handle touch, mouse and pen with a single set of events.
 */
@Directive({
    selector: '[appSwipe]',
    host: {
        '(pointerdown)': 'onDown($event)',
        '(pointerup)': 'onUp($event)',
        '(pointercancel)': 'onCancel()'
    }
})
export class SwipeDirective {
    readonly swipeLeft = output<void>();
    readonly swipeRight = output<void>();

    private readonly element = inject(ElementRef<HTMLElement>).nativeElement;
    private startX = 0;
    private startY = 0;
    private tracking = false;

    protected onDown(event: PointerEvent): void {
        this.startX = event.clientX;
        this.startY = event.clientY;
        this.tracking = true;
    }

    protected onCancel(): void {
        this.tracking = false;
    }

    protected onUp(event: PointerEvent): void {
        if (!this.tracking) return;
        this.tracking = false;

        const deltaX = event.clientX - this.startX;
        const deltaY = event.clientY - this.startY;
        const distance = Math.abs(deltaX);

        if (
            distance < MIN_DISTANCE ||
            Math.abs(deltaY) > MAX_VERTICAL ||
            Math.abs(deltaY) / distance > MAX_VERTICAL_RATIO
        ) {
            return;
        }

        if (deltaX < 0) {
            this.swipeLeft.emit();
        } else {
            this.swipeRight.emit();
        }
    }
}
