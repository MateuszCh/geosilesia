(function () {
    angular.module('geosilesia').service('mapService', [
        'gmapConfig',
        '$q',
        function (gmapConfig, $q) {
            var _googleMapsScriptAdded = false;

            var _isLoading = false;

            function loadGoogleMaps() {
                if (!isGoogleMapsScriptAdded() && !_isLoading) {
                    _isLoading = true;
                    var script = document.createElement('script');
                    script.src =
                        'https://maps.googleapis.com/maps/api/js?key=' +
                        gmapConfig.key;
                    script.onerror = function () {
                        _googleMapsScriptAdded = false;
                    };
                    script.onload = function () {
                        // _googleMapsScriptAdded = true;
                        var markerClustererScript =
                            document.createElement('script');
                        markerClustererScript.src =
                            'https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js';
                        markerClustererScript.async = true;
                        markerClustererScript.onload = function () {
                            _googleMapsScriptAdded = true;
                        };
                        markerClustererScript.onerror = function () {
                            _googleMapsScriptAdded = true;
                        };
                        document
                            .getElementsByTagName('head')[0]
                            .appendChild(markerClustererScript);
                    };
                    document
                        .getElementsByTagName('head')[0]
                        .appendChild(script);
                }
            }

            function isGoogleMapsScriptAdded() {
                return _googleMapsScriptAdded;
            }

            function isGoogleMapsLoaded() {
                return (
                    angular.isDefined(window.google) &&
                    angular.isDefined(window.google.maps)
                );
            }

            function getCoordinates(input) {
                var q = $q.defer();
                var geocoder = new google.maps.Geocoder();
                geocoder.geocode(
                    { address: input },
                    function (results, status) {
                        if (status === 'OK') {
                            q.resolve(results[0]);
                        } else {
                            q.reject(status);
                        }
                    }
                );
                return q.promise;
            }

            function getLocationDetails(address) {
                return {
                    position: {
                        lat: parseFloat(
                            address.geometry.location.lat().toFixed(8)
                        ),
                        lng: parseFloat(
                            address.geometry.location.lng().toFixed(8)
                        )
                    },
                    address: address.formatted_address,
                    type: 'home',
                    id: 0
                };
            }

            function sortMarkersByDistance(markers, lat, lng) {
                return setDistance(markers, lat, lng).sort(function (a, b) {
                    return a.distance - b.distance;
                });
            }

            function setDistance(markers, lat, lng) {
                return markers.map(function (marker) {
                    marker.distance = getDistance(
                        lat,
                        lng,
                        marker.position.lat,
                        marker.position.lng
                    );
                    return marker;
                });
            }

            function getDistance(lat1, lng1, lat2, lng2) {
                function deg2rad(deg) {
                    return deg * (Math.PI / 180);
                }
                var R = 6371;
                var dLat = deg2rad(lat2 - lat1);
                var dLng = deg2rad(lng2 - lng1);
                var a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(deg2rad(lat1)) *
                        Math.cos(deg2rad(lat2)) *
                        Math.sin(dLng / 2) *
                        Math.sin(dLng / 2);
                var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }

            function createMap(element, mapOptions, mapStyleOptions) {
                var map = new google.maps.Map(element, mapOptions);
                map.mapTypes.set(
                    'styled_map',
                    new google.maps.StyledMapType(
                        mapStyleOptions.style,
                        mapStyleOptions.name
                    )
                );
                return map;
            }

            function deleteMarkers(markers) {
                markers.forEach(function (marker) {
                    marker.setMap(null);
                });
            }

            function setBounds(markers, map) {
                var bounds = new google.maps.LatLngBounds();
                markers.forEach(function (marker) {
                    bounds.extend(marker.getPosition());
                });
                // if (bounds.b.f < bounds.b.b) {
                //     var longitude1 = bounds.b.f;
                //     bounds.b.f = bounds.b.b;
                //     bounds.b.b = longitude1;
                // }
                map.fitBounds(bounds);
                if (markers.length === 1) {
                    map.setZoom(16);
                }
            }

            function createMarkers(
                markersModels,
                categories,
                map,
                activeCategory
            ) {
                var infowindow = new google.maps.InfoWindow();
                var markers = [];
                markersModels.forEach(function (markerModel) {
                    if (
                        !(
                            markerModel.position.lat &&
                            markerModel.position.lng &&
                            (markerModel.title || markerModel.type)
                        )
                    ) {
                        return;
                    }
                    var latitude = Number(markerModel.position.lat);
                    var longitude = Number(markerModel.position.lng);
                    var position = { lat: latitude, lng: longitude };

                    var icon;

                    if (
                        markerModel.type ||
                        !markerModel.categories ||
                        !markerModel.categories.length
                    ) {
                        icon = '';
                    } else if (!activeCategory || activeCategory === 'all') {
                        icon = categories[markerModel.categories[0]].icon;
                    } else {
                        icon = categories[activeCategory].icon;
                    }
                    var marker = new google.maps.Marker({
                        position: position,
                        map: map,
                        title: markerModel.title || '',
                        icon: icon,
                        id: markerModel.id
                    });
                    google.maps.event.addListener(
                        marker,
                        'click',
                        (function (marker) {
                            return function () {
                                if (markerModel.type === 'home') {
                                    infowindow.setContent(
                                        "<div class='marker-description'>" +
                                            "<p class='marker-description__text'>" +
                                            markerModel.address +
                                            '</p>' +
                                            "<p class='marker-description__text'>" +
                                            markerModel.position.lat +
                                            ', ' +
                                            markerModel.position.lng +
                                            '</p>' +
                                            '</div>'
                                    );
                                } else {
                                    infowindow.setContent(
                                        "<div class='marker-description'>" +
                                            "<p class='marker-description__text'>" +
                                            markerModel.title +
                                            '</p>' +
                                            "<p class='marker-description__text'>" +
                                            markerModel.position.lat +
                                            ', ' +
                                            markerModel.position.lng +
                                            '</p>' +
                                            (markerModel.distance
                                                ? "<p class='marker-description__text'>Odległość: " +
                                                  markerModel.distance.toFixed(
                                                      2
                                                  ) +
                                                  ' km</p>'
                                                : '') +
                                            (markerModel.hyperlink
                                                ? '<a href=' +
                                                  markerModel.hyperlink +
                                                  " target='_blank'>Więcej</a>"
                                                : '') +
                                            '</div>'
                                    );
                                }
                                infowindow.open(map, marker);
                            };
                        })(marker)
                    );
                    markers.push(marker);
                });
                return markers;
            }

            function getCategories(markerModels, iconModels) {
                if (
                    !markerModels ||
                    !iconModels ||
                    !markerModels.length ||
                    !iconModels.length
                ) {
                    return [];
                }

                var allowedCategories = {};

                markerModels.forEach(function (markerModel) {
                    if (
                        markerModel.data &&
                        markerModel.data.categories &&
                        markerModel.data.categories.length
                    ) {
                        markerModel.data.categories.forEach(function (
                            categoryName
                        ) {
                            if (allowedCategories[categoryName]) {
                                allowedCategories[categoryName]++;
                            } else {
                                allowedCategories[categoryName] = 1;
                            }
                        });
                    }
                });

                var categories = {};
                iconModels.forEach(function (iconModel) {
                    if (
                        iconModel.data &&
                        iconModel.data.category &&
                        allowedCategories[iconModel.data.category]
                    ) {
                        var newCategory = iconModel.data;
                        newCategory.id = iconModel.id;
                        newCategory.count =
                            allowedCategories[iconModel.data.category];
                        categories[newCategory.category] = newCategory;
                    }
                });
                return categories;
            }

            function getFormattedMarkers(markerModels) {
                if (!markerModels || !markerModels.length) {
                    return [];
                }

                return markerModels
                    .filter(function (marker) {
                        return (
                            marker.title &&
                            marker.data &&
                            marker.data.lat &&
                            marker.data.long
                        );
                    })
                    .map(function (marker) {
                        return {
                            title: marker.title,
                            hyperlink: marker.data.link,
                            place: marker.data.place,
                            categories: marker.data.categories,
                            id: marker.id,
                            position: {
                                lat: marker.data.lat,
                                lng: marker.data.long
                            }
                        };
                    });
            }

            return {
                loadGoogleMaps: loadGoogleMaps,
                isGoogleMapsLoaded: isGoogleMapsLoaded,
                isGoogleMapsScriptAdded: isGoogleMapsScriptAdded,
                getCoordinates: getCoordinates,
                getLocationDetails: getLocationDetails,
                sortMarkersByDistance: sortMarkersByDistance,
                createMap: createMap,
                deleteMarkers: deleteMarkers,
                setBounds: setBounds,
                createMarkers: createMarkers,
                getCategories: getCategories,
                getFormattedMarkers: getFormattedMarkers
            };
        }
    ]);
})();
