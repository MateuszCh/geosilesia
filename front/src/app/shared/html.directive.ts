import { Directive, ElementRef, OnChanges, Renderer2, SecurityContext, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * [innerHTML] for CMS HTML that keeps the server-rendered nodes during hydration.
 *
 * Hydration writes every property binding once more, and for innerHTML that throws the
 * nodes from the server away and paints new ones. Once the web font has loaded, the new
 * text is a little larger, so it counts as a new largest contentful paint: the TOP 50 lead
 * moved LCP from 0.4 s to the moment the JS ran (~7–10 s on a slow phone connection).
 * The first value is therefore not written when the element already holds the server's
 * content; later values are.
 *
 * Sanitizes exactly like [innerHTML]: a plain string is cleaned, a value from the
 * `trusted` pipe passes untouched.
 *
 * The element must accept any HTML (a div). In a <p> or <li> the browser rearranges block
 * content while parsing the page and hydration breaks – such a component still needs
 * ngSkipHydration (see TitleAndText).
 */
@Directive({ selector: '[appHtml]' })
export class HtmlDirective implements OnChanges {
    /** Whatever [innerHTML] takes – a string, or SafeHtml from the `trusted` pipe. */
    readonly appHtml = input<unknown>();

    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly renderer = inject(Renderer2);
    private readonly sanitizer = inject(DomSanitizer);
    private first = true;

    ngOnChanges(): void {
        const fromServer = this.first && this.element.hasChildNodes();
        this.first = false;
        if (fromServer) return;
        const value = (this.appHtml() ?? '') as SafeHtml | string;
        const html = this.sanitizer.sanitize(SecurityContext.HTML, value) ?? '';
        this.renderer.setProperty(this.element, 'innerHTML', html);
    }
}
