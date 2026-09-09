import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { EdgeService } from './edge.service';
import { NotifyService } from './notify.service';
import { OrdersController } from './orders.controller';
import { OrdersRepo } from './orders.repo';
import { OrdersService } from './orders.service';
import { PrismaService } from './prisma.service';

@Module({
	controllers: [OrdersController],
	providers: [
		AuditService,
		EdgeService,
		NotifyService,
		OrdersRepo,
		OrdersService,
		PrismaService,
	],
})
export class AppModule {}
