import { Module } from "@nestjs/common";
import { AdminService } from "./admin.service";

@Module({
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
