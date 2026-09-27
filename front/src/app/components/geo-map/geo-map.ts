import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    afterNextRender,
    effect,
    inject,
    input,
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

/**
 * Named `GeoMap`, not `Map` – the latter would shadow the built-in Map type in every file
 * that imported it.
 */
@Component({
    selector: 'app-geo-map',
    template: '<div class="search__container__map"></div>',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeoMap {
    readonly markersModels = input<MapMarker[]>([]);
    readonly categories = input<MapCategory[]>([]);
    readonly activeCategory = input<string | undefined>();
    readonly markerCluster = input(false);
    /** Id of the marker the map should centre on; undefined = no selection. */
    readonly currentResult = input<string | number | undefined>();

    private readonly mapService = inject(MapService);
    private readonly host: HTMLElement = inject(ElementRef).nativeElement;

    private map: google.maps.Map | undefined;
    private clusterer: MarkerClusterer | undefined;
    private markers: google.maps.Marker[] = [];

    constructor() {
        afterNextRender(() => this.initMap());

        effect(() => {
            this.markersModels();
            this.activeCategory();
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
                scrollwheel: false,
                draggable: true,
                mapTypeId: 'styled_map',
                fullscreenControl: true,
                zoomControl: true,
                zoomControlOptions: {
                    position: google.maps.ControlPosition.RIGHT_TOP
                },
                streetViewControl: true,
                streetViewControlOptions: {
                    position: google.maps.ControlPosition.RIGHT_TOP
                },
                mapTypeControl: true,
                mapTypeControlOptions: {
                    position: google.maps.ControlPosition.LEFT_TOP,
                    mapTypeIds: [
                        'roadmap',
                        'satellite',
                        'hybrid',
                        'terrain',
                        'styled_map'
                    ],
                    style: google.maps.MapTypeControlStyle.DROPDOWN_MENU
                },
                scaleControl: true
            },
            MAP_STYLE
        );
        this.updateMap();
    }

    private updateMap(): void {
        if (!this.map) return;

        if (this.markers.length) {
            this.mapService.deleteMarkers(this.markers);
        }
        this.markers = this.mapService.createMarkers(
            this.markersModels(),
            this.categories(),
            this.map,
            this.activeCategory()
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
                                color: 'white',
                                fontSize: '12px'
                            },
                            icon: {
                                url: this.clusterImage(count),
                                scaledSize: new google.maps.Size(60, 60)
                            },
                            zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count
                        })
                }
            });
        }

        this.mapService.setBounds(this.markers, this.map);
    }

    /** Cluster size is signalled by a different graphic – thresholds 10 / 100 / 1000. */
    private clusterImage(count: number): string {
        if (count < 10) return '/images/markers/1.png';
        if (count < 100) return '/images/markers/2.png';
        if (count < 1000) return '/images/markers/3.png';
        return '/images/markers/4.png';
    }

    private focusMarker(id: string | number | undefined): void {
        if (!this.map || id === undefined || !this.markers.length) return;
        // Loose comparison: a marker id from Mongo is sometimes a number, and from the
        // result list a string.
        const marker = this.markers.find(item => item.get('id') == id);
        if (!marker) return;

        this.map.setZoom(18);
        const position = marker.getPosition();
        if (position) this.map.panTo(position);
        google.maps.event.trigger(marker, 'click');
    }
}
