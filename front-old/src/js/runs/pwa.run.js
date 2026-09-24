(function () {
    angular.module('geosilesia').run([
        'pwaService',
        'requestService',
        'resourceService',
        function (pwaService, requestService, resourceService) {
            if (pwaService.isAvailable()) {
                navigator.serviceWorker
                    .register('./sw.js')
                    .then(function (registration) {
                        registration.update();
                        // console.log("Service worker registered!");
                    })
                    .catch(function (err) {
                        // console.log(err);
                    });

                setTimeout(function () {
                    requestService.send('/api/appData', 'GET');
                }, 2000);
            }
        }
    ]);
})();
