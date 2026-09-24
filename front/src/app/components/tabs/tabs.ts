import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TabsData } from '../../models/row.model';

@Component({
    selector: 'app-tabs',
    templateUrl: './tabs.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Tabs {
    readonly component = input.required<TabsData>();
    readonly activeTab = signal(0);
}
