import { Routes } from '@angular/router';
import { PageView } from './components/page-view/page-view';
import { pageResolver } from './core/page.resolver';

/**
 * Serwis nie ma stałych tras – każdy adres to strona z CMS-a, a o jej istnieniu
 * rozstrzyga API. Stąd jedna trasa łapiąca wszystko, dokładnie jak "/" i "/:page*"
 * w routes.config.js.
 *
 * runGuardsAndResolvers: 'always', bo obie ścieżki obsługuje ten sam komponent i bez
 * tego resolver nie odpaliłby się przy przejściu między podstronami.
 */
export const routes: Routes = [
    {
        path: '**',
        component: PageView,
        resolve: { page: pageResolver },
        runGuardsAndResolvers: 'always'
    }
];
