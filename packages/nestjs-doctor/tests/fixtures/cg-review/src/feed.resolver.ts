import { Audited } from './audited.decorator';
import { Resolver } from './graphql.stub';

@Resolver()
export class FeedResolver {
	@Audited()
	items() {
		return [];
	}
}
