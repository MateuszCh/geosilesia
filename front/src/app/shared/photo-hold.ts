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
 * The server renders such photos as usual – src and srcset, so crawlers and browsers
 * without JavaScript get them – and marks them with data-hold. A small script in
 * index.html moves the address of every marked photo to data-held-src / data-held-srcset
 * while the page is parsed, before a lazy image is fetched. In the browser Angular renders
 * a held photo the same way. Once the hero photo has been painted – the window's load
 * event, then the next painted frame – every held photo
 * in the document gets its src back, including the ones in rows that are not hydrated yet
 * (row.html), which Angular would not update. Load alone was not enough: the hero
 * downloads before load, but may be painted a moment after it (the main thread is busy
 * hydrating), and photos started in between still counted against the LCP in Lighthouse –
 * the same build scored 94 or 83 depending on that race.
 * A photo shown after release (another page opened in the app) is never held.
 */
/** A hidden tab paints no frames: release anyway after this long. */
const PAINT_TIMEOUT_MS = 2500;

/**
 * Calls `done` after the next frame has been painted (two animation frames), or after
 * PAINT_TIMEOUT_MS when no frame comes. Called on load, the hero photo has downloaded and
 * is in that frame.
 */
function afterNextPaint(win: Window, done: () => void): void {
    let called = false;
    const finish = () => {
        if (called) return;
        called = true;
        clearTimeout(timer);
        // A task later, so the requests start after the paint.
        setTimeout(done);
    };
    const timer = setTimeout(finish, PAINT_TIMEOUT_MS);
    win.requestAnimationFrame(() => win.requestAnimationFrame(finish));
}

/**
 * How photos marked with appPhoto (and in CMS HTML) are rendered now: as usual ('none'),
 * as usual with data-hold for the script in index.html ('mark', the server), or with the
 * address in data-held-src / data-held-srcset ('held', the browser).
 */
export type HoldMode = 'none' | 'mark' | 'held';

@Injectable({ providedIn: 'root' })
export class PhotoHold {
    private readonly requested = signal(false);
    private readonly loaded = signal(false);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    readonly mode = computed<HoldMode>(() =>
        !this.requested() || this.loaded() ? 'none' : this.isBrowser ? 'held' : 'mark'
    );

    constructor() {
        if (!this.isBrowser) return;
        const doc = inject(DOCUMENT);
        const release = () => {
            for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('img[data-hold]'))) {
                img.removeAttribute('data-hold');
                if (!img.hasAttribute('data-held-src')) continue;
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
        if (!win) return;
        const afterLoad = () => afterNextPaint(win, release);
        if (doc.readyState === 'complete') afterLoad();
        else win.addEventListener('load', afterLoad, { once: true });
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
        '[attr.src]': "hold.mode() === 'held' ? null : appPhoto()",
        '[attr.srcset]': "hold.mode() === 'held' ? null : srcset()",
        '[attr.data-hold]': "hold.mode() === 'none' ? null : ''",
        '[attr.data-held-src]': "hold.mode() === 'held' ? appPhoto() : null",
        '[attr.data-held-srcset]': "hold.mode() === 'held' ? srcset() : null"
    }
})
export class PhotoDirective {
    readonly appPhoto = input<string | null | undefined>();
    protected readonly hold = inject(PhotoHold);
    protected readonly srcset = computed(() => srcsetOf(this.appPhoto()));
}
