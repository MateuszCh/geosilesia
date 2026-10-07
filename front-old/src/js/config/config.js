(function() {
    angular.module('geosilesia').config([
        '$locationProvider',
        '$compileProvider',
        function($locationProvider, $compileProvider) {
            $locationProvider.hashPrefix('');
            $locationProvider.html5Mode(true);
            $compileProvider.debugInfoEnabled(false);
        }
    ]);
})();
