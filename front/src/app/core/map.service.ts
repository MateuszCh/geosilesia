import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GOOGLE_MAPS_URL } from './map.config';
import { MapCategory, MapMarker, MapStyleDefinition } from './map.types';
import { IconPost, MarkerPost } from '../models/post.model';

/** Promień Ziemi w km – do liczenia odległości wzorem haversine. */
const EARTH_RADIUS_KM = 6371;

/**
 * Port map.service.js. Logika (kategorie, odległości, markery, InfoWindow) została bez
 * zmian; różnice to leniwe ładowanie skryptu Google przez Promise zamiast odpytywania
 * co pół sekundy oraz InfoWindow budowane z węzłów DOM, nie ze sklejonego stringa.
 */
@Injectable({ providedIn: 'root' })
export class MapService {
    private readonly doc = inject(DOCUMENT);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    /** Sterują widocznością mapy i pola wyszukiwania w szablonie search-map. */
    readonly ready = signal(false);

    private loading: Promise<boolean> | null = null;

    /**
     * Skrypt Google ładujemy dopiero, gdy strona faktycznie zawiera mapę – to kilkaset
     * kilobajtów, których większość podstron nie potrzebuje.
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
                // Bez mapy strona ma nadal działać: lista wyników renderuje się z danych
                // z API, tylko bez podglądu i bez wyszukiwania po adresie.
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

    /** Wyszukana lokalizacja wchodzi na listę wyników jako pseudo-marker typu "home". */
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

    /** Odległość po wielkim okręgu (haversine) w kilometrach. */
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
        // Przy jednym wyniku fitBounds przybliżyłby maksymalnie – wtedy widać sam punkt
        // i nic wokół niego.
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
     * Dymek budowany z węzłów DOM, a nie ze sklejonego HTML-a: tytuły i odnośniki
     * pochodzą z CMS-a, więc wstawiane jako tekst nie mogą wykonać się jako znaczniki.
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
     * Kategorie bierzemy z postów typu "icon", ale zostawiamy tylko te, które ma
     * przynajmniej jeden marker – inaczej filtr pokazywałby puste pozycje.
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

    /** Spłaszcza posty typu "marker" do postaci używanej przez mapę i listę wyników. */
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
