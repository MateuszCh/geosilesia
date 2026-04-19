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
                if (vm.markerCluster && window.markerClusterer) {
                    markerCluster = new markerClusterer.MarkerClusterer({
                        map: map,
                        markers: markers,
                        algorithm: new markerClusterer.SuperClusterAlgorithm({
                            radius: 120,
                            maxZoom: 15
                        }),
                        renderer: {
                            render: function (i) {
                                var length = i.markers.length;
                                return new google.maps.Marker({
                                    position: i.position,
                                    label: {
                                        text: i.count.toString(),
                                        color: 'white',
                                        fontSize: '12px'
                                    },
                                    icon: {
                                        url: getMarkerClustererImage(length),
                                        scaledSize: new google.maps.Size(60, 60)
                                    },
                                    zIndex:
                                        Number(google.maps.Marker.MAX_ZINDEX) +
                                        i.count
                                });
                            }
                        }
                    });
                }
                mapService.setBounds(markers, map);
            }
        }

        function getMarkerClustererImage(length) {
            switch (true) {
                case length < 10:
                    return '/images/markers/1.png';
                case length < 100:
                    return '/images/markers/2.png';
                case length < 1000:
                    return '/images/markers/3.png';
                default:
                    return '/images/markers/4.png';
            }
        }
    }
})();
