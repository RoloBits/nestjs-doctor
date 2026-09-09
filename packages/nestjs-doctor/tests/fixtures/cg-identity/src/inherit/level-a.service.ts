import { Injectable } from '@nestjs/common';
import { LevelB } from './levels';

@Injectable()
export class LevelA extends LevelB {
	go(): string {
		return this.deep();
	}
}
