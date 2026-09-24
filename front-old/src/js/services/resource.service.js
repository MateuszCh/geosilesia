(function() {
    angular.module("geosilesia").service("resourceService", [
        "requestService",
        "pwaService",
        function(requestService, pwaService) {
            var _loadedModels = {
                page: {},
                posts: {}
            };

            function getLoadedModels(resourceType, key) {
                return (
                    _loadedModels[resourceType] &&
                    _loadedModels[resourceType][key]
                );
            }

            function setLoadedModels(resourceType, key, models) {
                _loadedModels[resourceType][key] = models;
            }

            function loadModelsFromIDB(resourceType, key) {
                if (resourceType === "page") {
                    return pwaService.getPage(key);
                } else if (resourceType === "posts") {
                    return pwaService.getPosts(key);
                }
            }

            function loadModelsFromNetwork(resourceType, key) {
                var formattedKey =
                    resourceType === "page" ? key.replace(/\//g, "%2F") : key;
                return requestService.send(
                    "/api/" + resourceType + "/" + formattedKey,
                    "GET"
                );
            }

            return {
                getLoadedModels: getLoadedModels,
                setLoadedModels: setLoadedModels,
                loadModelsFromIDB: loadModelsFromIDB,
                loadModelsFromNetwork: loadModelsFromNetwork
            };
        }
    ]);
})();
