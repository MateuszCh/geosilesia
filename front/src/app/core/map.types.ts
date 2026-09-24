/** Typy wspólne dla serwisu mapy i komponentów, które z niej korzystają. */

export interface MapStyleDefinition {
    style: google.maps.MapTypeStyle[];
    name: google.maps.StyledMapTypeOptions;
}

export interface MapPosition {
    lat: number;
    lng: number;
}

/** Marker w postaci, w jakiej używa go widok – po spłaszczeniu posta z API. */
export interface MapMarker {
    id: string | number;
    title?: string;
    hyperlink?: string;
    place?: string;
    categories?: string[];
    position: MapPosition;
    /** Wypełniane po wyszukaniu lokalizacji, w kilometrach. */
    distance?: number;
    /** "home" oznacza wskazany przez użytkownika punkt wyszukiwania, nie atrakcję. */
    type?: 'home';
    address?: string;
}

export interface MapCategory {
    id: string | number;
    category: string;
    name?: string;
    icon?: string;
    /** Ile markerów należy do kategorii – pokazywane przy nazwie na liście filtrów. */
    count: number;
}
