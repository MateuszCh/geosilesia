(function() {
    angular.module("geosilesia").component("header", {
        templateUrl: "html/components/header.html",
        controllerAs: "vm",
        controller: HeaderController
    });
    HeaderController.$inject = [
        "$location",
        "pwaService",
        "resourceService",
        "$scope",
        "$timeout"
    ];
    function HeaderController(
        $location,
        pwaService,
        resourceService,
        $scope,
        $timeout
    ) {
        var vm = this;
        vm.$onInit = onInit;
        vm.isActive = isActive;
        vm.toggleAsideNav = toggleAsideNav;
        var body = angular.element(document.getElementsByTagName("body"));
        vm.navigationLoaded = false;

        function onInit() {
            $scope.$on("$routeChangeStart", function() {
                toggleAsideNav(false);
                vm.hoverNavItem = false;
            });
            resourceService
                .loadModelsFromNetwork("posts", "navigation")
                .then(function(response) {
                    if (response.data) {
                        onLoad(response.data);
                    }
                })
                .catch(function() {
                    if (pwaService.isAvailable()) {
                        resourceService
                            .loadModelsFromIDB("posts", "navigation")
                            .then(onLoad);
                    }
                });
        }

        function onLoad(data) {
            if (data && data[0] && data[0].data && data[0].data.nav) {
                vm.nav = data[0].data.nav;
            }
        }

        function isActive(link, group) {
            var path = $location.path();
            if (link) {
                return link === path || path.indexOf(link + "/") === 0;
            }
            if (group && group.length) {
                var active = false;
                var i = 0;
                do {
                    if (group[i].link === path) {
                        active = true;
                    }
                    i += 1;
                } while (!active && i < group.length);
                return active;
            }
        }

        function toggleAsideNav(to) {
            var state = to === undefined ? !vm.asideOpen : to;
            body.toggleClass("aside-nav-open", state);
            vm.asideOpen = state;
            if (!to) {
                $timeout(function() {
                    vm.showSubNav = false;
                }, 500);
            }
        }
    }
})();
