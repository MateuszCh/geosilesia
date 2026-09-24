import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { GeositesLogosData } from '../../models/row.model';

@Component({
    selector: 'app-geosites-logos',
    templateUrl: './geosites-logos.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeositesLogos {
    readonly component = input.required<GeositesLogosData>();
}
