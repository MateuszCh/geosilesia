import { DOCUMENT, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Replaces the angular-scroll library (duScroll), which only existed for AngularJS.
 * Browsers do smooth scrolling natively today, so the whole dependency comes down to
 * a few scrollIntoView calls.
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
