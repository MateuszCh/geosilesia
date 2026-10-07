import { Routes } from '@angular/router';
import { PageView } from './components/page-view/page-view';
import { pageResolver } from './core/page.resolver';

/**
 * The site has no fixed routes – every address is a CMS page, and the API decides
 * whether it exists. Hence a single catch-all route, exactly like "/" and "/:page*"
 * in routes.config.js.
 *
 * runGuardsAndResolvers: 'always', because the same component handles every path and
 * without it the resolver would not run when moving between pages.
 */
export const routes: Routes = [
    {
        path: '**',
        component: PageView,
        resolve: { page: pageResolver },
        runGuardsAndResolvers: 'always'
    }
];
