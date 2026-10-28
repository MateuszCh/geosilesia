import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core';
import { ColumnsData, Row } from '../../models/row.model';
import { RowView } from '../row/row';

/**
 * "Kolumny": columns side by side, each a list of components, as the events and knowledge
 * base previews on the home page. They wrap below each other on narrow screens; a column
 * of events is wider (_sections.scss), as in the mockup.
 */
@Component({
    selector: 'app-columns',
    templateUrl: './columns.html',
    // RowView draws the components and itself imports this one: forwardRef breaks the cycle.
    imports: [forwardRef(() => RowView)],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Columns {
    readonly component = input.required<ColumnsData>();

    /** The components of each column; empty picks and empty columns are left out. */
    readonly columns = computed(() =>
        (this.component()?.columns ?? [])
            .map(column =>
                (column?.components ?? []).map(item => item?.component).filter((row): row is Row => !!row?.type)
            )
            .filter(rows => rows.length > 0)
    );
}
