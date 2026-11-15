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
 * src / srcset, also in the server's HTML. Once the hero photo has been painted – the
 * window's load event, then the browser's largest-contentful-paint entry for an image –
 * every held photo in the document gets its src back, including the ones in rows that are
 * not hydrated yet (row.html), which Angular would not update. Load alone was not enough:
 * the hero downloads before load, but may be painted a moment after it (the main thread
 * is busy hydrating), and photos started in between still counted against the LCP in
 * Lighthouse – the same build scored 94 or 83 depending on that race.
 * A photo shown after release (another page opened in the app) is never held.
 *
 * Without JavaScript held photos stay empty.
 */
/** Without an image LCP entry (no support, text as LCP, hero failed) release anyway. */
const PAINT_TIMEOUT_MS = 2500;

/**
 * Calls `done` once the browser has reported an image as the largest contentful paint –
 * immediately when it already has – or after PAINT_TIMEOUT_MS.
 */
function afterImagePaint(done: () => void): void {
    let called = false;
    let observer: PerformanceObserver | undefined;
    const finish = () => {
        if (called) return;
        called = true;
        observer?.disconnect();
        clearTimeout(timer);
        // A task later, so the requests start after the paint has been recorded.
        setTimeout(done);
    };
    const timer = setTimeout(finish, PAINT_TIMEOUT_MS);
    try {
        observer = new PerformanceObserver(list => {
            if (list.getEntries().some(entry => (entry as PerformanceEntry & { url?: string }).url)) finish();
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
        // No LCP API (older Safari): the timeout releases the photos.
    }
}

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
        const win = doc.defaultView;
        const afterLoad = () => afterImagePaint(release);
        if (doc.readyState === 'complete') afterLoad();
        else win?.addEventListener('load', afterLoad, { once: true });
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
