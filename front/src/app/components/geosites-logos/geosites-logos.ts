import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GeositesLogosData } from '../../models/row.model';

const MARK_COLORS = ['var(--trail-red)', 'var(--trail-blue)', 'var(--trail-green)'];

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
            .map((logo, index) => ({
                link: logo.link!,
                name: logo.name?.trim() ?? '',
                image: logo.image,
                host: hostOf(logo.link),
                color: MARK_COLORS[index % MARK_COLORS.length]
            }))
    );
}
