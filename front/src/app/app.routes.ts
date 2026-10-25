import { Routes } from '@angular/router';
import { PageView } from './components/page-view/page-view';
import { pageResolver } from './core/page.resolver';
import { REDIRECTS } from '../../../shared/redirects';

/**
 * The site has no fixed routes – every address is a CMS page, and the API decides
 * whether it exists. Hence a single catch-all route, exactly like "/" and "/:page*"
 * in routes.config.js.
 *
 * runGuardsAndResolvers: 'always', because the same component handles every path and
 * without it the resolver would not run when moving between pages.
 */
export const routes: Routes = [
    // Retired addresses, as the server redirects them – for links inside the app.
    ...Object.entries(REDIRECTS).map(([from, to]) => ({ path: from.slice(1), redirectTo: to, pathMatch: 'full' as const })),
    {
        path: '**',
        component: PageView,
        resolve: { page: pageResolver },
        runGuardsAndResolvers: 'always'
    }
];
