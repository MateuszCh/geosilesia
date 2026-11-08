import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/** Links to documents count as downloads; images open in the viewer and do not. */
const DOWNLOAD = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv|txt|zip|rar|7z|epub|gpx|kml|kmz)$/i;
const ENDPOINT = '/api/visit-event';

type VisitEvent =
    | { type: 'engagement'; path: string; ms: number }
    | { type: 'outbound' | 'download'; path: string; target: string };

/**
 * What a page view alone does not tell the visit statistics (visits.js on the server):
 * how long each page was really visible, and clicks on links to other sites or to
 * documents. Sent with navigator.sendBeacon when a page is hidden or left, or a link is
 * clicked. Nothing is stored in the browser and no id is sent – the server recognises the
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

    /** Starts listening; in the browser only (called after the first render). */
    start(): void {
        const view = this.doc.defaultView;
        if (this.started || !view) return;
        this.started = true;
        this.path = view.location.pathname;
        if (this.doc.visibilityState === 'visible') this.visibleSince = view.performance.now();

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
