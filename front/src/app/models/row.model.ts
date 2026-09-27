// Shapes of page rows as the CMS stores them. Almost everything is optional – an editor
// can leave a field empty and the templates still have to cope. The `Row` union replaces
// the former `ng-switch="row.type"` in page-view.html.

export interface Slide {
    image?: string;
    text?: string;
    text_english?: string;
    left_position?: number | string;
    top_position?: number | string;
}

export interface HomepageBannerData {
    title?: string;
    interval?: number | string;
    slides?: Slide[];
    pin_icon?: string;
    info_icon?: string;
    info_text?: string;
    info_text_english?: string;
}

export interface MapData {
    title?: string;
    number_results?: number;
    marker_cluster?: boolean;
}

export interface TextRow {
    paragraph?: string;
    paragraph_class?: string;
    list?: { item?: string }[];
}

export interface TitleAndTextData {
    title?: string;
    text?: TextRow[];
}

export interface MarkerCategoryListData {
    text?: string;
    categories?: { icon?: string; text?: string }[];
}

export interface LiteratureData {
    title?: string;
    items?: { author?: string; item?: string }[];
}

export interface NewsData {
    title?: string;
}

export interface DictionaryData {
    items?: {
        title?: string;
        rows?: { text?: string; list_item?: { text?: string }[] }[];
    }[];
}

export interface FootnotesData {
    title?: string;
    items?: { position?: string | number; text?: string }[];
}

export interface HeadingData {
    /** h1…h6 – decides which tag to render. */
    type?: string;
    text?: string;
    class?: string;
}

export interface GeositesLogosData {
    logos?: { link?: string; image?: string }[];
}

export interface TableCell {
    text?: string;
    rowspan?: number | string;
    colspan?: number | string;
    scope?: string;
}

export interface TableData {
    colgroups?: { colgroup_span?: number | string }[];
    rows?: { header?: TableCell[]; data?: TableCell[] }[];
}

export interface TabRow {
    heading?: string;
    /** The CMS can store `null` here (an empty paragraph) – AngularJS silently ignored it. */
    paragraphs?: ({ paragraph?: string } | null)[];
    list?: { item?: string }[];
    image?: string;
    image_footnotes?: { footnote?: string }[];
    table?: TableData[];
}

export interface TabsData {
    tabs?: { title?: string; rows?: TabRow[] }[];
}

export interface GalleryListData {
    galleries?: {
        category?: string;
        link?: string;
        image?: string;
        title?: string;
    }[];
}

/** An entry from the `files` collection; the server replaces `catalogue` (a catalogue name) with the file list. */
export interface GalleryImage {
    id: string | number;
    src?: string;
    title?: string;
    description?: string;
    author?: string;
    copy?: string;
    position?: number;
}

export interface GalleryData {
    title?: string;
    paragraphs?: { paragraph?: string }[];
    catalogue?: GalleryImage[];
}

export type Row =
    | { type: 'homepage_banner'; data: HomepageBannerData }
    | { type: 'map'; data: MapData }
    | { type: 'title_and_text'; data: TitleAndTextData }
    | { type: 'marker_category_list'; data: MarkerCategoryListData }
    | { type: 'literature'; data: LiteratureData }
    | { type: 'news'; data: NewsData }
    | { type: 'dictionary'; data: DictionaryData }
    | { type: 'footnotes'; data: FootnotesData }
    | { type: 'heading'; data: HeadingData }
    | { type: 'geosites_logos'; data: GeositesLogosData }
    | { type: 'tabs'; data: TabsData }
    | { type: 'gallery_list'; data: GalleryListData }
    | { type: 'gallery'; data: GalleryData };
