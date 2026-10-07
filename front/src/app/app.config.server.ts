import {
    ApplicationConfig,
    TransferState,
    inject,
    mergeApplicationConfig,
    provideAppInitializer
} from '@angular/core';
import { HttpBackend } from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { RENDERED_ON_SERVER, SsrApiBackend } from './core/ssr';

const serverConfig: ApplicationConfig = {
    providers: [
        provideServerRendering(withRoutes(serverRoutes)),
        { provide: HttpBackend, useClass: SsrApiBackend },
        provideAppInitializer(() => inject(TransferState).set(RENDERED_ON_SERVER, true))
    ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
