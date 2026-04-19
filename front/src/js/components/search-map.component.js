(function () {
    angular.module('geosilesia').component('searchMap', {
        templateUrl: 'html/components/search-map.html',
        controllerAs: 'vm',
        controller: SearchMapController,
        bindings: {
            component: '<'
        }
    });

    SearchMapController.$inject = [
        '$q',
        '$document',
        '$element',
        'pwaService',
        'resourceService',
        'mapService',
        '$timeout'
    ];

    function SearchMapController(
        $q,
        $document,
        $element,
        pwaService,
        resourceService,
        mapService,
        $timeout
    ) {
        var vm = this;
        var searchQty;
        var searchForm = document.getElementById('search-form');
        var markers = [];
        var searchStatusTimeout;

        vm.$onInit = onInit;
        vm.searchStatus = {
            busy: false,
            message: ''
        };
        vm.category = 'all';
        vm.showSearch = false;
        vm.showMore = false;
        vm.searchInput = '';
        vm.currentResult = undefined;

        vm.dataLoaded = false;

        vm.search = search;
        vm.pickCategory = pickCategory;
        vm.toggleSearchPanel = toggleSearchPanel;
        vm.increaseSearchQty = increaseSearchQty;
        vm.setCurrentResult = setCurrentResult;
        vm.isGoogleMapsAdded = mapService.isGoogleMapsScriptAdded;

        function onInit() {
            if (pwaService.isAvailable()) {
                $q.all([
                    resourceService.loadModelsFromIDB('posts', 'marker'),
                    resourceService.loadModelsFromIDB('posts', 'icon')
                ]).then(function (posts) {
                    if (!vm.dataLoaded && posts[0] && posts[1]) {
                        onLoad(posts[0], posts[1]);
                    }
                });
            }
            $q.all([
                resourceService.loadModelsFromNetwork('posts', 'marker'),
                resourceService.loadModelsFromNetwork('posts', 'icon')
            ]).then(function (posts) {
                if (posts[0].data && posts[1].data) {
                    vm.dataLoaded = true;
                    mapService.loadGoogleMaps();
                    onLoad(posts[0].data, posts[1].data);
                }
            });
        }

        function onLoad(markerModels, iconModels) {
            vm.categories = mapService.getCategories(markerModels, iconModels);

            markers = mapService.getFormattedMarkers(markerModels);
            vm.markersCount = markers.length;
            vm.selectedMarkers = angular.copy(markers).sort(function (a, b) {
                return b.position.lat - a.position.lat;
            });
        }

        function toggleSearchPanel() {
            if (window.innerWidth > 849) {
                vm.showSearch = !vm.showSearch;
            } else if (vm.isGoogleMapsAdded) {
                $document.scrollToElementAnimated(searchForm);
            }
        }

        function search() {
            $timeout.cancel(searchStatusTimeout);
            vm.searchStatus.message = '';
            if (vm.searchInput) {
                vm.searchStatus.busy = true;
                mapService
                    .getCoordinates(vm.searchInput)
                    .then(function (result) {
                        searchQty = 11;
                        vm.category = '';
                        if (window.innerWidth < 850 && vm.isGoogleMapsAdded) {
                            $document.scrollToElementAnimated($element);
                        }

                        var location = mapService.getLocationDetails(result);

                        vm.markersSortedByDistance =
                            mapService.sortMarkersByDistance(
                                markers,
                                location.position.lat,
                                location.position.lng
                            );

                        vm.markersSortedByDistance.unshift(location);
                        nearestPlaces();
                        vm.showMore = true;
                        vm.currentResult = undefined;
                        vm.searchStatus.busy = false;
                    })
                    .catch(function (err) {
                        if (err === 'ZERO_RESULTS') {
                            vm.searchStatus.message =
                                'Lokalizacja nie została znaleziona';
                        }
                        vm.searchStatus.busy = false;
                        searchStatusTimeout = $timeout(function () {
                            vm.searchStatus.message = '';
                        }, 5000);
                    });
            } else {
                vm.searchStatus.message = 'Proszę wpisać lokalizację';
                searchStatusTimeout = $timeout(function () {
                    vm.searchStatus.message = '';
                }, 5000);
            }
        }

        function nearestPlaces() {
            vm.selectedMarkers = vm.markersSortedByDistance.slice(0, searchQty);
        }

        function increaseSearchQty() {
            searchQty = searchQty + 10;
            nearestPlaces();
            if (searchQty > vm.markersSortedByDistance.length) {
                vm.showMore = false;
            }
        }

        function pickCategory() {
            vm.showMore = false;
            vm.currentResult = undefined;
            var selectedMarkers = [];
            if (vm.category === 'all') {
                selectedMarkers = angular.copy(markers);
            } else {
                markers.forEach(function (marker) {
                    if (
                        marker.categories &&
                        marker.categories.length &&
                        marker.categories.indexOf(vm.category) > -1
                    ) {
                        selectedMarkers.push(marker);
                    }
                });
            }

            vm.selectedMarkers = selectedMarkers.sort(function (a, b) {
                return b.position.lat - a.position.lat;
            });
            if (window.innerWidth < 850 && vm.isGoogleMapsAdded) {
                $document.scrollToElementAnimated($element);
            }
        }

        function setCurrentResult(id) {
            vm.currentResult = vm.currentResult === id ? undefined : id;

            if (window.innerWidth < 850 && vm.isGoogleMapsAdded) {
                $document.scrollToElementAnimated($element);
            }
        }
    }
})();
