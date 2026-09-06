import type { Provider } from '@nestjs/common';
import { AuditService } from './audit.service.js';

export const AUDIT = 'AUDIT';

const implementations = { audit: AuditService };

export const auditProviders: Provider[] = [
  { provide: AUDIT, useClass: implementations.audit },
];
