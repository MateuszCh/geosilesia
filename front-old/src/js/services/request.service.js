(function() {
    angular.module("geosilesia").service("requestService", [
        "$http",
        function($http) {
            function send(url, method, data) {
                var settings = {
                    method: method,
                    data: data,
                    withCredentials: true,
                    url: url
                };
                if (method === "POST") {
                    settings.headers = {
                        "Content-Type": "application/json"
                    };
                }
                return $http(settings);
            }

            return {
                send: send
            };
        }
    ]);
})();
