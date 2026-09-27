import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GOOGLE_MAPS_URL } from './map.config';
import { MapCategory, MapMarker, MapStyleDefinition } from './map.types';
import { IconPost, MarkerPost } from '../models/post.model';

/** Earth's radius in km – for computing distances with the haversine formula. */
const EARTH_RADIUS_KM = 6371;

/**
 * Port of map.service.js. The logic (categories, distances, markers, InfoWindow) is
 * unchanged; the differences are lazy loading of the Google script via a Promise instead
 * of polling every half second, and an InfoWindow built from DOM nodes rather than from
 * a concatenated string.
 */
@Injectable({ providedIn: 'root' })
export class MapService {
    private readonly doc = inject(DOCUMENT);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    /** Controls the visibility of the map and the search field in the search-map template. */
    readonly ready = signal(false);

    private loading: Promise<boolean> | null = null;

    /**
     * The Google script is loaded only when the page actually contains a map – it is
     * several hundred kilobytes that most pages do not need.
     */
    loadGoogleMaps(): Promise<boolean> {
        if (!this.isBrowser) return Promise.resolve(false);
        this.loading ??= new Promise<boolean>(resolve => {
            if (this.isLoaded()) {
                resolve(true);
                return;
            }
            const script = this.doc.createElement('script');
            script.src = GOOGLE_MAPS_URL;
            script.async = true;
            script.onload = () => {
                this.ready.set(true);
                resolve(true);
            };
            script.onerror = () => {
                // The page must keep working without the map: the result list renders from
                // the API data, just without the preview and without address search.
                this.loading = null;
                resolve(false);
            };
            this.doc.head.appendChild(script);
        });
        return this.loading;
    }

    isLoaded(): boolean {
        return (
            this.isBrowser &&
            typeof google !== 'undefined' &&
            typeof google.maps !== 'undefined'
        );
    }

    createMap(
        element: HTMLElement,
        options: google.maps.MapOptions,
        style: MapStyleDefinition
    ): google.maps.Map {
        const map = new google.maps.Map(element, options);
        map.mapTypes.set(
            'styled_map',
            new google.maps.StyledMapType(style.style, style.name)
        );
        return map;
    }

    getCoordinates(address: string): Promise<google.maps.GeocoderResult> {
        return new Promise((resolve, reject) => {
            new google.maps.Geocoder().geocode({ address }, (results, status) => {
                if (status === 'OK' && results?.length) {
                    resolve(results[0]);
                } else {
                    reject(status);
                }
            });
        });
    }

    /** The searched location joins the result list as a pseudo-marker of type "home". */
    getLocationDetails(result: google.maps.GeocoderResult): MapMarker {
        return {
            position: {
                lat: Number(result.geometry.location.lat().toFixed(8)),
                lng: Number(result.geometry.location.lng().toFixed(8))
            },
            address: result.formatted_address,
            type: 'home',
            id: 0
        };
    }

    sortMarkersByDistance(
        markers: MapMarker[],
        lat: number,
        lng: number
    ): MapMarker[] {
        return markers
            .map(marker => ({
                ...marker,
                distance: this.getDistance(
                    lat,
                    lng,
                    marker.position.lat,
                    marker.position.lng
                )
            }))
            .sort((a, b) => a.distance - b.distance);
    }

    /** Great-circle distance (haversine) in kilometres. */
    private getDistance(
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number
    ): number {
        const rad = (deg: number) => deg * (Math.PI / 180);
        const dLat = rad(lat2 - lat1);
        const dLng = rad(lng2 - lng1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
        return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    deleteMarkers(markers: google.maps.Marker[]): void {
        markers.forEach(marker => marker.setMap(null));
    }

    setBounds(markers: google.maps.Marker[], map: google.maps.Map): void {
        if (!markers.length) return;
        const bounds = new google.maps.LatLngBounds();
        markers.forEach(marker => {
            const position = marker.getPosition();
            if (position) bounds.extend(position);
        });
        map.fitBounds(bounds);
        // With a single result fitBounds would zoom in all the way – showing just the
        // point and nothing around it.
        if (markers.length === 1) {
            map.setZoom(16);
        }
    }

    createMarkers(
        models: MapMarker[],
        categories: MapCategory[],
        map: google.maps.Map,
        activeCategory: string | undefined
    ): google.maps.Marker[] {
        const infoWindow = new google.maps.InfoWindow();
        const byName = new Map(categories.map(category => [category.category, category]));
        const markers: google.maps.Marker[] = [];

        models.forEach(model => {
            if (
                !model.position?.lat ||
                !model.position?.lng ||
                !(model.title || model.type)
            ) {
                return;
            }
            const position = {
                lat: Number(model.position.lat),
                lng: Number(model.position.lng)
            };

            let icon = '';
            if (!model.type && model.categories?.length) {
                const name =
                    !activeCategory || activeCategory === 'all'
                        ? model.categories[0]
                        : activeCategory;
                icon = byName.get(name)?.icon ?? '';
            }

            const marker = new google.maps.Marker({
                position,
                map,
                title: model.title ?? '',
                icon
            });
            marker.set('id', model.id);
            marker.addListener('click', () => {
                infoWindow.setContent(this.infoWindowContent(model));
                infoWindow.open(map, marker);
            });
            markers.push(marker);
        });

        return markers;
    }

    /**
     * The info bubble is built from DOM nodes, not from concatenated HTML: titles and
     * links come from the CMS, so inserted as text they cannot execute as markup.
     */
    private infoWindowContent(model: MapMarker): HTMLElement {
        const container = this.doc.createElement('div');
        container.className = 'marker-description';

        const line = (text: string): void => {
            const paragraph = this.doc.createElement('p');
            paragraph.className = 'marker-description__text';
            paragraph.textContent = text;
            container.appendChild(paragraph);
        };

        line(model.type === 'home' ? (model.address ?? '') : (model.title ?? ''));
        line(`${model.position.lat}, ${model.position.lng}`);

        if (model.type !== 'home') {
            if (model.distance !== undefined) {
                line(`Odległość: ${model.distance.toFixed(2)} km`);
            }
            if (model.hyperlink) {
                const link = this.doc.createElement('a');
                link.href = model.hyperlink;
                link.target = '_blank';
                link.rel = 'noreferrer';
                link.textContent = 'Więcej';
                container.appendChild(link);
            }
        }
        return container;
    }

    /**
     * Categories come from "icon" posts, but only those used by at least one marker are
     * kept – otherwise the filter would show empty entries.
     */
    getCategories(markers: MarkerPost[], icons: IconPost[]): MapCategory[] {
        if (!markers?.length || !icons?.length) return [];

        const counts = new Map<string, number>();
        markers.forEach(marker => {
            marker.data?.categories?.forEach(name => {
                counts.set(name, (counts.get(name) ?? 0) + 1);
            });
        });

        return icons
            .filter(icon => icon.data?.category && counts.has(icon.data.category))
            .map(icon => ({
                id: icon.id,
                category: icon.data.category!,
                name: icon.data.name,
                icon: icon.data.icon,
                count: counts.get(icon.data.category!)!
            }));
    }

    /** Flattens "marker" posts into the shape used by the map and the result list. */
    getFormattedMarkers(markers: MarkerPost[]): MapMarker[] {
        if (!markers?.length) return [];
        return markers
            .filter(marker => marker.title && marker.data?.lat && marker.data?.long)
            .map(marker => ({
                title: marker.title,
                hyperlink: marker.data.link,
                place: marker.data.place,
                categories: marker.data.categories,
                id: marker.id,
                position: {
                    lat: Number(marker.data.lat),
                    lng: Number(marker.data.long)
                }
            }));
    }
}
