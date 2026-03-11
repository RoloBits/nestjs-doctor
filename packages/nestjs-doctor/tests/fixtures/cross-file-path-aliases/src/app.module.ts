import { Module } from "@nestjs/common";
import { AdminModule } from "./admin.module";
import { getServiceCommonImports } from "@shared/common-imports";
import { AppService } from "./app.service";

@Module({
  imports: getServiceCommonImports().concat([AdminModule]),
  providers: [AppService],
})
export class AppModule {}
