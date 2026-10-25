import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { Location, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { internalLink, isExternalLink } from '../../core/cms-link';
import { ALBUM_CATEGORIES, ALBUM_CATEGORY_PARAM, albumCategory, albumCategoryBySlug } from '../../core/albums';
import { ResourceService } from '../../core/resource.service';
import { AlbumSummary } from '../../models/post.model';
import { GalleryListData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { plural } from '../../shared/plural';

interface AlbumCard {
    link: string;
    external: boolean;
    title: string;
    cover?: string;
    categoryKey?: string;
    categoryLabel?: string;
    color: string;
}

/**
 * The album list. In the "automatycznie" mode (variant C) it is built from the album pages
 * themselves; otherwise from the albums entered by hand in this row. The chosen category
 * lives in the address ("?kategoria=inne"), so an album page can link to its category and
 * the filtered list can be shared.
 */
@Component({
    selector: 'app-gallery-list',
    templateUrl: './gallery-list.html',
    imports: [NgTemplateOutlet, RouterLink, TrustedPipe],
    // The intro is CMS HTML in [innerHTML] – see TitleAndText.
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GalleryList implements OnInit {
    readonly component = input.required<GalleryListData>();

    readonly selected = signal<string | undefined>(undefined);
    readonly expanded = signal(false);
    protected readonly collapsedCount = 11;

    private readonly auto = signal<AlbumSummary[] | undefined>(undefined);
    private readonly resource = inject(ResourceService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly route = inject(ActivatedRoute);
    private readonly location = inject(Location);

    readonly albums = computed<AlbumCard[]>(() => {
        const auto = this.auto();
        const source = auto
            ? auto
                  .filter(album => !album.hidden)
                  .map(album => ({ link: album.pageUrl, title: album.title ?? '', cover: album.cover, category: album.category }))
            : (this.component().galleries ?? [])
                  .filter(entry => entry.link)
                  .map(entry => ({ link: entry.link!, title: entry.title ?? '', cover: entry.image, category: entry.category }));
        return source.map(album => {
            const category = albumCategory(album.category);
            const external = isExternalLink(album.link);
            return {
                link: external ? album.link : internalLink(album.link)!,
                external,
                title: album.title,
                cover: album.cover || undefined,
                categoryKey: category?.key,
                categoryLabel: category?.label,
                color: category?.color ?? 'var(--muted)'
            };
        });
    });

    readonly filters = computed(() =>
        ALBUM_CATEGORIES.map(category => ({
            ...category,
            count: this.albums().filter(album => album.categoryKey === category.key).length
        })).filter(category => category.count)
    );

    readonly shown = computed(() => {
        const selected = this.selected();
        return selected ? this.albums().filter(album => album.categoryKey === selected) : this.albums();
    });

    ngOnInit(): void {
        this.route.queryParamMap
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(params => this.selected.set(albumCategoryBySlug(params.get(ALBUM_CATEGORY_PARAM))?.key));

        if (this.component().mode !== 'automatycznie') return;
        this.resource
            .loadAlbums()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(albums => {
                if (albums.length) this.auto.set(albums);
            });
    }

    select(key: string | undefined): void {
        this.selected.set(key);
        // replaceState, not a router navigation: the router would scroll back to the top.
        const slug = albumCategory(key)?.slug;
        const [path] = this.location.path().split('?');
        this.location.replaceState(path, slug ? `${ALBUM_CATEGORY_PARAM}=${encodeURIComponent(slug)}` : '');
    }

    albumsLabel(count: number): string {
        return plural(count, 'album', 'albumy', 'albumów');
    }
}
