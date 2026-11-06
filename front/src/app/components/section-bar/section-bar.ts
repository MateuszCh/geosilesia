import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SectionLinks } from '../../core/navigation.service';

/**
 * The pages of a section, as in the mockups: a row of buttons inside a light header band,
 * or a list of buttons headed by the section's name beside the text.
 */
@Component({
    selector: 'app-section-bar',
    templateUrl: './section-bar.html',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SectionBar {
    readonly section = input.required<SectionLinks>();
    readonly form = input<'bar' | 'menu'>('bar');
}
