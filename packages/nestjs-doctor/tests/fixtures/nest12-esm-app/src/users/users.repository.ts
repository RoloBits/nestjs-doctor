import { Injectable } from "@nestjs/common";

export const USERS_REPOSITORY = Symbol("USERS_REPOSITORY");

export interface UserRecord {
  id: number;
  email: string;
  displayName: string;
}

export interface UsersRepository {
  findById(id: number): Promise<UserRecord | undefined>;
  insert(user: Omit<UserRecord, "id">): Promise<UserRecord>;
}

@Injectable()
export class InMemoryUsersRepository implements UsersRepository {
  private readonly rows = new Map<number, UserRecord>();

  findById(id: number): Promise<UserRecord | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  insert(user: Omit<UserRecord, "id">): Promise<UserRecord> {
    const record = { id: this.rows.size + 1, ...user };
    this.rows.set(record.id, record);
    return Promise.resolve(record);
  }
}
