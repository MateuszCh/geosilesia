import { Directive, ElementRef, OnChanges, Renderer2, SecurityContext, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { withSrcset } from './srcset';
import { PhotoHold } from './photo-hold';

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
 * Sanitizes exactly like [innerHTML], on the server render too: CMS HTML loses scripts, event
 * handler attributes, iframes and `javascript:` links. Do not pass SafeHtml from
 * bypassSecurityTrustHtml here – the rendered HTML is cached and sent to every visitor, and
 * the site has no script-src CSP to stop what an editor's account (or anyone with database
 * access) puts into the text.
 *
 * Photos from /uploads get a srcset of resized copies (see srcset.ts); `appHtmlSizes` is
 * the width they take, by default the text column. Below a photo hero they wait for the
 * page's load event like appPhoto (PhotoHold).
 *
 * The element must accept any HTML (a div). In a <p> or <li> the browser rearranges block
 * content while parsing the page and hydration breaks – such a component still needs
 * ngSkipHydration (see TitleAndText).
 */
@Directive({ selector: '[appHtml]' })
export class HtmlDirective implements OnChanges {
    /** CMS HTML as a string; it is sanitized before it is written. */
    readonly appHtml = input<unknown>();
    /** `sizes` of the photos inside – the width of the text column by default. */
    readonly appHtmlSizes = input('(min-width: 1100px) 760px, 100vw');

    private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly renderer = inject(Renderer2);
    private readonly sanitizer = inject(DomSanitizer);
    private readonly hold = inject(PhotoHold);
    private first = true;

    ngOnChanges(): void {
        const fromServer = this.first && this.element.hasChildNodes();
        this.first = false;
        if (fromServer) return;
        const value = (this.appHtml() ?? '') as SafeHtml | string;
        // srcset is added after sanitizing: only our own attributes, on already clean tags.
        const html = withSrcset(this.sanitizer.sanitize(SecurityContext.HTML, value) ?? '', this.appHtmlSizes(), this.hold.mode());
        this.renderer.setProperty(this.element, 'innerHTML', html);
    }
}
