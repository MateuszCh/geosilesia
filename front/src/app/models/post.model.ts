/** Post types used by the front end. `wydarzenie` (event) feeds the `news` component. */
export type PostType = 'marker' | 'icon' | 'navigation' | 'wydarzenie';

export interface MarkerPostData {
    lat?: number | string;
    long?: number | string;
    link?: string;
    place?: string;
    categories?: string[];
}

export interface IconPostData {
    category?: string;
    name?: string;
    icon?: string;
    position?: number;
}

export interface NavItem {
    title?: string;
    link?: string;
    subnav?: { subtitle?: string; link?: string }[];
}

export interface NavigationPostData {
    nav?: NavItem[];
}

export interface EventPostData {
    date_and_place?: string;
    date_of_publication?: string | number;
    paragraphs?: { item?: string }[];
    /** The CMS can store `null` here (an empty link) – AngularJS silently ignored it. */
    links?: ({ link?: string; text?: string } | null)[];
}

/** A document from the `posts` collection. `id` is the IndexedDB key, `type` an index. */
export interface Post<TData = unknown> {
    id: string | number;
    type: PostType | string;
    title?: string;
    created?: number;
    data: TData;
}

export type MarkerPost = Post<MarkerPostData>;
export type IconPost = Post<IconPostData>;
export type NavigationPost = Post<NavigationPostData>;
export type EventPost = Post<EventPostData>;

/** Response of /api/appData – the bulk prefetch for offline mode. */
export interface AppData {
    pages?: import('./page.model').Page[];
    posts?: Post[];
}
