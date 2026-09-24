(function() {
    angular.module("geosilesia").component("carousel", {
        templateUrl: "html/components/carousel.html",
        controllerAs: "vm",
        controller: CarouselController,
        bindings: {
            slides: "<",
            custom: "<",
            interval: "@"
        }
    });

    CarouselController.$inject = ["$interval"];
    function CarouselController($interval) {
        var vm = this;
        vm.$onInit = onInit;
        vm.next = next;
        vm.prev = prev;
        vm.goTo = goTo;
        vm.swipeTo = swipeTo;
        vm.setInt = setInt;
        vm.cancelInt = cancelInt;
        vm.currentSlide = currentSlide;
        var interval = undefined;
        var numberOfSlides = 0;

        vm.left = 0;

        function onInit() {
            numberOfSlides = vm.slides.length;
            vm.maxLeft = (numberOfSlides - 1) * -100;
            setInt();
        }

        function currentSlide() {
            return -vm.left / 100;
        }

        function goTo(index) {
            if (vm.left !== index * -100) {
                vm.left = index * -100;
            }
        }

        function swipeTo(index) {
            cancelInt();
            var target = undefined;
            if (index < 0) {
                target = numberOfSlides - 1;
            } else if (index >= numberOfSlides) {
                target = 0;
            } else {
                target = index;
            }
            goTo(target);
            setInt();
        }

        function setInt() {
            if (
                vm.slides &&
                numberOfSlides > 1 &&
                vm.interval &&
                parseInt(vm.interval)
            ) {
                interval = $interval(next, parseInt(vm.interval) * 1000);
            }
        }

        function cancelInt() {
            if (interval) $interval.cancel(interval);
        }

        function next() {
            if (vm.left === vm.maxLeft) {
                vm.left = 0;
            } else {
                vm.left -= 100;
            }
        }
        function prev() {
            if (vm.left !== 0) {
                vm.left += 100;
            } else {
                vm.left = vm.maxLeft;
            }
        }
    }
})();
