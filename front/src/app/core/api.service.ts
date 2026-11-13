import { Injectable, PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';

/**
 * Successor of request.service.js. The old service accepted a method and a body, but the
 * front end never sent anything other than GETs – so only GET remains. `withCredentials`
 * is kept: the server lives on the same domain, but in development the front end goes
 * through a proxy and session cookies have to get through.
 *
 * Responses of the server render travel to the browser in TransferState (key "api:<url>")
 * and are read from there – synchronously – for the whole visit. Angular's own HTTP
 * transfer cache is off (app.config.ts): it serves only until the app first becomes
 * stable, while the rows are hydrated later, when they scroll into view (row.html). A row
 * that fetched its data again at that moment hydrated empty, and a click made before it
 * hydrated was lost.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly state = inject(TransferState);
    private readonly isServer = isPlatformServer(inject(PLATFORM_ID));

    /**
     * `transfer: false` keeps a response made during the server render out of
     * TransferState, i.e. out of the HTML – for data the page only derives something
     * small from (ContentService.summary).
     *
     * `headers` are extra request headers, e.g. `X-Page-View` for the server's visit
     * statistics (ResourceService.loadPageFromNetwork); such a request always goes to
     * the network, since the server has to see it.
     */
    get<T>(
        url: string,
        { transfer = true, headers }: { transfer?: boolean; headers?: Record<string, string> } = {}
    ): Observable<T> {
        const request = this.http.get<T>(url, { withCredentials: true, ...(headers ? { headers } : {}) });
        if (!transfer) return request;
        const key = makeStateKey<T>(`api:${url}`);
        if (this.isServer) return request.pipe(tap(body => this.state.set(key, body)));
        if (!headers && this.state.hasKey(key)) return of(this.state.get(key, null) as T);
        return request;
    }
}
