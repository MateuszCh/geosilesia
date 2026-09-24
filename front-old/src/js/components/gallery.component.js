(function() {
    angular.module("geosilesia").component("gallery", {
        templateUrl: "html/components/gallery.html",
        controllerAs: "vm",
        controller: GalleryController,
        bindings: {
            component: "<"
        }
    });

    GalleryController.$inject = ["$timeout"];

    function GalleryController($timeout) {
        var vm = this;
        var body = angular.element(document.getElementsByTagName("body"));
        vm.$onInit = onInit;
        vm.$onDestroy = onDestroy;
        vm.openFullMode = openFullMode;
        vm.closeFullScreenMode = closeFullScreenMode;
        vm.next = next;
        vm.prev = prev;
        vm.showFullMode = false;

        function onInit() {
            vm.images = vm.component.catalogue;
            vm.numberOfImages = vm.images.length;
        }

        function onDestroy() {
            window.removeEventListener("keydown", setKeyEvent);
        }

        function setKeyEvent(e) {
            if (e.defaultPrevented) {
                return;
            }
            switch (e.key) {
                case "ArrowLeft":
                    prev();
                    break;
                case "ArrowRight":
                    next();
                    break;
                case "Escape":
                    closeFullScreenMode();
                    break;
                default:
                    return;
            }
        }

        function openFullMode(img) {
            window.addEventListener("keydown", setKeyEvent);
            vm.noMove = true;
            vm.currentImage = img;
            vm.nextImage = vm.currentImage + 1;
            vm.prevImage = vm.currentImage - 1;
            vm.show = true;
            body.addClass("closedScroll");
        }

        function closeFullScreenMode() {
            window.removeEventListener("keydown", setKeyEvent);
            body.removeClass("closedScroll");
            $timeout(function() {
                vm.show = false;
            }, 0);

            $timeout(function() {
                vm.currentImage = undefined;
                vm.nextImage = undefined;
                vm.prevImage = undefined;
            }, 500);
        }

        function next() {
            vm.back = false;
            $timeout(function() {
                vm.noMove = false;
                if (vm.currentImage + 1 === vm.numberOfImages) {
                    vm.currentImage = 0;
                    vm.nextImage = 1;
                    vm.prevImage = vm.numberOfImages - 1;
                } else {
                    vm.currentImage++;
                    if (vm.currentImage + 1 === vm.numberOfImages) {
                        vm.nextImage = 0;
                        vm.prevImage = vm.numberOfImages - 2;
                    } else {
                        vm.nextImage = vm.currentImage + 1;
                        vm.prevImage = vm.currentImage - 1;
                    }
                }
            }, 100);
        }

        function prev() {
            vm.back = true;
            vm.noMove = true;
            $timeout(function() {
                vm.noMove = false;
                if (vm.currentImage === 0) {
                    vm.currentImage = vm.numberOfImages - 1;
                    vm.nextImage = 0;
                    vm.prevImage = vm.currentImage - 1;
                } else {
                    vm.currentImage--;
                    if (vm.currentImage === 0) {
                        vm.nextImage = 1;
                        vm.prevImage = vm.numberOfImages - 1;
                    } else {
                        vm.nextImage = vm.currentImage + 1;
                        vm.prevImage = vm.currentImage - 1;
                    }
                }
            }, 100);
        }
    }
})();
