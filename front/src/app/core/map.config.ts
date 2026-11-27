/**
 * Google Maps key. It is a browser key, so public by nature – it is protected by the
 * domain restriction in the Google console, not by hiding it in the code.
 */
export const GOOGLE_MAPS_KEY = 'AIzaSyAmB631kh-m9oK9PL_i4OEmvkRqjcdeWzg';

/** Global function the Maps script calls once its bootstrap is in (`callback`). */
export const GOOGLE_MAPS_CALLBACK = 'geosilesiaMapsLoaded';

/** `loading=async`: the script loads its libraries on demand instead of in one blocking
    bootstrap (Google warns in the console without it). The classes then come from
    importLibrary – see MapService.loadGoogleMaps. */
export const GOOGLE_MAPS_URL = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&loading=async&callback=${GOOGLE_MAPS_CALLBACK}`;

/** Centre of the Silesian Voivodeship – the initial map view. */
export const MAP_CENTER = { lat: 50.277978, lng: 19.020544 };
export const MAP_ZOOM = 9;
