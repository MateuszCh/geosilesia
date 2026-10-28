import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Row } from '../../models/row.model';
import { RowContext } from '../../core/row-context';
import { Columns } from '../columns/columns';
import { Dictionary } from '../dictionary/dictionary';
import { Footnotes } from '../footnotes/footnotes';
import { Gallery } from '../gallery/gallery';
import { GalleryList } from '../gallery-list/gallery-list';
import { GeositesLogos } from '../geosites-logos/geosites-logos';
import { Heading } from '../heading/heading';
import { HomepageBanner } from '../homepage-banner/homepage-banner';
import { Literature } from '../literature/literature';
import { MarkerCategoryList } from '../marker-category-list/marker-category-list';
import { News } from '../news/news';
import { Notice } from '../notice/notice';
import { MapSearch } from '../map-search/map-search';
import { Facts } from '../facts/facts';
import { CategoryGrid } from '../category-grid/category-grid';
import { Top50 } from '../top50/top50';
import { LinkCards } from '../link-cards/link-cards';
import { Photos } from '../photos/photos';
import { Timeline } from '../timeline/timeline';
import { NumberedList } from '../numbered-list/numbered-list';
import { KnowledgeBase } from '../knowledge-base/knowledge-base';
import { Contact } from '../contact/contact';
import { SearchMap } from '../search-map/search-map';
import { Tabs } from '../tabs/tabs';
import { TitleAndText } from '../title-and-text/title-and-text';

/**
 * One CMS row – or a component nested in one, which has the same shape – drawn by its
 * component. The host takes no box of its own (`display: contents`, _layout.scss), so the
 * page's styles see the component where they saw it before.
 */
@Component({
    selector: 'app-row',
    templateUrl: './row.html',
    imports: [
        Columns,
        Dictionary,
        Footnotes,
        Gallery,
        GalleryList,
        GeositesLogos,
        Heading,
        HomepageBanner,
        Literature,
        MarkerCategoryList,
        News,
        Notice,
        MapSearch,
        Facts,
        CategoryGrid,
        Top50,
        LinkCards,
        Photos,
        Timeline,
        NumberedList,
        KnowledgeBase,
        Contact,
        SearchMap,
        Tabs,
        TitleAndText
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RowView {
    readonly row = input.required<Row>();
    protected readonly context = inject(RowContext);
}
