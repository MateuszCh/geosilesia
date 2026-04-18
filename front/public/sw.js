importScripts('/js/idb.js');

var CACHE_STATIC_NAME = 'static-v20';
var CACHE_DYNAMIC_NAME = 'dynamic-v20';
var STATIC_FILES = [
    '/',
    'index.html',
    '/css/main.css',
    '/js/app.min.js',
    '/js/libs.min.js',
    '/js/idb.js',
    'manifest.json',
    '/html/components/carousel.html',
    '/html/components/dictionary.html',
    '/html/components/footnotes.html',
    '/html/components/gallery-list.html',
    '/html/components/gallery.html',
    '/html/components/geosites-logos.html',
    '/html/components/header.html',
    '/html/components/heading.html',
    '/html/components/homepage-banner.html',
    '/html/components/literature.html',
    '/html/components/marker-category-list.html',
    '/html/components/news.html',
    '/html/components/page-view.html',
    '/html/components/search-map.html',
    '/html/components/tabs.html',
    '/html/components/title-and-text.html'
];

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
function writeData(st, data) {
    return dbPromise.then(function (db) {
        var tx = db.transaction(st, 'readwrite');
        var store = tx.objectStore(st);
        store.put(data);
        return tx.complete;
    });
}

function clearData(st) {
    return dbPromise.then(function (db) {
        var tx = db.transaction(st, 'readwrite');
        tx.objectStore(st).clear();
        return tx.complete;
    });
}

function clearPostsByType(type) {
    return dbPromise.then(function (db) {
        var tx = db.transaction('posts', 'readwrite');
        var store = tx.objectStore('posts');
        var index = store.index('type');
        return index
            .openKeyCursor(IDBKeyRange.only(type))
            .then(function showRange(cursor) {
                if (!cursor) {
                    return;
                }
                store.delete(cursor.primaryKey);
                return cursor.continue().then(showRange);
            });
    });
}

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME).then(function (cache) {
            cache.addAll(STATIC_FILES);
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keysList) {
            return Promise.all(
                keysList.map(function (key) {
                    if (
                        key !== CACHE_STATIC_NAME &&
                        key !== CACHE_DYNAMIC_NAME
                    ) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', function (event) {
    if (
        event.request.url.indexOf('https://maps.') == 0 ||
        event.request.url.indexOf('googleapis.com') > -1
    ) {
        event.respondWith(fetch(event.request));
    } else if (
        event.request.url.indexOf(self.location.origin + '/api/appData') > -1
    ) {
        event.respondWith(
            fetch(event.request).then(function (response) {
                response
                    .clone()
                    .json()
                    .then(function (res) {
                        if (res.pages && res.pages.length) {
                            clearData('pages').then(function () {
                                res.pages.forEach(function (page) {
                                    writeData('pages', page);
                                });
                            });
                        }
                        if (res.posts && res.posts.length) {
                            clearData('posts').then(function () {
                                res.posts.forEach(function (post) {
                                    writeData('posts', post);
                                });
                            });
                        }
                    });
                return response;
            })
        );
    } else if (event.request.url.indexOf(self.location.origin + '/api') > -1) {
        event.respondWith(
            fetch(event.request).then(function (res) {
                var clonedRes = res.clone();
                var typeOfRequest =
                    event.request.url.indexOf('/api/page') > -1
                        ? 'pages'
                        : event.request.url.indexOf('/api/posts') > -1
                        ? 'posts'
                        : '';
                if (typeOfRequest) {
                    clonedRes.json().then(function (data) {
                        if (typeOfRequest === 'posts') {
                            var type = event.request.url.substring(
                                event.request.url.lastIndexOf('/') + 1
                            );
                            clearPostsByType(type).then(function () {
                                for (var key in data) {
                                    writeData(typeOfRequest, data[key]);
                                }
                            });
                        } else if (data.pages) {
                            for (var key in data.pages) {
                                writeData(typeOfRequest, data.pages[key]);
                            }
                        }
                    });
                }
                return res;
            })
        );
    } else if (
        event.request.cache === 'only-if-cached' &&
        event.request.mode !== 'same-origin'
    ) {
        return;
    } else {
        event.respondWith(
            event.request.mode === 'navigate' &&
                event.request.url.indexOf(
                    self.location.origin + '/uploads/'
                ) === -1
                ? caches.match('index.html')
                : caches.match(event.request).then(function (response) {
                      return (
                          response ||
                          fetch(event.request).then(function (res) {
                              var cacheToOpen = isInArray(
                                  event.request.url,
                                  STATIC_FILES
                              )
                                  ? CACHE_STATIC_NAME
                                  : CACHE_DYNAMIC_NAME;
                              return caches
                                  .open(cacheToOpen)
                                  .then(function (cache) {
                                      if (
                                          event.request.url.indexOf('http') == 0
                                      ) {
                                          cache.put(
                                              event.request.url,
                                              res.clone()
                                          );
                                      }
                                      return res;
                                  });
                          })
                      );
                  })
        );
    }
});

function isInArray(string, array) {
    var cachePath;
    if (string.indexOf(self.origin) === 0) {
        // request targets domain where we serve the page from (i.e. NOT a CDN)
        // console.log("matched ", string);
        cachePath = string.substring(self.origin.length); // take the part of the URL AFTER the domain (e.g. after localhost:8080)
    } else {
        cachePath = string; // store the full request (for CDNs)
    }
    return array.indexOf(cachePath) > -1;
}
