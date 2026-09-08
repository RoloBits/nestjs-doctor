import { applyDecorators, Controller, Get } from '@nestjs/common';

export const ApiController = (path: string) => applyDecorators(Controller(path));

export const ReadAll = () => applyDecorators(Get());

export declare class UserEntity {
  id: string;
  passwordHash: string;
}

export declare class AddressEntity {
  city: string;
}

export declare class UserRepo {
  findOne(): Promise<UserEntity>;
}
