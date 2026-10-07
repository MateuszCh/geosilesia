import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Successor of request.service.js. The old service accepted a method and a body, but the
 * front end never sent anything other than GETs – so only GET remains. `withCredentials`
 * is kept: the server lives on the same domain, but in development the front end goes
 * through a proxy and session cookies have to get through.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);

    get<T>(url: string): Observable<T> {
        return this.http.get<T>(url, { withCredentials: true });
    }
}
