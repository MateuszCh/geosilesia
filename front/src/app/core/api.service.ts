import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Następca request.service.js. Stary serwis przyjmował metodę i body, ale front nigdy
 * nie wysyłał nic poza GET-ami – zostaje więc samo GET. `withCredentials` zachowane:
 * serwer stoi pod tą samą domeną, lecz w dewie front chodzi przez proxy i ciasteczka
 * sesji muszą przejść.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);

    get<T>(url: string): Observable<T> {
        return this.http.get<T>(url, { withCredentials: true });
    }
}
