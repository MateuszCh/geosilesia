import { AfterViewInit, Directive, ElementRef, Input, inject } from '@angular/core';

/**
 * Port of the image-loaded directive: adds a class to the container only once the image
 * inside has loaded (the slide-in animation of gallery tiles). Unlike the original it also
 * handles an image that is already loaded – when returning to a page from the cache the
 * `load` event fired before the listener was attached and the tile stayed invisible.
 */
@Directive({ selector: '[appImageLoaded]' })
export class ImageLoadedDirective implements AfterViewInit {
    @Input('appImageLoaded') loadClass = '';

    private readonly host: HTMLElement = inject(ElementRef).nativeElement;

    ngAfterViewInit(): void {
        if (!this.loadClass) return;
        const image = this.host.querySelector('img');
        if (!image) return;

        if (image.complete) {
            this.host.classList.add(this.loadClass);
            return;
        }
        image.addEventListener(
            'load',
            () => this.host.classList.add(this.loadClass),
            { once: true }
        );
    }
}
