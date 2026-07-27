import { CanActivate, Injectable } from "@nestjs/common";

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate() {
    return true;
  }
}
