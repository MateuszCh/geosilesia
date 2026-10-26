import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SectionLinks } from '../../core/navigation.service';

/** The pages of a section as a row of buttons – under the header, or inside a light band. */
@Component({
    selector: 'app-section-bar',
    templateUrl: './section-bar.html',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SectionBar {
    readonly section = input.required<SectionLinks>();
}
