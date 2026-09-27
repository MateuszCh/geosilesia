import { AngularAppEngine } from '@angular/ssr';
import type { SsrContext } from './app/core/ssr';

export type { SsrContext };

/**
 * Server entry point loaded by ../ssr.js. app.js remains the HTTP server (static files,
 * API, sitemap, SEO meta, status codes), so there is no Express here – only the render
 * function.
 */
const engine = new AngularAppEngine();

/**
 * Renders the page at `url` (always the http://localhost origin – an allowed host in
 * angular.json, never an address from request headers). `null` means the render failed
 * and the server should serve the plain CSR shell.
 */
export async function render(
    url: string,
    context: SsrContext,
    signal?: AbortSignal
): Promise<string | null> {
    const response = await engine.handle(new Request(url, { signal }), context);
    if (!response || response.status !== 200) {
        return null;
    }
    return response.text();
}
