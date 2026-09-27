import { Injectable, REQUEST_CONTEXT, inject, makeStateKey } from '@angular/core';
import { FetchBackend, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, from, map } from 'rxjs';

/**
 * Contract with the server (../../../../ssr.js). `api` answers /api/… paths with the same
 * data as the Express routes, but without going over the network – under Passenger the
 * process has no predictable port, and an address built from the Host header would open
 * the door to SSRF.
 */
export interface SsrContext {
    api(path: string): Promise<unknown>;
}

/**
 * Flag written to TransferState only by the server render. The resolver checks it on the
 * first navigation in the browser: since the page arrived rendered, its data sits in the
 * transfer cache and must not be replaced with the IndexedDB version.
 */
export const RENDERED_ON_SERVER = makeStateKey<boolean>('ssr');

/**
 * HTTP backend of the server render: GETs to /api/… are served from the request context
 * passed by app.js, everything else goes to plain fetch. A backend rather than an
 * interceptor, because the app's interceptors sit in the chain before the HTTP transfer
 * cache – a response short-circuited in an interceptor would not end up in the HTML and
 * the browser would fetch the data again. Without the context (`ng serve`) everything
 * goes through fetch.
 */
@Injectable()
export class SsrApiBackend extends FetchBackend {
    private readonly context = inject(REQUEST_CONTEXT) as SsrContext | null;

    override handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
        // The path is computed via URL, because platform-server turns relative URLs into
        // absolute ones.
        const url = new URL(req.urlWithParams, 'http://localhost');
        if (!this.context?.api || req.method !== 'GET' || !url.pathname.startsWith('/api/')) {
            return super.handle(req);
        }
        return from(this.context.api(url.pathname)).pipe(
            map(body => new HttpResponse({ body, status: 200, url: req.urlWithParams }))
        );
    }
}
