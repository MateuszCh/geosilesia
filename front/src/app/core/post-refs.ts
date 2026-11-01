import { Post } from '../models/post.model';

/**
 * The value of a frodo "post" field: the numeric ids of the chosen posts, in the chosen
 * order, or null when nothing is chosen. The field always picks posts of one post type,
 * fixed in its definition, so the code that reads it knows which posts to load.
 */
export interface PostRefs {
    ids?: number[];
}

/** The chosen ids; anything that is not such a value gives none. */
export function postIds(value: PostRefs | null | undefined): number[] {
    const ids = value?.ids;
    return Array.isArray(ids) ? ids.filter(id => Number.isInteger(id)) : [];
}

/**
 * The chosen posts out of `posts`, in the chosen order. A chosen post that is gone (frodo
 * keeps the id when the post is removed) is skipped.
 */
export function pickPosts<T>(value: PostRefs | null | undefined, posts: Post<T>[]): Post<T>[] {
    const ids = postIds(value);
    if (!ids.length) return [];
    // Loose ids: a post from Mongo has a number, one from IndexedDB may have a string.
    const byId = new Map(posts.map(post => [Number(post.id), post]));
    return ids.map(id => byId.get(id)).filter((post): post is Post<T> => !!post);
}
