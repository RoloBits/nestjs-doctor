import { Injectable } from '@nestjs/common';

@Injectable()
export class HttpMetricsService {
  private requests = 0;

  request(): void {
    this.requests += 1;
  }
}
