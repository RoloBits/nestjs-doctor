import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
});

export const userIdSchema = z.coerce.number().int().positive();

export type CreateUser = z.infer<typeof createUserSchema>;
