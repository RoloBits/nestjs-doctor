import { Injectable } from "@nestjs/common";

@Injectable()
export class AuthService {
  validate(token: string): boolean {
    return token.length > 0;
  }
}
