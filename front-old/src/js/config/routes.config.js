(function() {
    angular.module("geosilesia").config([
        "$routeProvider",
        function($routeProvider) {
            var originalWhen = $routeProvider.when;

            $routeProvider.when = function(path, route) {
                route.resolve || (route.resolve = {});
                angular.extend(route.resolve, {
                    page: [
                        "$route",
                        "$q",
                        "pwaService",
                        "resourceService",
                        function($route, $q, pwaService, resourceService) {
                            var url = $route.current.params.page || "/";
                            if (url === "index.html") url = "/";

                            function loadFromNetwork(resolve) {
                                resourceService
                                    .loadModelsFromNetwork("page", url)
                                    .then(function(response) {
                                        if (
                                            response.data &&
                                            response.data.pages &&
                                            response.data.pages[0]
                                        ) {
                                            resolve(response.data.pages[0]);
                                        } else {
                                            resolve();
                                        }
                                    })
                                    .catch(function() {
                                        resolve();
                                    });
                            }

                            return $q(function(resolve, reject) {
                                if (pwaService.isAvailable()) {
                                    resourceService
                                        .loadModelsFromIDB("page", url)
                                        .then(function(response) {
                                            if (response) {
                                                resolve(response);
                                            } else {
                                                loadFromNetwork(resolve);
                                            }
                                        });
                                } else {
                                    loadFromNetwork(resolve);
                                }
                            });
                        }
                    ]
                });
                return originalWhen.call($routeProvider, path, route);
            };

            $routeProvider
                .when("/", {
                    template: '<page-view page="page"></page-view>',
                    controller: [
                        "page",
                        "$scope",
                        function(page, $scope) {
                            $scope.page = page;
                        }
                    ]
                })
                .when("/:page*", {
                    template: '<page-view page="page"></page-view>',
                    controller: [
                        "page",
                        "$scope",
                        function(page, $scope) {
                            $scope.page = page;
                        }
                    ]
                });
        }
    ]);
})();
