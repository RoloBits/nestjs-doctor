import { z } from "zod";

export const listOrdersQuerySchema = z.object({
  userId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createOrderSchema = z.object({
  userId: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type CreateOrder = z.infer<typeof createOrderSchema>;
