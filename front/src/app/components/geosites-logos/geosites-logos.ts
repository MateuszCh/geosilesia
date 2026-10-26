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

    /**
     * The heading from the CMS; without one "Sprawdź w bazach PIG-PIB" as in the mockup – as
     * long as every database is the institute's.
     */
    readonly title = computed(() => {
        const own = this.component().title?.trim();
        if (own) return own;
        const bases = this.bases();
        const institute = bases.length > 0 && bases.every(base => /(^|\.)pgi\.gov\.pl$/.test(base.host));
        return institute ? 'Sprawdź w bazach PIG-PIB' : 'Sprawdź w bazach danych';
    });
}
