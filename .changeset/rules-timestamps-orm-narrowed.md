---
"nestjs-doctor": patch
---

Drop `schema/require-timestamps` from `warning` to `info` (0.55 points per entity instead of 1.65, and `--blocking warning` no longer fails on it) and skip join tables; `architecture/no-orm-in-services` no longer reports `PrismaService` or `PrismaClient`, so the official Prisma recipe is quiet.
