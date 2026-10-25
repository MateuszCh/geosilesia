// Permanent redirects of retired addresses, shared by the server (a 301 in app.js) and the
// browser router (app.routes.ts): a request from outside and a link inside the app end up
// on the same page. Paths are normalized – a leading slash and no trailing one.
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.GeoRedirects = api;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var REDIRECTS = {
        // Every section page of the knowledge base lists all its sections, so the base
        // opens on its first section instead of a page of its own.
        '/baza-wiedzy': '/do-posluchania'
    };

    return { REDIRECTS: REDIRECTS };
});
