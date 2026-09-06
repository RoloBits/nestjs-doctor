import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
  private readonly entries: string[] = [];

  record(entry: string): void {
    this.entries.push(entry);
  }
}
