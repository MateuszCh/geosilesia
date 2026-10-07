(function() {
    angular.module("geosilesia").component("tabs", {
        templateUrl: "html/components/tabs.html",
        controller: TabsController,
        controllerAs: "vm",
        bindings: {
            component: "<"
        }
    });

    function TabsController() {
        var vm = this;
        vm.activeTab = 0;
        vm.setTab = setTab;

        function setTab(tab) {
            vm.activeTab = tab;
        }
    }
})();
