import { Controller, Get } from '@nestjs/common';

@Controller('anon')
export default class {
	@Get()
	ping() {
		return 'ok';
	}
}
