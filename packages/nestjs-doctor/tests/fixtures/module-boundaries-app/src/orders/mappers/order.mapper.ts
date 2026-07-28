import { OrderEntity } from '../entities/order.entity';

export const toId = (order: OrderEntity): string => order.id;
