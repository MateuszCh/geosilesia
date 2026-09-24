import { AfterViewInit, Directive, ElementRef, Input, inject } from '@angular/core';

/**
 * Port dyrektywy image-loaded: dokłada klasę do kontenera dopiero, gdy obrazek w środku
 * się załaduje (animacja wjazdu kafelków w galeriach). W odróżnieniu od oryginału
 * obsługuje też obrazek już wczytany – przy powrocie na stronę z cache'u zdarzenie
 * `load` zdążyło paść przed podpięciem nasłuchu i kafelek zostawał niewidoczny.
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
