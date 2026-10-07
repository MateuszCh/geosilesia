/** Types shared by the map service and the components that use it. */

export interface MapStyleDefinition {
    style: google.maps.MapTypeStyle[];
    name: google.maps.StyledMapTypeOptions;
}

export interface MapPosition {
    lat: number;
    lng: number;
}

/** A marker in the shape the view uses – after flattening the post from the API. */
export interface MapMarker {
    id: string | number;
    title?: string;
    hyperlink?: string;
    place?: string;
    categories?: string[];
    position: MapPosition;
    /** Filled in after a location search, in kilometres. */
    distance?: number;
    /** "home" marks the search point chosen by the user, not an attraction. */
    type?: 'home';
    address?: string;
}

export interface MapCategory {
    id: string | number;
    category: string;
    name?: string;
    icon?: string;
    /** How many markers belong to the category – shown next to its name in the filter list. */
    count: number;
}
