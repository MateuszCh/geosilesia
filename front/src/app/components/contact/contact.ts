import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, input, signal } from '@angular/core';
import { ContactData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { HtmlDirective } from '../../shared/html.directive';

/**
 * Contact: the editor with the address written as "(at)" – kept that way against harvesters –
 * and a button that copies the real address.
 */
@Component({
    selector: 'app-contact',
    templateUrl: './contact.html',
    imports: [TrustedPipe, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Contact {
    readonly component = input.required<ContactData>();
    readonly copied = signal(false);

    private readonly doc = inject(DOCUMENT);

    readonly address = computed(() => (this.component().email ?? '').trim().replace(/\s*\(at\)\s*/i, '@'));
    readonly shownEmail = computed(() => this.address().replace('@', '(at)'));

    copy(): void {
        const clipboard = this.doc.defaultView?.navigator.clipboard;
        if (!clipboard) return;
        void clipboard.writeText(this.address()).then(() => {
            this.copied.set(true);
            setTimeout(() => this.copied.set(false), 2500);
        });
    }
}
