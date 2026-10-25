import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GOOGLE_MAPS_URL } from './map.config';
import { MapCategory, MapMarker, MapStyleDefinition } from './map.types';
import { IconPost, MarkerPost } from '../models/post.model';
import { NEUTRAL_COLOR, categoryLook } from './categories';

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
        activeCategories: string[],
        onSelect: (id: string | number) => void
    ): google.maps.Marker[] {
        const byKey = new Map(categories.map(category => [category.category, category]));
        const markers: google.maps.Marker[] = [];

        models.forEach(model => {
            if (
                !model.position?.lat ||
                !model.position?.lng ||
                !(model.title || model.type)
            ) {
                return;
            }
            const color = model.type === 'home' ? '#1e4d2f' : markerColor(model, byKey, activeCategories);
            const marker = new google.maps.Marker({
                position: {
                    lat: Number(model.position.lat),
                    lng: Number(model.position.lng)
                },
                map,
                title: model.title ?? model.address ?? '',
                icon: this.pinIcon(color, model.type === 'home' ? 20 : 26),
                zIndex: model.type === 'home' ? 1000 : undefined
            });
            marker.set('id', model.id);
            marker.set('color', color);
            if (model.type !== 'home') {
                marker.addListener('click', () => onSelect(model.id));
            }
            markers.push(marker);
        });

        return markers;
    }

    /** A pin of the design system: a category-coloured disc with a white ring. */
    pinIcon(color: string, size: number): google.maps.Icon {
        const ring = size >= 26 ? 3 : 2.5;
        const r = size / 2;
        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 4}" height="${size + 4}" viewBox="0 0 ${size + 4} ${size + 4}">` +
            `<circle cx="${r + 2}" cy="${r + 3}" r="${r}" fill="#18201b" opacity="0.25"/>` +
            `<circle cx="${r + 2}" cy="${r + 2}" r="${r - ring / 2}" fill="${color}" stroke="#ffffff" stroke-width="${ring}"/>` +
            '</svg>';
        return {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
            scaledSize: new google.maps.Size(size + 4, size + 4),
            anchor: new google.maps.Point(r + 2, r + 2)
        };
    }

    /** A cluster: a trail-red disc with the count, sized by the number of places. */
    clusterIcon(count: number): google.maps.Icon {
        const size = count < 10 ? 38 : count < 100 ? 46 : count < 1000 ? 56 : 64;
        const r = size / 2;
        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 4}" height="${size + 4}" viewBox="0 0 ${size + 4} ${size + 4}">` +
            `<circle cx="${r + 2}" cy="${r + 3}" r="${r}" fill="#18201b" opacity="0.25"/>` +
            `<circle cx="${r + 2}" cy="${r + 2}" r="${r - 1.5}" fill="#c8202a" stroke="#ffffff" stroke-width="3"/>` +
            '</svg>';
        return {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
            scaledSize: new google.maps.Size(size + 4, size + 4),
            anchor: new google.maps.Point(r + 2, r + 2)
        };
    }

    /**
     * The object card shown over the selected pin. Built from DOM nodes, not from
     * concatenated HTML: titles and links come from the CMS, so inserted as text they
     * cannot execute as markup.
     */
    objectCard(model: MapMarker, category: MapCategory | undefined): HTMLElement {
        const el = (tag: string, className: string, text?: string): HTMLElement => {
            const node = this.doc.createElement(tag);
            node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        };

        const card = el('div', 'object-card');
        if (model.image) {
            const image = el('img', 'object-card__image') as HTMLImageElement;
            image.src = model.image;
            image.alt = '';
            card.appendChild(image);
        }
        const body = el('div', 'object-card__body');
        card.appendChild(body);

        const tagLine = [category?.name, model.top50 ? `TOP 50 nr ${model.top50}` : '']
            .filter(Boolean)
            .join(' · ');
        if (tagLine) {
            const tag = el('span', 'object-card__tag');
            const mark = el('span', 'trail-mark trail-mark--xs');
            mark.setAttribute('aria-hidden', 'true');
            mark.style.setProperty('--mark', category?.color ?? NEUTRAL_COLOR);
            tag.append(mark, this.doc.createTextNode(tagLine));
            tag.style.color = category?.color === '#f2c200' ? '#18201b' : (category?.color ?? '');
            body.appendChild(tag);
        }
        body.appendChild(el('span', 'object-card__title', model.title ?? ''));

        const meta = [
            model.rock,
            model.place,
            model.distance !== undefined ? `${formatKm(model.distance)} km` : ''
        ]
            .filter(Boolean)
            .join(' · ');
        if (meta) body.appendChild(el('span', 'object-card__meta', meta));

        const actions = el('div', 'object-card__actions');
        if (model.hyperlink) {
            const details = el('a', 'btn btn--primary', 'Szczegóły') as HTMLAnchorElement;
            details.href = model.hyperlink;
            details.target = '_blank';
            details.rel = 'noreferrer';
            actions.appendChild(details);
        }
        const directions = el('a', 'btn btn--secondary', 'Dojazd ↗') as HTMLAnchorElement;
        directions.href = directionsUrl(model);
        directions.target = '_blank';
        directions.rel = 'noreferrer';
        actions.appendChild(directions);
        body.appendChild(actions);
        return card;
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

        // Icons without a numeric position go last.
        return [...icons]
            .sort((a, b) => getIconPosition(a) - getIconPosition(b))
            .filter(icon => icon.data?.category && counts.has(icon.data.category))
            .map(icon => ({
                id: icon.id,
                category: icon.data.category!,
                name: icon.data.name,
                icon: icon.data.icon,
                count: counts.get(icon.data.category!)!,
                color: categoryLook(icon.data).color,
                shortName: shortCategoryName(icon.data.name ?? icon.data.category!)
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
                },
                rock: marker.data.rock || undefined,
                image: marker.data.image || undefined,
                top50: Number(marker.data.top50) || undefined
            }));
    }
}

/** Distance with a decimal comma: "9,8". */
export function formatKm(km: number): string {
    return km.toFixed(1).replace('.', ',');
}

/** Google Maps route to the place from wherever the user is. */
export function directionsUrl(model: MapMarker): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${model.position.lat},${model.position.lng}`;
}

/** "Obiekty geologiczne" → "Geologiczne"; other names stay as they are. */
function shortCategoryName(name: string): string {
    const short = name.replace(/^obiekty\s+/i, '');
    return short.charAt(0).toLocaleUpperCase('pl') + short.slice(1);
}

/** Colour of a marker: its first category in the filter, else its first category. */
export function markerColor(
    model: MapMarker,
    byKey: Map<string, MapCategory>,
    activeCategories: string[]
): string {
    const key =
        model.categories?.find(category => activeCategories.includes(category)) ??
        model.categories?.[0];
    return (key && byKey.get(key)?.color) || NEUTRAL_COLOR;
}

function getIconPosition(icon: IconPost): number {
    const position = icon.data?.position;
    return typeof position === 'number' && Number.isFinite(position) ? position : Infinity;
}
