(function () {
    angular.module('geosilesia').component('map', {
        bindings: {
            markersModels: '<',
            currentResult: '<',
            markerCluster: '<',
            categories: '<',
            activeCategory: '@'
        },
        controllerAs: 'vm',
        controller: MapController,
        template: '<div class="search__container__map"></div>'
    });

    MapController.$inject = ['$timeout', '$element', 'mapStyle', 'mapService'];
    function MapController($timeout, $element, mapStyle, mapService) {
        var vm = this;
        vm.$onInit = onInit;
        vm.$onChanges = onChanges;
        var map,
            markerCluster,
            markers = [];

        function onInit() {
            initMap();
        }

        var mapContainer = $element[0].firstChild;

        function onChanges(changes) {
            if (map) {
                if (
                    changes.markersModels &&
                    changes.markersModels.currentValue
                ) {
                    updateMap();
                }
                if (
                    changes.currentResult &&
                    changes.currentResult.currentValue !== undefined
                ) {
                    if (markers && markers.length) {
                        var resultMarkerArray = markers.filter(function (
                            marker
                        ) {
                            return (
                                marker.id == changes.currentResult.currentValue
                            );
                        });

                        if (resultMarkerArray && resultMarkerArray.length) {
                            map.setZoom(18);
                            map.panTo(resultMarkerArray[0].position);
                            google.maps.event.trigger(
                                resultMarkerArray[0],
                                'click'
                            );
                        }
                    }
                }
            }
        }

        function initMap() {
            if (mapService.isGoogleMapsLoaded()) {
                var mapOptions = {
                    center: {
                        lat: 50.277978,
                        lng: 19.020544
                    },
                    zoom: 9,
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
                };

                var mapStyleOptions = {
                    style: mapStyle.style,
                    name: mapStyle.name
                };

                map = mapService.createMap(
                    mapContainer,
                    mapOptions,
                    mapStyleOptions
                );

                updateMap();
                return;
            }
            $timeout(initMap, 500);
        }

        function updateMap() {
            if (vm.markersModels) {
                if (markers.length) {
                    mapService.deleteMarkers(markers);
                }

                markers = mapService.createMarkers(
                    vm.markersModels,
                    vm.categories,
                    map,
                    vm.activeCategory
                );

                if (markerCluster) {
                    markerCluster.clearMarkers();
                }
                // if (vm.markerCluster) {
                //     markerCluster = new MarkerClusterer(map, markers, {
                //         imagePath: "images/markers/"
                //     });
                // }
                mapService.setBounds(markers, map);
            }
        }
    }
})();
