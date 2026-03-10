import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersService {
  findAll(): string[] {
    return ["user1", "user2"];
  }
}
