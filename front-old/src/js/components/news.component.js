(function() {
    angular.module("geosilesia").component("news", {
        templateUrl: "html/components/news.html",
        controllerAs: "vm",
        controller: NewsController,
        bindings: {
            component: "<"
        }
    });

    NewsController.$inject = ["pwaService", "resourceService"];
    function NewsController(pwaService, resourceService) {
        var vm = this;
        vm.newsLoaded = false;
        vm.$onInit = onInit;
        function onInit() {
            if (pwaService.isAvailable()) {
                resourceService
                    .loadModelsFromIDB("posts", "wydarzenie")
                    .then(function(events) {
                        if (!vm.newsLoaded && events) {
                            prepareEvents(events);
                        }
                    });
            }
            resourceService
                .loadModelsFromNetwork("posts", "wydarzenie")
                .then(function(response) {
                    if (response.data && response.data.length) {
                        vm.newsLoaded = true;
                        prepareEvents(response.data);
                    }
                });
        }

        function prepareEvents(events) {
            var now = new Date().getTime();
            vm.events = events
                .filter(function(event) {
                    if (!event.data.date_of_publication) {
                        return false;
                    }
                    var dateOfPublication = new Date(
                        event.data.date_of_publication
                    ).getTime();
                    return dateOfPublication < now;
                })
                .sort(function(a, b) {
                    return b.created - a.created;
                });
        }
    }
})();
