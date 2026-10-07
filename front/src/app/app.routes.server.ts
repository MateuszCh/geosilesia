import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Render on demand, not prerender: content is edited by an external application
 * directly in Mongo, so HTML built during `ng build` would be stale after the first
 * change. The server keeps the render result in memory (../../../ssr.js).
 */
export const serverRoutes: ServerRoute[] = [
    {
        path: '**',
        renderMode: RenderMode.Server
    }
];
