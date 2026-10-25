import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { ChartBar, TabsData } from '../../models/row.model';
import { periodColor } from '../../core/categories';
import { ScrollService } from '../../core/scroll.service';
import { plural } from '../../shared/plural';

interface TocEntry {
    id: string;
    title: string;
}

/**
 * Sections of one content page as tabs, with "Na tej stronie" listing the headings of the
 * open tab. Every panel is rendered (the inactive ones `hidden`), so the whole text is in
 * the server HTML.
 */
@Component({
    selector: 'app-tabs',
    templateUrl: './tabs.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Tabs {
    readonly component = input.required<TabsData>();
    readonly activeTab = signal(0);
    readonly tocOpen = signal(false);
    readonly currentHeading = signal<string | undefined>(undefined);

    protected readonly periodColor = periodColor;

    private readonly doc = inject(DOCUMENT);
    private readonly scroll = inject(ScrollService);

    readonly tabs = computed(() => this.component().tabs ?? []);

    readonly toc = computed<TocEntry[]>(() => {
        const tabIndex = this.activeTab();
        return (this.tabs()[tabIndex]?.rows ?? [])
            .map((row, rowIndex) => ({ id: this.headingId(tabIndex, rowIndex), title: row.heading ?? '' }))
            .filter(entry => entry.title);
    });

    tabId(index: number): string {
        return `tab-${index}`;
    }

    panelId(index: number): string {
        return `tab-panel-${index}`;
    }

    headingId(tabIndex: number, rowIndex: number): string {
        return `tab-${tabIndex}-sekcja-${rowIndex}`;
    }

    select(index: number): void {
        this.activeTab.set(index);
        this.currentHeading.set(undefined);
        this.tocOpen.set(false);
    }

    /** Arrow keys move between tabs, as in the WAI-ARIA tabs pattern. */
    onTabKey(event: KeyboardEvent, index: number): void {
        const count = this.tabs().length;
        const target =
            event.key === 'ArrowRight'
                ? (index + 1) % count
                : event.key === 'ArrowLeft'
                  ? (index - 1 + count) % count
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? count - 1
                      : -1;
        if (target === -1) return;
        event.preventDefault();
        this.select(target);
        this.doc.getElementById(this.tabId(target))?.focus();
    }

    goTo(event: Event, id: string): void {
        event.preventDefault();
        this.currentHeading.set(id);
        this.tocOpen.set(false);
        this.scroll.scrollToElement(this.doc.getElementById(id));
    }

    sectionsLabel(count: number): string {
        return plural(count, 'sekcja', 'sekcje', 'sekcji');
    }

    /** Bar length relative to the largest value of the chart. */
    barWidth(bars: ChartBar[] | undefined, value: number | string | undefined): number {
        const values = (bars ?? []).map(bar => Number(bar.value) || 0);
        const max = Math.max(...values, 0);
        return max ? Math.round(((Number(value) || 0) / max) * 100) : 0;
    }

    /** The bar's figure in Polish notation ("55,3", "12 334"); text is shown as typed. */
    barValue(value: number | string | undefined): string {
        const number = typeof value === 'number' ? value : Number(value);
        return value !== '' && value !== undefined && Number.isFinite(number)
            ? number.toLocaleString('pl-PL')
            : String(value ?? '');
    }
}
