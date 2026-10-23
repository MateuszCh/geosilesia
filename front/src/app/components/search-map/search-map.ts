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

/** Below this width the search panel sits above the map and the page has to scroll to it. */
const NARROW_BREAKPOINT = 850;
const DEFAULT_RESULTS = 10;
const MESSAGE_MS = 5000;
/** Name filtering waits for a short pause in typing, so the map does not redraw on every key. */
const NAME_FILTER_DELAY_MS = 150;

/** What the single search input does: geocode a place, or filter the list by object name. */
export type SearchMode = 'location' | 'name';

/**
 * Lower-cases and strips diacritics, so "kamieniol" matches "Kamieniołom".
 * "ł" has no Unicode decomposition and is mapped by hand.
 */
function foldText(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[łŁ]/g, 'l')
        .toLowerCase();
}

@Component({
    selector: 'app-search-map',
    templateUrl: './search-map.html',
    imports: [GeoMap, DecimalPipe],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchMap implements OnInit {
    readonly component = input.required<MapData>();

    readonly categories = signal<MapCategory[]>([]);
    readonly searchMode = signal<SearchMode>('location');
    readonly locationInput = signal('');
    readonly nameInput = signal('');
    /** Names of the categories picked in the filter; empty means all categories. */
    readonly selectedCategories = signal<string[]>([]);
    readonly categoriesOpen = signal(false);
    /** The searched point (a "home" pseudo-marker); while set, results are sorted by distance from it. */
    readonly searchLocation = signal<MapMarker | undefined>(undefined);
    readonly showSearch = signal(false);
    readonly currentResult = signal<string | number | undefined>(undefined);
    readonly searchBusy = signal(false);
    readonly searchMessage = signal('');

    /** The Google script has not loaded yet – the map and the search box are hidden then. */
    readonly mapsReady = inject(MapService).ready;

    private readonly mapService = inject(MapService);
    private readonly resource = inject(ResourceService);
    private readonly scroll = inject(ScrollService);
    private readonly doc = inject(DOCUMENT);
    private readonly host: HTMLElement = inject(ElementRef).nativeElement;
    private readonly destroyRef = inject(DestroyRef);

    private readonly allMarkers = signal<MapMarker[]>([]);
    /** Debounced copy of nameInput – the value that actually filters. */
    private readonly nameFilter = signal('');
    /** How many of the nearest results a location search shows. */
    private readonly resultsLimit = signal(DEFAULT_RESULTS);

    readonly markersCount = computed(() => this.allMarkers().length);
    readonly nameQuery = computed(() => this.nameFilter().trim());

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

    /** Markers that pass the category and name filters, in list order. */
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
        if (query) {
            markers = markers.filter(marker => titles.get(marker.id)?.includes(query));
        }
        return markers;
    });

    /**
     * What the list and the map show. After a location search only the nearest results are
     * shown, headed by the searched point itself.
     */
    readonly selectedMarkers = computed(() => {
        const location = this.searchLocation();
        const markers = this.filteredMarkers();
        return location ? [location, ...markers.slice(0, this.resultsLimit())] : markers;
    });

    readonly showMore = computed(
        () => !!this.searchLocation() && this.filteredMarkers().length > this.resultsLimit()
    );

    readonly selectedCategoryItems = computed(() => {
        const selected = this.selectedCategories();
        return this.categories().filter(category => selected.includes(category.category));
    });

    /** The text on the collapsed category list. */
    readonly categorySummary = computed(() => {
        const chosen = this.selectedCategoryItems();
        if (!chosen.length) return `Wszystkie (${this.markersCount()})`;
        if (chosen.length === 1) return `${chosen[0].name} (${chosen[0].count})`;
        return `Wybrano ${chosen.length} z ${this.categories().length}`;
    });

    readonly hasFilters = computed(
        () =>
            this.selectedCategories().length > 0 ||
            !!this.nameQuery() ||
            !!this.searchLocation()
    );

    private resultsQty = DEFAULT_RESULTS;
    private dataLoaded = false;
    private messageTimer: ReturnType<typeof setTimeout> | undefined;
    private nameTimer: ReturnType<typeof setTimeout> | undefined;

    ngOnInit(): void {
        this.resultsQty = this.component().number_results || DEFAULT_RESULTS;
        this.resultsLimit.set(this.resultsQty);
        this.destroyRef.onDestroy(() => {
            clearTimeout(this.messageTimer);
            clearTimeout(this.nameTimer);
        });

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

    private clearMessage(): void {
        clearTimeout(this.messageTimer);
        this.searchMessage.set('');
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
    }

    clearName(): void {
        this.nameInput.set('');
        this.applyNameFilter('');
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
        this.clearMessage();

        if (this.searchMode() === 'name') {
            // Enter applies the name filter at once instead of waiting for the pause in typing.
            this.applyNameFilter(this.nameInput());
            return;
        }

        const query = this.locationInput().trim();
        if (!query) {
            this.showMessage('Proszę wpisać lokalizację');
            return;
        }

        this.searchBusy.set(true);
        this.mapService
            .getCoordinates(query)
            .then(result => {
                this.searchLocation.set(this.mapService.getLocationDetails(result));
                this.resultsLimit.set(this.resultsQty);
                this.currentResult.set(undefined);
                this.searchBusy.set(false);
                this.scrollToMapIfNarrow();
            })
            .catch(status => {
                if (status === 'ZERO_RESULTS') {
                    this.showMessage('Lokalizacja nie została znaleziona');
                }
                this.searchBusy.set(false);
            });
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
    }

    clearCategories(): void {
        this.selectedCategories.set([]);
        this.currentResult.set(undefined);
    }

    /** "Wszystkie" cannot be unticked – it is the state with no category picked. */
    selectAllCategories(event: Event): void {
        (event.target as HTMLInputElement).checked = true;
        this.clearCategories();
    }

    /** Closes the category list; on a narrow screen also scrolls to the map with the results. */
    applyCategories(): void {
        this.categoriesOpen.set(false);
        this.scrollToMapIfNarrow();
    }

    clearFilters(): void {
        this.clearCategories();
        this.clearName();
        this.clearLocation();
    }

    /** Clicking the same result again deselects it. */
    setCurrentResult(id: string | number): void {
        this.currentResult.update(current => (current === id ? undefined : id));
        this.scrollToMapIfNarrow();
    }
}
