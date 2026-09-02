import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { RpcAuthGuard } from './rpc-auth.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const micro = app.connectMicroservice({ transport: Transport.TCP });
  micro.useGlobalGuards(new RpcAuthGuard());
  app.useGlobalGuards();
  await app.startAllMicroservices();
  await app.listen(3000);
}

bootstrap();
