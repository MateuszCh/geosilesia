(function() {
    angular.module("geosilesia").component("galleryList", {
        templateUrl: "html/components/gallery-list.html",
        controller: GalleryListController,
        controllerAs: "vm",
        bindings: {
            component: "<"
        }
    });

    GalleryListController.$inject = ["$timeout"];
    function GalleryListController($timeout) {
        var vm = this;
        vm.$onInit = onInit;
        vm.selectedCategory = "wszystkie";
        vm.changeCategory = changeCategory;
        var timer;

        function onInit() {
            setCategories(vm.component.galleries);
        }

        function setCategories(galleries) {
            var categories = galleries.map(function(gallery) {
                return gallery.category;
            });
            categories = categories.filter(function(value, index, self) {
                return self.indexOf(value) === index;
            });
            categories.push("wszystkie");
            vm.categories = categories;
        }

        function changeCategory(category) {
            if (vm.selectedCategory !== category) {
                $timeout.cancel(timer);
                vm.selectedCategory = undefined;
                timer = $timeout(function() {
                    vm.selectedCategory = category;
                }, 300);
            }
        }
    }
})();
