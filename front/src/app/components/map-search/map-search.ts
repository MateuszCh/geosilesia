import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavigationService } from '../../core/navigation.service';
import { internalLink } from '../../core/cms-link';
import { MapSearchData } from '../../models/row.model';

/**
 * The search card on the home page. It does not search by itself: it opens the map page
 * with the query in the address (`?lokalizacja=` or `?nazwa=`), where the map runs it.
 */
@Component({
    selector: 'app-map-search',
    templateUrl: './map-search.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapSearch {
    readonly component = input.required<MapSearchData>();
    readonly mode = signal<'location' | 'name'>('location');
    readonly query = signal('');

    private readonly router = inject(Router);
    private readonly navigation = inject(NavigationService);

    private readonly mapLink = computed(
        () => internalLink(this.component().map_link) || this.navigation.cta().link
    );

    submit(event: Event): void {
        event.preventDefault();
        const query = this.query().trim();
        const key = this.mode() === 'name' ? 'nazwa' : 'lokalizacja';
        void this.router.navigate([this.mapLink()], { queryParams: query ? { [key]: query } : {} });
    }

    myLocation(): void {
        void this.router.navigate([this.mapLink()], { queryParams: { lokalizacja: 'moja' } });
    }
}
