import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Equivalent of the `trusted` filter ($sce.trustAsHtml). Used where an editor enters their
 * own HTML in the CMS and it has to pass through untouched – elsewhere a plain [innerHTML]
 * is enough, because Angular sanitizes it by itself (ngSanitize used to do that).
 */
@Pipe({ name: 'trusted' })
export class TrustedPipe implements PipeTransform {
    private readonly sanitizer = inject(DomSanitizer);

    transform(html: unknown): SafeHtml | unknown {
        if (!html || typeof html !== 'string') {
            return html;
        }
        return this.sanitizer.bypassSecurityTrustHtml(html);
    }
}
