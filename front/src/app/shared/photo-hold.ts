import {
    Directive,
    DOCUMENT,
    Injectable,
    PLATFORM_ID,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { srcsetOf } from './srcset';

/**
 * Holds back the photos below a page's photo hero until the page has loaded.
 *
 * `loading="lazy"` does not keep them out of the first seconds: on a phone connection
 * Chrome fetches lazy images up to ~1250–2500 px below the screen, so the TOP 50 preview
 * and the link cards (~600 kB on the home page) downloaded together with the hero photo,
 * the page's largest contentful paint, and took most of its bandwidth.
 *
 * A held photo carries its address in data-held-src / data-held-srcset instead of
 * src / srcset, also in the server's HTML. On the window's load event – the hero has
 * downloaded by then – every held photo in the document gets its src back, including the
 * ones in rows that are not hydrated yet (row.html), which Angular would not update.
 * A photo shown after load (another page opened in the app) is never held.
 *
 * Without JavaScript held photos stay empty.
 */
@Injectable({ providedIn: 'root' })
export class PhotoHold {
    private readonly requested = signal(false);
    private readonly loaded = signal(false);

    /** Photos marked with appPhoto (and in CMS HTML) are held now. */
    readonly held = computed(() => this.requested() && !this.loaded());

    constructor() {
        if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
        const doc = inject(DOCUMENT);
        const release = () => {
            for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img[data-held-src]'))) {
                // srcset first: the browser picks the candidate once the task ends.
                const srcset = img.getAttribute('data-held-srcset');
                if (srcset) img.setAttribute('srcset', srcset);
                img.setAttribute('src', img.getAttribute('data-held-src') ?? '');
                img.removeAttribute('data-held-src');
                img.removeAttribute('data-held-srcset');
            }
            this.loaded.set(true);
        };
        if (doc.readyState === 'complete') release();
        else doc.defaultView?.addEventListener('load', release, { once: true });
    }

    /** Called by a photo hero (the page's LCP): photos rendered from now on wait for load. */
    holdUntilLoad(): void {
        if (!this.loaded()) this.requested.set(true);
    }
}

/**
 * `<img loading="lazy" [appPhoto]="url" sizes="…">` – a CMS photo below the fold: src plus
 * the srcset of resized copies, held back while PhotoHold says so.
 */
@Directive({
    selector: 'img[appPhoto]',
    host: {
        '[attr.src]': 'hold.held() ? null : appPhoto()',
        '[attr.srcset]': 'hold.held() ? null : srcset()',
        '[attr.data-held-src]': 'hold.held() ? appPhoto() : null',
        '[attr.data-held-srcset]': 'hold.held() ? srcset() : null'
    }
})
export class PhotoDirective {
    readonly appPhoto = input<string | null | undefined>();
    protected readonly hold = inject(PhotoHold);
    protected readonly srcset = computed(() => srcsetOf(this.appPhoto()));
}
