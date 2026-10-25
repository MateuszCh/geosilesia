/**
 * Post types used by the front end. `wydarzenie` (event) feeds the `news` component,
 * `top50` the TOP 50 route and `zasob` (a knowledge base resource) the knowledge base.
 */
export type PostType = 'marker' | 'icon' | 'navigation' | 'wydarzenie' | 'top50' | 'zasob';

export interface MarkerPostData {
    lat?: number | string;
    long?: number | string;
    link?: string;
    place?: string;
    categories?: string[];
    /** Photo shown on the object card. Most markers have none. */
    image?: string;
    /** Rock or kind of object – a short line on the card and in the result list. */
    rock?: string;
    /** Place in the TOP 50 route; several markers may share one number. */
    top50?: number | string;
}

/** The colour names offered by the CMS for map categories and link cards. */
export type TrailColorName =
    | 'czerwony'
    | 'zielony'
    | 'niebieski'
    | 'czarny'
    | 'brązowy'
    | 'turkusowy'
    | 'fioletowy'
    | 'żółty'
    | 'pomarańczowy'
    | 'różowy';

export interface IconPostData {
    /** Internal key the markers refer to – it does not always match the name. */
    category?: string;
    name?: string;
    /** The category's line icon (SVG from the design system's "Ikony" group). */
    icon?: string;
    position?: number;
    color?: TrailColorName | string;
}

export interface NavSubItem {
    subtitle?: string;
    link?: string;
    hide_in_footer?: boolean;
}

export interface NavItem {
    title?: string;
    link?: string;
    subnav?: NavSubItem[];
}

export interface NavigationPostData {
    nav?: NavItem[];
    cta_label?: string;
    cta_link?: string;
    footer_text?: string;
    footer_note?: string;
}

export interface EventPostData {
    /** Older events: "8 marca 2018, Czeladź"; newer ones: just the publication date. */
    date_and_place?: string;
    date_of_publication?: string | number;
    paragraphs?: { item?: string }[];
    /** The CMS can store `null` here (an empty link) – AngularJS silently ignored it. */
    links?: ({ link?: string; text?: string } | null)[];
    place?: string;
    event_date?: string | number;
}

export type Top50LinkKind = 'artykuł' | 'www' | 'galeria' | 'przewodnik' | 'YouTube' | 'inne';

export interface Top50PostData {
    number?: number | string;
    image?: string;
    links?: ({ kind?: Top50LinkKind | string; label?: string; url?: string } | null)[];
    description?: string;
}

export type KnowledgeSection =
    | 'Do posłuchania'
    | 'Do poczytania'
    | 'Do pobrania'
    | 'Do pooglądania'
    | 'Animacje i prezentacje'
    | 'Mapy online'
    | 'Wirtualne media';

export interface ResourcePostData {
    section?: KnowledgeSection | string;
    source?: string;
    url?: string;
    file?: string;
    note?: string;
    position?: number | string;
}

/** A document from the `posts` collection. `id` is the IndexedDB key, `type` an index. */
export interface Post<TData = unknown> {
    id: string | number;
    type: PostType | string;
    title?: string;
    created?: number;
    updated?: number;
    data: TData;
}

export type MarkerPost = Post<MarkerPostData>;
export type IconPost = Post<IconPostData>;
export type NavigationPost = Post<NavigationPostData>;
export type EventPost = Post<EventPostData>;
export type Top50Post = Post<Top50PostData>;
export type ResourcePost = Post<ResourcePostData>;

/** One album as listed by /api/galleries – built from pages with a `gallery` row. */
export interface AlbumSummary {
    pageUrl: string;
    title?: string;
    category?: string;
    cover?: string;
    count: number;
    hidden?: boolean;
    updated?: number;
}

/** Response of /api/appData – the bulk prefetch for offline mode. */
export interface AppData {
    pages?: import('./page.model').Page[];
    posts?: Post[];
}
