import { CanActivate, Injectable } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
