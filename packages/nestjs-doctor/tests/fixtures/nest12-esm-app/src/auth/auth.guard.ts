import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";

interface AuthorizedRequest {
  headers: Record<string, string | undefined>;
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    return typeof request.headers.authorization === "string";
  }
}
