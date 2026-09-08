import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

// Returns UseGuards directly, written as a function expression.
export const IsAuthnAuthz = function () {
  return UseGuards(AuthGuard);
};

// Returns UseGuards directly from a concise arrow body.
export const StripeAuthorizer = () => UseGuards(AuthGuard);

// Wraps UseGuards in applyDecorators, the long supported shape.
export function Auth() {
  return applyDecorators(SetMetadata('audited', true), UseGuards(AuthGuard));
}

// Composes decorators but binds no guard.
export const Documented = () => applyDecorators(SetMetadata('documented', true));

// Binds a guard on one path out and nothing on the other.
export function MaybeAuth(secure: boolean) {
  if (secure) {
    return UseGuards(AuthGuard);
  }
  return applyDecorators(SetMetadata('public', true));
}
