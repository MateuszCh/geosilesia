import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    afterNextRender,
    effect,
    inject,
    input,
    output,
    untracked
} from '@angular/core';
import {
    MarkerClusterer,
    SuperClusterAlgorithm
} from '@googlemaps/markerclusterer';
import { MapService } from '../../core/map.service';
import { MAP_CENTER, MAP_ZOOM } from '../../core/map.config';
import { MAP_STYLE } from '../../core/map-style';
import { MapCategory, MapMarker } from '../../core/map.types';

/** The selected pin is drawn larger and in ink. */
const SELECTED_COLOR = '#18201b';

/**
 * Named `GeoMap`, not `Map` – the latter would shadow the built-in Map type in every file
 * that imported it.
 */
@Component({
    selector: 'app-geo-map',
    template: '<div class="map-area__canvas"></div>',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeoMap {
    readonly markersModels = input<MapMarker[]>([]);
    readonly categories = input<MapCategory[]>([]);
    /** Categories picked in the filter – a marker in several categories takes the colour of one of these. */
    readonly activeCategories = input<string[]>([]);
    readonly markerCluster = input(false);
    /** Id of the marker the map should centre on; undefined = no selection. */
    readonly currentResult = input<string | number | undefined>();
    /** Phones show the selected place in a bottom sheet instead of the InfoWindow. */
    readonly infoWindow = input(true);
    /** A pin was clicked. */
    readonly selected = output<string | number>();

    private readonly mapService = inject(MapService);
    private readonly host: HTMLElement = inject(ElementRef).nativeElement;

    private map: google.maps.Map | undefined;
    private clusterer: MarkerClusterer | undefined;
    private bubble: google.maps.InfoWindow | undefined;
    private markers: google.maps.Marker[] = [];
    private highlighted: google.maps.Marker | undefined;

    constructor() {
        afterNextRender(() => this.initMap());

        effect(() => {
            this.markersModels();
            this.activeCategories();
            untracked(() => this.updateMap());
        });

        effect(() => {
            const id = this.currentResult();
            untracked(() => this.focusMarker(id));
        });
    }

    private initMap(): void {
        // The component is rendered only after the Google script has loaded, but the guard
        // stays: without it a network error would turn a missing map into an exception.
        if (!this.mapService.isLoaded()) return;

        const container = this.host.firstElementChild as HTMLElement;
        this.map = this.mapService.createMap(
            container,
            {
                center: MAP_CENTER,
                zoom: MAP_ZOOM,
                mapTypeId: 'styled_map',
                gestureHandling: 'cooperative',
                fullscreenControl: false,
                streetViewControl: false,
                zoomControl: true,
                zoomControlOptions: {
                    position: google.maps.ControlPosition.RIGHT_TOP
                },
                mapTypeControl: true,
                mapTypeControlOptions: {
                    position: google.maps.ControlPosition.LEFT_TOP,
                    mapTypeIds: ['styled_map', 'terrain', 'satellite', 'hybrid'],
                    style: google.maps.MapTypeControlStyle.DROPDOWN_MENU
                },
                scaleControl: true
            },
            MAP_STYLE
        );
        this.bubble = new google.maps.InfoWindow({ maxWidth: 320 });
        this.bubble.addListener('closeclick', () => this.unhighlight());
        this.updateMap();
        this.focusMarker(this.currentResult());
    }

    private updateMap(): void {
        if (!this.map) return;

        this.bubble?.close();
        this.highlighted = undefined;
        if (this.markers.length) {
            this.mapService.deleteMarkers(this.markers);
        }
        this.markers = this.mapService.createMarkers(
            this.markersModels(),
            this.categories(),
            this.map,
            this.activeCategories(),
            id => this.selected.emit(id)
        );

        this.clusterer?.clearMarkers();
        if (this.markerCluster()) {
            this.clusterer = new MarkerClusterer({
                map: this.map,
                markers: this.markers,
                algorithm: new SuperClusterAlgorithm({
                    radius: 120,
                    maxZoom: 15
                }),
                renderer: {
                    render: ({ count, position }) =>
                        new google.maps.Marker({
                            position,
                            label: {
                                text: String(count),
                                color: '#ffffff',
                                fontFamily: 'Barlow Condensed, sans-serif',
                                fontSize: '15px',
                                fontWeight: '800'
                            },
                            icon: this.mapService.clusterIcon(count),
                            zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count
                        })
                }
            });
        }

        this.mapService.setBounds(this.markers, this.map);
    }

    private unhighlight(): void {
        const marker = this.highlighted;
        if (!marker) return;
        marker.setIcon(this.mapService.pinIcon(marker.get('color'), 26));
        marker.setZIndex(undefined);
        this.highlighted = undefined;
    }

    private focusMarker(id: string | number | undefined): void {
        if (!this.map || !this.markers.length) return;
        this.unhighlight();
        if (id === undefined) {
            this.bubble?.close();
            return;
        }
        // Loose comparison: a marker id from Mongo is sometimes a number, and from the
        // result list a string.
        const marker = this.markers.find(item => item.get('id') == id);
        const model = this.markersModels().find(item => item.id == id);
        if (!marker || !model) return;

        marker.setIcon(this.mapService.pinIcon(SELECTED_COLOR, 34));
        marker.setZIndex(Number(google.maps.Marker.MAX_ZINDEX) + 10000);
        this.highlighted = marker;

        // Past the clusterer's maxZoom, so the selected pin is not hidden in a cluster.
        const minZoom = this.markerCluster() ? 16 : 13;
        if ((this.map.getZoom() ?? 0) < minZoom) this.map.setZoom(minZoom);
        const position = marker.getPosition();
        if (position) this.map.panTo(position);

        const active = this.activeCategories();
        const key = model.categories?.find(category => active.includes(category)) ?? model.categories?.[0];
        const category = this.categories().find(item => item.category === key);
        if (!this.infoWindow()) {
            this.bubble?.close();
            return;
        }
        this.bubble?.setContent(this.mapService.objectCard(model, category));
        this.bubble?.open({ map: this.map, anchor: marker });
    }
}
