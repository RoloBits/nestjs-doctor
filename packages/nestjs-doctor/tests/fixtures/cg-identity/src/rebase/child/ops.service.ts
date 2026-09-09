import { Injectable } from '@nestjs/common';
import { Ops as BaseOps } from '../base/ops.service';

@Injectable()
export class Ops extends BaseOps {
	run(): string {
		return this.fromBase();
	}
}
