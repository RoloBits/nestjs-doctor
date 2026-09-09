import { Injectable } from '@nestjs/common';
import { BaseOps } from './base.service';

@Injectable()
export class FirstOps extends BaseOps {
	run(): string {
		return this.shared();
	}
}

@Injectable()
export class SecondOps extends BaseOps {
	run(): string {
		return this.shared();
	}
}
