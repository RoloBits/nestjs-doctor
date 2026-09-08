import { UseGuards } from '@nestjs/common';

export class PackageGuard {
  canActivate() {
    return true;
  }
}

export const PackageAuth = function () {
  return UseGuards(PackageGuard);
};
