import { Module } from '@nestjs/common';
import { ConfigurableModuleClass } from './http.module-definition.js';
import { HttpService } from './http.service.js';

@Module({
  providers: [HttpService],
  exports: [HttpService],
})
export class HttpModule extends ConfigurableModuleClass {}
