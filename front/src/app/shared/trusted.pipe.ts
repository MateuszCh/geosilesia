import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Odpowiednik filtra `trusted` ($sce.trustAsHtml). Używany tam, gdzie redaktor wpisuje
 * w CMS-ie własny HTML i ma on przejść nietknięty – w pozostałych miejscach zwykły
 * [innerHTML] wystarcza, bo Angular sanityzuje go sam (dawniej robił to ngSanitize).
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
