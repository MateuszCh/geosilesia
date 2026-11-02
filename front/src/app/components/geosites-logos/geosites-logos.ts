import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GeositesLogosData } from '../../models/row.model';
import { NEUTRAL_COLOR, colorByName } from '../../core/categories';

function hostOf(link: string | undefined): string {
    if (!link) return '';
    try {
        return new URL(link).hostname.replace(/^www\./, '');
    } catch {
        return link;
    }
}

/**
 * External geosite databases. Variant C shows each database's name and domain; until the
 * `name` field is filled in, the logo stands in for the name.
 */
@Component({
    selector: 'app-geosites-logos',
    templateUrl: './geosites-logos.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeositesLogos {
    readonly component = input.required<GeositesLogosData>();

    readonly bases = computed(() =>
        (this.component().logos ?? [])
            .filter(logo => logo.link)
            .map(logo => ({
                link: logo.link!,
                name: logo.name?.trim() ?? '',
                image: logo.image,
                host: hostOf(logo.link),
                color: colorByName(logo.color) ?? NEUTRAL_COLOR
            }))
    );

    readonly title = computed(() => this.component().title?.trim() ?? '');
}
