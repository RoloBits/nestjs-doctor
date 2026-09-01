import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  USERS_REPOSITORY,
  type UserRecord,
  type UsersRepository,
} from "./users.repository.js";
import type { CreateUser } from "./users.schemas.js";

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository
  ) {}

  async create(input: CreateUser): Promise<UserRecord> {
    return await this.users.insert(input);
  }

  async findOne(id: number): Promise<UserRecord> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }
}
