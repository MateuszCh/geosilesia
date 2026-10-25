import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    ElementRef,
    OnInit,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MapData } from '../../models/row.model';
import { IconPost, MarkerPost } from '../../models/post.model';
import { MapCategory, MapMarker } from '../../core/map.types';
import { MapService, directionsUrl, formatKm, markerColor } from '../../core/map.service';
import { ResourceService } from '../../core/resource.service';
import { ScrollService } from '../../core/scroll.service';
import { GeoMap } from '../geo-map/geo-map';
import { foldText } from '../../shared/fold-text';

/** Below this width the panel sits above the map and the page has to scroll to it. */
const NARROW_BREAKPOINT = 900;
const DEFAULT_RESULTS = 20;
const MESSAGE_MS = 5000;
/** Name filtering waits for a short pause in typing, so the map does not redraw on every key. */
const NAME_FILTER_DELAY_MS = 150;

/** What the single search input does: geocode a place, or filter the list by object name. */
export type SearchMode = 'location' | 'name';

/** A row of the result list: the marker with its category colour. */
export interface ResultRow extends MapMarker {
    color: string;
}

/** Polish plural of "miejsce": 1 miejsce, 2–4 miejsca, 5+ miejsc. */
export function placesLabel(count: number): string {
    if (count === 1) return 'miejsce';
    const last = count % 10;
    const lastTwo = count % 100;
    return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'miejsca' : 'miejsc';
}

/**
 * The attraction map: a side panel (mode switch, search field, category chips, results
 * sorted by distance) and the map with category-coloured pins and an object card.
 *
 * Query parameters preselect filters, so other pages can link into the map:
 * `?kategoria=<category key>`, `?nazwa=<text>`, `?top50=1`.
 */
@Component({
    selector: 'app-search-map',
    templateUrl: './search-map.html',
    imports: [GeoMap],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchMap implements OnInit {
    readonly component = input.required<MapData>();
    /** The map is the whole page (its title is the h1). */
    readonly standalone = input(false);

    readonly categories = signal<MapCategory[]>([]);
    readonly searchMode = signal<SearchMode>('location');
    readonly locationInput = signal('');
    readonly nameInput = signal('');
    /** Keys of the categories picked in the filter; empty means all categories. */
    readonly selectedCategories = signal<string[]>([]);
    /** Only TOP 50 places (markers with a `top50` number). */
    readonly top50Only = signal(false);
    readonly categoriesOpen = signal(false);
    /** The searched point (a "home" pseudo-marker); while set, results are sorted by distance from it. */
    readonly searchLocation = signal<MapMarker | undefined>(undefined);
    readonly currentResult = signal<string | number | undefined>(undefined);
    readonly searchBusy = signal(false);
    readonly locating = signal(false);
    readonly searchMessage = signal('');

    /** The Google script has not loaded yet – the map is replaced by a placeholder then. */
    readonly mapsReady = inject(MapService).ready;

    protected readonly placesLabel = placesLabel;
    protected readonly formatKm = formatKm;
    protected readonly directionsUrl = directionsUrl;

    private readonly mapService = inject(MapService);
    private readonly resource = inject(ResourceService);
    private readonly scroll = inject(ScrollService);
    private readonly route = inject(ActivatedRoute);
    private readonly doc = inject(DOCUMENT);
    private readonly host: HTMLElement = inject(ElementRef).nativeElement;
    private readonly destroyRef = inject(DestroyRef);

    private readonly allMarkers = signal<MapMarker[]>([]);
    /** Debounced copy of nameInput – the value that actually filters. */
    private readonly nameFilter = signal('');
    /** How many results the list (and, after a location search, the map) shows. */
    private readonly resultsLimit = signal(DEFAULT_RESULTS);

    readonly markersCount = computed(() => this.allMarkers().length);
    readonly nameQuery = computed(() => this.nameFilter().trim());
    readonly currentInput = computed(() =>
        this.searchMode() === 'name' ? this.nameInput() : this.locationInput()
    );

    /** Variant C sets titles in sentence case; an all-caps title from the CMS is lowered. */
    readonly title = computed(() => {
        const title = this.component().title?.trim() || 'Mapa atrakcji';
        const letters = title.replace(/[^\p{L}]/gu, '');
        if (letters.length < 4 || letters.replace(/[^\p{Lu}]/gu, '').length / letters.length <= 0.8) {
            return title;
        }
        const lower = title.toLocaleLowerCase('pl');
        return lower.charAt(0).toLocaleUpperCase('pl') + lower.slice(1);
    });

    private readonly foldedTitles = computed(
        () =>
            new Map(
                this.allMarkers().map(marker => [marker.id, foldText(marker.title ?? '')])
            )
    );

    /** Default list order: north to south. */
    private readonly markersByLatitude = computed(() =>
        [...this.allMarkers()].sort((a, b) => b.position.lat - a.position.lat)
    );

    private readonly markersByDistance = computed(() => {
        const location = this.searchLocation();
        return location
            ? this.mapService.sortMarkersByDistance(
                  this.allMarkers(),
                  location.position.lat,
                  location.position.lng
              )
            : [];
    });

    /** Markers that pass the category, TOP 50 and name filters, in list order. */
    readonly filteredMarkers = computed(() => {
        const selected = this.selectedCategories();
        const query = foldText(this.nameQuery());
        const titles = this.foldedTitles();

        let markers = this.searchLocation()
            ? this.markersByDistance()
            : this.markersByLatitude();
        if (selected.length) {
            markers = markers.filter(marker =>
                marker.categories?.some(name => selected.includes(name))
            );
        }
        if (this.top50Only()) {
            markers = markers.filter(marker => marker.top50);
        }
        if (query) {
            markers = markers.filter(marker => titles.get(marker.id)?.includes(query));
        }
        return markers;
    });

    private readonly categoriesByKey = computed(
        () => new Map(this.categories().map(category => [category.category, category]))
    );

    /** The list: the first results with their category colour. */
    readonly listedMarkers = computed<ResultRow[]>(() => {
        const byKey = this.categoriesByKey();
        const active = this.selectedCategories();
        return this.filteredMarkers()
            .slice(0, this.resultsLimit())
            .map(marker => ({ ...marker, color: markerColor(marker, byKey, active) }));
    });

    /**
     * What the map shows. After a location search only the listed nearest results, headed by
     * the searched point itself; otherwise every filtered marker (clustered).
     */
    readonly mapMarkers = computed(() => {
        const location = this.searchLocation();
        return location ? [location, ...this.listedMarkers()] : this.filteredMarkers();
    });

    readonly showMore = computed(() => this.filteredMarkers().length > this.resultsLimit());

    readonly summary = computed(() => {
        const count = this.filteredMarkers().length;
        if (!this.markersCount()) return 'Wczytywanie obiektów…';
        const base = `${count} ${placesLabel(count)}`;
        return this.searchLocation() ? `${base} · od najbliższych` : base;
    });

    readonly hasFilters = computed(
        () =>
            this.selectedCategories().length > 0 ||
            this.top50Only() ||
            !!this.nameQuery() ||
            !!this.searchLocation()
    );

    private resultsQty = DEFAULT_RESULTS;
    private dataLoaded = false;
    private messageTimer: ReturnType<typeof setTimeout> | undefined;
    private nameTimer: ReturnType<typeof setTimeout> | undefined;

    ngOnInit(): void {
        this.resultsQty = Number(this.component().number_results) || DEFAULT_RESULTS;
        this.resultsLimit.set(this.resultsQty);
        this.destroyRef.onDestroy(() => {
            clearTimeout(this.messageTimer);
            clearTimeout(this.nameTimer);
        });

        const params = this.route.snapshot.queryParamMap;
        const category = params.get('kategoria');
        if (category) this.selectedCategories.set([category]);
        if (params.get('top50')) this.top50Only.set(true);
        const name = params.get('nazwa');
        if (name) {
            this.searchMode.set('name');
            this.nameInput.set(name);
            this.nameFilter.set(name);
        }

        if (this.resource.isOfflineAvailable()) {
            void Promise.all([
                this.resource.loadPostsFromCache<MarkerPost['data']>('marker'),
                this.resource.loadPostsFromCache<IconPost['data']>('icon')
            ]).then(([markers, icons]) => {
                // Network data takes precedence – if it has already arrived, the cache
                // does not roll it back.
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
        this.allMarkers.set(this.mapService.getFormattedMarkers(markers));
    }

    private get isNarrow(): boolean {
        return (this.doc.defaultView?.innerWidth ?? 0) < NARROW_BREAKPOINT;
    }

    /** On a narrow screen the panel and the map do not fit side by side – scroll to the map. */
    private scrollToMapIfNarrow(): void {
        if (this.isNarrow && this.mapsReady()) {
            this.scroll.scrollToElement(this.host.querySelector('.map-area'));
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

    private clearMessage(): void {
        clearTimeout(this.messageTimer);
        this.searchMessage.set('');
    }

    joinMeta(...parts: (string | undefined)[]): string {
        return parts.filter(Boolean).join(' · ');
    }

    setSearchMode(mode: SearchMode): void {
        this.searchMode.set(mode);
        this.clearMessage();
    }

    onSearchInput(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        if (this.searchMode() === 'location') {
            this.locationInput.set(value);
            return;
        }
        this.nameInput.set(value);
        clearTimeout(this.nameTimer);
        this.nameTimer = setTimeout(
            () => this.applyNameFilter(value),
            NAME_FILTER_DELAY_MS
        );
    }

    private applyNameFilter(value: string): void {
        clearTimeout(this.nameTimer);
        this.nameFilter.set(value);
        this.currentResult.set(undefined);
        this.resultsLimit.set(this.resultsQty);
    }

    clearName(): void {
        this.nameInput.set('');
        this.applyNameFilter('');
    }

    search(event: Event): void {
        event.preventDefault();
        this.clearMessage();

        if (this.searchMode() === 'name') {
            // Enter applies the name filter at once instead of waiting for the pause in typing.
            this.applyNameFilter(this.nameInput());
            return;
        }

        const query = this.locationInput().trim();
        if (!query) {
            this.showMessage('Wpisz miejscowość lub adres.');
            return;
        }
        if (!this.mapsReady()) return;

        this.searchBusy.set(true);
        this.mapService
            .getCoordinates(query)
            .then(result => {
                this.setLocation(this.mapService.getLocationDetails(result));
                this.searchBusy.set(false);
            })
            .catch(status => {
                if (status === 'ZERO_RESULTS') {
                    this.showMessage('Nie znaleziono takiej lokalizacji.');
                }
                this.searchBusy.set(false);
            });
    }

    /** Sorts the results from the user's position (the browser asks for permission). */
    useMyLocation(): void {
        const geolocation = this.doc.defaultView?.navigator.geolocation;
        if (!geolocation) {
            this.showMessage('Twoja przeglądarka nie udostępnia lokalizacji.');
            return;
        }
        this.locating.set(true);
        geolocation.getCurrentPosition(
            position => {
                this.locating.set(false);
                this.searchMode.set('location');
                this.locationInput.set('Moja lokalizacja');
                this.setLocation({
                    id: 0,
                    type: 'home',
                    address: 'Twoja lokalizacja',
                    position: {
                        lat: Number(position.coords.latitude.toFixed(8)),
                        lng: Number(position.coords.longitude.toFixed(8))
                    }
                });
            },
            () => {
                this.locating.set(false);
                this.showMessage('Nie udało się ustalić Twojej lokalizacji.');
            },
            { timeout: 10000 }
        );
    }

    private setLocation(location: MapMarker): void {
        this.searchLocation.set(location);
        this.resultsLimit.set(this.resultsQty);
        this.currentResult.set(undefined);
        this.scrollToMapIfNarrow();
    }

    clearLocation(): void {
        this.searchLocation.set(undefined);
        this.locationInput.set('');
        this.resultsLimit.set(this.resultsQty);
        this.currentResult.set(undefined);
    }

    increaseSearchQty(): void {
        this.resultsLimit.update(limit => limit + this.resultsQty);
    }

    toggleCategoriesList(): void {
        this.categoriesOpen.update(open => !open);
    }

    toggleCategory(category: string): void {
        this.selectedCategories.update(selected =>
            selected.includes(category)
                ? selected.filter(name => name !== category)
                : [...selected, category]
        );
        this.currentResult.set(undefined);
        this.resultsLimit.set(this.resultsQty);
    }

    clearCategories(): void {
        this.selectedCategories.set([]);
        this.currentResult.set(undefined);
    }

    clearFilters(): void {
        this.clearCategories();
        this.top50Only.set(false);
        this.clearName();
        this.clearLocation();
    }

    /** Clicking the same result again deselects it. */
    setCurrentResult(id: string | number): void {
        this.currentResult.update(current => (current === id ? undefined : id));
        this.scrollToMapIfNarrow();
    }
}
