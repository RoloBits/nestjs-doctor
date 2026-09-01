import { StandardSchemaValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ObserveInstrument } from "./observe.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    routeConflictPolicy: { duplicate: "error", shadow: "warn" },
    routeResolutionStrategy: "specificity",
  });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  await app.listen(3000);
}

await bootstrap();
