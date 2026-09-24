import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    ElementRef,
    OnInit,
    inject,
    input,
    signal
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MapData } from '../../models/row.model';
import { IconPost, MarkerPost } from '../../models/post.model';
import { MapCategory, MapMarker } from '../../core/map.types';
import { MapService } from '../../core/map.service';
import { ResourceService } from '../../core/resource.service';
import { ScrollService } from '../../core/scroll.service';
import { GeoMap } from '../geo-map/geo-map';

/** Poniżej tej szerokości panel wyszukiwania stoi nad mapą i trzeba do niej dojechać. */
const NARROW_BREAKPOINT = 850;
const DEFAULT_RESULTS = 10;
const MESSAGE_MS = 5000;
const ALL = 'all';

@Component({
    selector: 'app-search-map',
    templateUrl: './search-map.html',
    imports: [GeoMap, DecimalPipe],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchMap implements OnInit {
    readonly component = input.required<MapData>();

    readonly categories = signal<MapCategory[]>([]);
    readonly selectedMarkers = signal<MapMarker[]>([]);
    readonly markersCount = signal(0);
    readonly category = signal<string>(ALL);
    readonly searchInput = signal('');
    readonly showSearch = signal(false);
    readonly showMore = signal(false);
    readonly currentResult = signal<string | number | undefined>(undefined);
    readonly searchBusy = signal(false);
    readonly searchMessage = signal('');

    /** Skrypt Google jeszcze się nie wczytał – mapa i wyszukiwarka są wtedy ukryte. */
    readonly mapsReady = inject(MapService).ready;

    private readonly mapService = inject(MapService);
    private readonly resource = inject(ResourceService);
    private readonly scroll = inject(ScrollService);
    private readonly doc = inject(DOCUMENT);
    private readonly host: HTMLElement = inject(ElementRef).nativeElement;
    private readonly destroyRef = inject(DestroyRef);

    private allMarkers: MapMarker[] = [];
    private markersByDistance: MapMarker[] = [];
    private resultsQty = DEFAULT_RESULTS;
    private searchQty = DEFAULT_RESULTS;
    private dataLoaded = false;
    private messageTimer: ReturnType<typeof setTimeout> | undefined;

    ngOnInit(): void {
        this.resultsQty = this.component().number_results || DEFAULT_RESULTS;
        this.destroyRef.onDestroy(() => clearTimeout(this.messageTimer));

        if (this.resource.isOfflineAvailable()) {
            void Promise.all([
                this.resource.loadPostsFromCache<MarkerPost['data']>('marker'),
                this.resource.loadPostsFromCache<IconPost['data']>('icon')
            ]).then(([markers, icons]) => {
                // Dane z sieci są nadrzędne – jeśli zdążyły przyjść, cache ich nie cofa.
                if (!this.dataLoaded && markers.length && icons.length) {
                    this.onLoad(markers, icons);
                }
            });
        }

        forkJoin({
            markers: this.resource.loadPostsFromNetwork<MarkerPost['data']>('marker'),
            icons: this.resource.loadPostsFromNetwork<IconPost['data']>('icon')
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(({ markers, icons }) => {
                if (!markers.length || !icons.length) return;
                this.dataLoaded = true;
                void this.mapService.loadGoogleMaps();
                this.onLoad(markers, icons);
            });
    }

    private onLoad(markers: MarkerPost[], icons: IconPost[]): void {
        this.categories.set(this.mapService.getCategories(markers, icons));
        this.allMarkers = this.mapService.getFormattedMarkers(markers);
        this.markersCount.set(this.allMarkers.length);
        this.selectedMarkers.set(this.sortedByLatitude(this.allMarkers));
    }

    /** Domyślny porządek listy: z północy na południe. */
    private sortedByLatitude(markers: MapMarker[]): MapMarker[] {
        return [...markers].sort((a, b) => b.position.lat - a.position.lat);
    }

    private get isNarrow(): boolean {
        return (this.doc.defaultView?.innerWidth ?? 0) < NARROW_BREAKPOINT;
    }

    /** Na wąskim ekranie panel i mapa nie mieszczą się obok siebie – trzeba dojechać. */
    private scrollToMapIfNarrow(): void {
        if (this.isNarrow && this.mapsReady()) {
            this.scroll.scrollToElement(this.host);
        }
    }

    private showMessage(message: string): void {
        clearTimeout(this.messageTimer);
        this.searchMessage.set(message);
        this.messageTimer = setTimeout(
            () => this.searchMessage.set(''),
            MESSAGE_MS
        );
    }

    onSearchInput(event: Event): void {
        this.searchInput.set((event.target as HTMLInputElement).value);
    }

    toggleSearchPanel(): void {
        if (!this.isNarrow) {
            this.showSearch.update(open => !open);
        } else if (this.mapsReady()) {
            this.scroll.scrollToElement(this.doc.getElementById('search-form'));
        }
    }

    search(event: Event): void {
        event.preventDefault();
        clearTimeout(this.messageTimer);
        this.searchMessage.set('');

        const query = this.searchInput().trim();
        if (!query) {
            this.showMessage('Proszę wpisać lokalizację');
            return;
        }

        this.searchBusy.set(true);
        this.mapService
            .getCoordinates(query)
            .then(result => {
                // +1 na pseudo-marker samej wyszukanej lokalizacji, który staje na czele
                // listy i nie powinien zjadać miejsca prawdziwym wynikom.
                this.searchQty = this.resultsQty + 1;
                this.category.set('');
                this.scrollToMapIfNarrow();

                const location = this.mapService.getLocationDetails(result);
                this.markersByDistance = [
                    location,
                    ...this.mapService.sortMarkersByDistance(
                        this.allMarkers,
                        location.position.lat,
                        location.position.lng
                    )
                ];
                this.showNearest();
                this.showMore.set(true);
                this.currentResult.set(undefined);
                this.searchBusy.set(false);
            })
            .catch(status => {
                if (status === 'ZERO_RESULTS') {
                    this.showMessage('Lokalizacja nie została znaleziona');
                }
                this.searchBusy.set(false);
            });
    }

    private showNearest(): void {
        this.selectedMarkers.set(this.markersByDistance.slice(0, this.searchQty));
    }

    increaseSearchQty(): void {
        this.searchQty += this.resultsQty;
        this.showNearest();
        if (this.searchQty > this.markersByDistance.length) {
            this.showMore.set(false);
        }
    }

    pickCategory(category: string): void {
        this.category.set(category);
        this.showMore.set(false);
        this.currentResult.set(undefined);

        const markers =
            category === ALL
                ? this.allMarkers
                : this.allMarkers.filter(marker =>
                      marker.categories?.includes(category)
                  );
        this.selectedMarkers.set(this.sortedByLatitude(markers));
        this.scrollToMapIfNarrow();
    }

    /** Ponowne kliknięcie w ten sam wynik odznacza go. */
    setCurrentResult(id: string | number): void {
        this.currentResult.update(current => (current === id ? undefined : id));
        this.scrollToMapIfNarrow();
    }
}
