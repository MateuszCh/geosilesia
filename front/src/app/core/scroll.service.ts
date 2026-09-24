import { DOCUMENT, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Zastępuje bibliotekę angular-scroll (duScroll), która istniała tylko dla AngularJS.
 * Płynne przewijanie robi dziś sama przeglądarka, więc cała zależność sprowadza się
 * do kilku wywołań scrollIntoView.
 */
@Injectable({ providedIn: 'root' })
export class ScrollService {
    private readonly doc = inject(DOCUMENT);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    scrollToTop(smooth = true): void {
        if (!this.isBrowser) return;
        this.doc.defaultView?.scrollTo({
            top: 0,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }

    scrollToElement(element: Element | null | undefined): void {
        if (!this.isBrowser || !element) return;
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    scrollToId(id: string): void {
        this.scrollToElement(this.doc.getElementById(id));
    }
}
