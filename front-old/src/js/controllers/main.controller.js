(function() {
    angular.module("geosilesia").controller("MainController", [
        "$window",
        "$rootScope",
        "$scope",
        function($window, $rootScope, $scope) {
            var body = angular.element(document.getElementsByTagName("body"));

            $rootScope.$on("$routeChangeSuccess", function() {
                $window.scrollTo(0, 0);
                body.removeClass("closedScroll");
            });
            window.setTimeout(function() {
                document.addEventListener("scroll", function() {
                    $scope.scrolled = window.scrollY > 0;
                    $scope.$apply();
                });
                $scope.scrolled = window.scrollY > 0;
                $scope.$apply();
            }, 1000);
        }
    ]);
})();
