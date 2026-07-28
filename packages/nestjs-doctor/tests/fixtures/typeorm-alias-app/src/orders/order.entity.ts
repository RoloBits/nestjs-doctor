import { Column, Entity } from 'typeorm';
import { AppBaseEntity } from '~/common/base.entity';

@Entity()
export class Order extends AppBaseEntity {
  @Column()
  total: number;
}
