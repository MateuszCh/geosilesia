/**
 * Klucz Google Maps. Jest przeglądarkowy, więc z natury publiczny – ochroną jest
 * ograniczenie domen po stronie konsoli Google, nie ukrywanie go w kodzie.
 */
export const GOOGLE_MAPS_KEY = 'AIzaSyAmB631kh-m9oK9PL_i4OEmvkRqjcdeWzg';

export const GOOGLE_MAPS_URL = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}`;

/** Środek województwa śląskiego – widok początkowy mapy. */
export const MAP_CENTER = { lat: 50.277978, lng: 19.020544 };
export const MAP_ZOOM = 9;
