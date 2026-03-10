import { Module, forwardRef } from "@nestjs/common";
import { AppService } from "./app.service";
import { AuthModule } from "./auth.module";
import { ConfigModule } from "./config.module";
import { DatabaseModule } from "./database.module";
import { UsersModule } from "./users.module";

function getCommonImports() {
  return [AuthModule];
}

const extraImports = [DatabaseModule];

@Module({
  imports: [
    UsersModule,
    ConfigModule.forRoot({ isGlobal: true }),
    forwardRef(() => UsersModule),
    ...getCommonImports(),
    ...extraImports,
  ],
  providers: [AppService],
})
export class AppModule {}
