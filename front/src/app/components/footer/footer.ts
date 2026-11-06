import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavigationService } from '../../core/navigation.service';

/** Description, section columns built from the navigation post, and the five trail colours. */
@Component({
    selector: 'app-footer',
    templateUrl: './footer.html',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Footer {
    protected readonly navigation = inject(NavigationService);
}
