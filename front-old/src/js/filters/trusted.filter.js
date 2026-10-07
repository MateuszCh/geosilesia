(function() {
    angular.module("geosilesia").filter("trusted", [
        "$sce",
        function($sce) {
            return function(html) {
                if (!html || typeof html !== "string") {
                    return html;
                }
                return $sce.trustAsHtml(html);
            };
        }
    ]);
})();
