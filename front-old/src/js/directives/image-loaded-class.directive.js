(function() {
    angular.module("geosilesia").directive("imageLoaded", function() {
        return {
            restrict: "A",
            link: link,
            scope: {
                loadClass: "@"
            }
        };
        function link(scope, element) {
            if (scope.loadClass) {
                var img = element.find("img");
                img.bind("load", function() {
                    element.addClass(scope.loadClass);
                });
            }
        }
    });
})();
