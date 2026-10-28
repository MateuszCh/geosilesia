// Shapes of page rows as the CMS stores them. Almost everything is optional – an editor
// can leave a field empty and the templates still have to cope. The `Row` union replaces
// the former `ng-switch="row.type"` in page-view.html.
//
// Fields marked "variant C" were added for the redesign; pages saved before it do not have
// them, so every component falls back to the older fields.

import { KnowledgeSection, TrailColorName } from './post.model';

export interface Slide {
    image?: string;
    text?: string;
    text_english?: string;
    left_position?: number | string;
    top_position?: number | string;
    /** Variant C: photo credit, place and a longer description for the photo viewer. */
    author?: string;
    place?: string;
    description?: string;
}

export interface HomepageBannerData {
    title?: string;
    interval?: number | string;
    slides?: Slide[];
    pin_icon?: string;
    info_icon?: string;
    /** Variant C: shown as the lead under the title. */
    info_text?: string;
    info_text_english?: string;
    /** Variant C. */
    eyebrow?: string;
}

export interface MapData {
    title?: string;
    number_results?: number;
    marker_cluster?: boolean;
}

/** Stored values of `paragraph_class`: older pages hold a CSS class, newer ones a choice. */
export type ParagraphClass = '' | 'pogrubiony' | 'wstęp' | 'cytat' | 'fw-bold' | string;

export interface TextRow {
    paragraph?: string;
    paragraph_class?: ParagraphClass;
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
    /** Variant C. */
    intro?: string;
    variant?: 'lista' | 'zapowiedź' | string;
    limit?: number | string;
    link?: string;
    link_label?: string;
}

export interface DictionaryItem {
    title?: string;
    /** Variant C: the English term, today written in the title as "(ang. …)". */
    title_en?: string;
    rows?: { text?: string; list_item?: { text?: string }[] }[];
}

export interface DictionaryData {
    items?: DictionaryItem[];
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
    /** Not in the spec: the heading above the databases ("Sprawdź w bazach PIG-PIB"). */
    title?: string;
    /** Variant C: `name` of the database, shown with its domain instead of the logo alone. */
    logos?: { link?: string; image?: string; name?: string }[];
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

export interface TabFact {
    value?: string;
    label?: string;
    note?: string;
    /** Not in the spec: the colour of the figure, as in the mockup of "Rzeźba terenu". */
    color?: TrailColorName | string;
}

export interface ChartBar {
    label?: string;
    value?: number | string;
    highlight?: boolean;
}

export interface TabRow {
    heading?: string;
    /** The CMS can store `null` here (an empty paragraph) – AngularJS silently ignored it. */
    paragraphs?: ({ paragraph?: string } | null)[];
    list?: { item?: string }[];
    image?: string;
    image_description?: string;
    image_footnotes?: { number?: number | string; footnote?: string }[];
    table?: TableData[];
    /** Variant C. */
    quote?: string;
    quote_author?: string;
    image_author?: string;
    facts?: TabFact[];
    chart_title?: string;
    chart_unit?: string;
    chart?: ChartBar[];
    chart_source?: string;
}

export interface TabsData {
    tabs?: { title?: string; rows?: TabRow[] }[];
}

export type AlbumCategory = 'dziedzictwo Ziemi' | 'dziedzictwo geokulturowe' | 'inne';

export interface GalleryListData {
    galleries?: {
        category?: AlbumCategory | string;
        link?: string;
        image?: string;
        title?: string;
    }[];
    /** Variant C. */
    intro?: string;
    mode?: 'automatycznie' | 'ręcznie' | string;
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
    /**
     * Variant C. From here on the album's own values: an "album" page keeps them in its
     * `typeData` and layoutPage puts them here; a page without a type had them in this row.
     */
    category?: AlbumCategory | string;
    cover?: string;
    author?: string;
    updated?: string | number;
    hidden?: boolean;
    /** Not in the CMS spec, added with the migration: the date the album was published. */
    published?: string | number;
}

// ---- Components added in variant C ----

export interface PageHeroData {
    title?: string;
    lead?: string;
    image?: string;
    image_caption?: string;
    image_author?: string;
    author?: string;
    published?: string | number;
    /** Empty = the date the page was last saved. */
    updated?: string | number;
    /**
     * Not in the spec: the band of a header without a photo, as in the mockups – light on
     * the dictionary pages, dark (forest) on "Położenie"; empty = none.
     */
    variant?: 'jasne' | 'ciemne' | string;
    /** Not in the spec: a line above the title in place of the breadcrumbs ("Szlak czerwony"). */
    eyebrow?: string;
}

export interface MapSearchData {
    title?: string;
    map_link?: string;
    button_label?: string;
}

export type FactsAuto = 'obiekty na mapie' | 'kategorie' | 'TOP 50' | 'albumy' | 'wydarzenia';

export interface FactsData {
    title?: string;
    items?: { value?: string; label?: string; auto?: FactsAuto | string }[];
    source?: string;
}

export interface CategoryGridData {
    title?: string;
    intro?: string;
    map_link?: string;
    link_label?: string;
}

export interface Top50Data {
    /** Not in the spec: the line above the title of the preview ("Szlak czerwony · TOP 50"). */
    eyebrow?: string;
    title?: string;
    intro?: string;
    variant?: 'lista' | 'zapowiedź' | string;
    limit?: number | string;
    link?: string;
    link_label?: string;
}

export interface LinkCardsData {
    title?: string;
    intro?: string;
    variant?: 'karty' | 'lista boczna' | string;
    items?: {
        title?: string;
        description?: string;
        image?: string;
        link?: string;
        color?: TrailColorName | string;
    }[];
}

export interface PhotosData {
    title?: string;
    intro?: string;
    variant?: 'pasek' | 'siatka z podglądem' | string;
    source?: 'baner strony głównej' | 'katalog' | string;
    /** Replaced by the server with the file list, as in `gallery`. */
    catalogue?: GalleryImage[] | string;
    link?: string;
    link_label?: string;
}

export interface TimelineData {
    title?: string;
    intro?: string;
    items?: { year?: string; title?: string; note?: string; highlight?: boolean; link?: string }[];
    /** Not in the spec: the legend of highlighted and other points. */
    legend_highlight?: string;
    legend_other?: string;
}

export interface NumberedListData {
    title?: string;
    intro?: string;
    items?: {
        title?: string;
        place?: string;
        text?: string;
        image?: string;
        image_author?: string;
        link?: string;
    }[];
    more_title?: string;
    more_items?: { text?: string; link?: string }[];
}

export interface KnowledgeBaseData {
    title?: string;
    intro?: string;
    variant?: 'pełna' | 'zapowiedź' | string;
    section?: 'wszystkie' | KnowledgeSection | string;
    link?: string;
}

export interface ContactData {
    person_role?: string;
    person_name?: string;
    email?: string;
    cards?: { title?: string; text?: string }[];
}

export interface NoticeData {
    title?: string;
    text?: string;
    variant?: 'cytowanie' | 'uwaga' | 'informacja' | string;
}

/**
 * Columns side by side ("Kolumny"), each a list of components: a repeater of columns
 * holding a repeater of "component" fields, whose values have the shape of a row.
 */
export interface ColumnsData {
    columns?: { components?: { component?: Row | null }[] }[];
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
    | { type: 'gallery'; data: GalleryData }
    | { type: 'page_hero'; data: PageHeroData }
    | { type: 'map_search'; data: MapSearchData }
    | { type: 'facts'; data: FactsData }
    | { type: 'category_grid'; data: CategoryGridData }
    | { type: 'top50'; data: Top50Data }
    | { type: 'link_cards'; data: LinkCardsData }
    | { type: 'photos'; data: PhotosData }
    | { type: 'timeline'; data: TimelineData }
    | { type: 'numbered_list'; data: NumberedListData }
    | { type: 'knowledge_base'; data: KnowledgeBaseData }
    | { type: 'contact'; data: ContactData }
    | { type: 'notice'; data: NoticeData }
    | { type: 'columns'; data: ColumnsData };

export type RowType = Row['type'];
