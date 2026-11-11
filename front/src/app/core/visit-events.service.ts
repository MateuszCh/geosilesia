import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/** Links to documents count as downloads; images open in the viewer and do not. */
const DOWNLOAD = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv|txt|zip|rar|7z|epub|gpx|kml|kmz)$/i;
const ENDPOINT = '/api/visit-event';

type VisitEvent =
    | { type: 'view'; path: string; referrer: string }
    | { type: 'engagement'; path: string; ms: number }
    | { type: 'outbound' | 'download'; path: string; target: string };

/**
 * The visit statistics of the browser side (visits.js on the server): the view of the page
 * the document was loaded with, how long each page was really visible, and clicks on links
 * to other sites or to documents. The server does not count a document request – scrapers
 * without JavaScript make those too – so the loaded page is reported here once it is shown,
 * with the referrer, or its 404 when it is no page; a page Chrome prerendered or prefetched
 * only when the visitor sees it. Pages opened inside the app count by their API request
 * (`X-Page-View`), which ResourceService leaves off while the document loads
 * (`isDocumentLoad`), so that page counts once. Sent with navigator.sendBeacon (the view at
 * once, the visible time when a page is hidden or left, a click when it happens). Nothing is stored in the browser and no id is sent – the server recognises the
 * visitor of the day the same way as for page views – so no consent is needed.
 */
@Injectable({ providedIn: 'root' })
export class VisitEventsService {
    private readonly doc = inject(DOCUMENT);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);

    private path = '';
    /** when the page became visible (performance.now), null while it is hidden */
    private visibleSince: number | null = null;
    /** visible time of the current page not sent yet */
    private pending = 0;
    private started = false;
    /** true until the first navigation inside the app starts (the initial one has id 1) */
    private documentLoad = true;

    constructor() {
        const subscription = this.router.events
            .pipe(filter((event) => event instanceof NavigationStart && event.id > 1))
            .subscribe(() => {
                this.documentLoad = false;
                subscription.unsubscribe();
            });
        this.destroyRef.onDestroy(() => subscription.unsubscribe());
    }

    /**
     * Whether the page being opened is the one the document was loaded with: its view is
     * the "view" beacon, so the API requests for it must not count it again.
     */
    isDocumentLoad(): boolean {
        return this.documentLoad;
    }

    /** Starts listening; in the browser only (called after the first render). */
    start(): void {
        const view = this.doc.defaultView;
        if (this.started || !view) return;
        this.started = true;
        this.path = view.location.pathname;
        if (this.doc.visibilityState === 'visible') this.visibleSince = view.performance.now();
        this.countLoad(view);

        const subscription = this.router.events
            .pipe(filter((event) => event instanceof NavigationEnd))
            .subscribe(() => this.onNavigated());
        const onVisibility = () => {
            if (this.doc.visibilityState === 'hidden') {
                this.flush();
            } else if (this.visibleSince === null) {
                this.visibleSince = view.performance.now();
            }
        };
        const onLeave = () => this.flush();
        const onClick = (event: MouseEvent) => this.onClick(event);

        this.doc.addEventListener('visibilitychange', onVisibility);
        view.addEventListener('pagehide', onLeave);
        this.doc.addEventListener('click', onClick, true);
        this.doc.addEventListener('auxclick', onClick, true);
        this.destroyRef.onDestroy(() => {
            subscription.unsubscribe();
            this.doc.removeEventListener('visibilitychange', onVisibility);
            view.removeEventListener('pagehide', onLeave);
            this.doc.removeEventListener('click', onClick, true);
            this.doc.removeEventListener('auxclick', onClick, true);
        });
    }

    /**
     * Sends the view of the page the document was loaded with: at once, or for a page
     * Chrome is prerendering when it is shown (`prerenderingchange`). The server counts it
     * as a full load, or as a 404 when the address is no page.
     */
    private countLoad(view: Window): void {
        const doc = this.doc as Document & { prerendering?: boolean };
        const sendView = () =>
            this.send({ type: 'view', path: view.location.pathname, referrer: doc.referrer });
        if (doc.prerendering) {
            doc.addEventListener('prerenderingchange', sendView, { once: true });
            return;
        }
        sendView();
    }

    /** A new page: the time of the previous one is sent, the new one starts counting. */
    private onNavigated(): void {
        const view = this.doc.defaultView;
        if (!view || view.location.pathname === this.path) return;
        this.flush();
        this.path = view.location.pathname;
        if (this.doc.visibilityState === 'visible') this.visibleSince = view.performance.now();
    }

    /** Sends the visible time collected so far for the current page and pauses the count. */
    private flush(): void {
        const view = this.doc.defaultView;
        if (!view) return;
        if (this.visibleSince !== null) {
            this.pending += view.performance.now() - this.visibleSince;
            this.visibleSince = null;
        }
        const ms = Math.round(this.pending);
        this.pending = 0;
        if (ms > 0) this.send({ type: 'engagement', path: this.path, ms });
    }

    private onClick(event: MouseEvent): void {
        const view = this.doc.defaultView;
        const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!view || !link) return;
        let url: URL;
        try {
            url = new URL(link.href, view.location.href);
        } catch {
            return;
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
        const path = view.location.pathname;
        // no query or fragment: they may carry someone's data
        if (url.host !== view.location.host) {
            const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
            this.send({ type: 'outbound', path, target: url.hostname.replace(/^www\./, '') + pathname });
        } else if (DOWNLOAD.test(url.pathname)) {
            let target = url.pathname;
            try {
                target = decodeURIComponent(target);
            } catch {
                // keep it encoded
            }
            this.send({ type: 'download', path, target });
        }
    }

    private send(event: VisitEvent): void {
        const body = JSON.stringify(event);
        const nav = this.doc.defaultView?.navigator;
        try {
            if (nav?.sendBeacon && nav.sendBeacon(ENDPOINT, body)) return;
        } catch {
            // fall back to fetch
        }
        void fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => undefined);
    }
}
