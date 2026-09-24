(function () {
    angular.module('geosilesia').service('pwaService', function () {
        var dbPromise = idb.open('geosilesia', 1, function (db) {
            if (!db.objectStoreNames.contains('pages')) {
                db.createObjectStore('pages', { keyPath: 'pageUrl' });
            }
            if (!db.objectStoreNames.contains('posts')) {
                var postsStore = db.createObjectStore('posts', {
                    keyPath: 'id'
                });
                postsStore.createIndex('type', 'type', {
                    unique: false
                });
            }
        });

        function getPage(url) {
            return dbPromise.then(function (db) {
                return db
                    .transaction('pages', 'readonly')
                    .objectStore('pages')
                    .get(url);
            });
        }

        function getPosts(type) {
            var range = IDBKeyRange.only(type);
            var posts = [];
            return dbPromise
                .then(function (db) {
                    var tx = db.transaction('posts', 'readonly');
                    var store = tx.objectStore('posts');
                    var index = store.index('type');
                    return index.openCursor(range);
                })
                .then(function showRange(cursor) {
                    if (!cursor) {
                        return;
                    }
                    posts.push(cursor.value);
                    return cursor.continue().then(showRange);
                })
                .then(function () {
                    return posts;
                });
        }

        function isAvailable() {
            return 'serviceWorker' in navigator && 'indexedDB' in window;
        }

        return {
            isAvailable: isAvailable,
            getPage: getPage,
            getPosts: getPosts
        };
    });
})();
