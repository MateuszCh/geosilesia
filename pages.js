// The pages the public site may read.
//
// The CMS (frodo) can mark a page as a draft: `draft: true` on its document in `pages`.
// Frodo only stores the flag – hiding drafts is this server's job. A draft does not exist
// for the public site: its address answers 404 exactly like a missing page, and it is left
// out of the sitemap, the gallery list and the offline prefetch. Documents without the
// field (everything saved before the flag existed) or with `draft: false` are published.

/** Mongo filter that matches published pages only. */
const PUBLISHED = Object.freeze({ draft: { $ne: true } });

/** Adds the published-only condition to a page query. */
function publishedFilter(filter = {}) {
    return { $and: [filter, PUBLISHED] };
}

/**
 * The `pages` collection as the public site sees it. Only `find` is exposed, and it
 * always adds the filter, so a new query cannot forget it; a method that is missing here
 * (findOne, aggregate…) has to be added with the filter too.
 */
function publishedPages(collection) {
    return {
        find: (filter, options) => collection.find(publishedFilter(filter), options)
    };
}

module.exports = { PUBLISHED, publishedFilter, publishedPages };
