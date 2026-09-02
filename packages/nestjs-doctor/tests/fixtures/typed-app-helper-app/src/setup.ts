import { INestApplication } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

export function setupApp(app: INestApplication): void {
  app.useGlobalGuards(new JwtAuthGuard());
}
