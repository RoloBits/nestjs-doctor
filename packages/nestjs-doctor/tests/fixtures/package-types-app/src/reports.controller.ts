import { ApiController, ReadAll } from '@fixture/rest';

@ApiController('reports')
export class ReportsController {
  @ReadAll()
  list() {
    return [];
  }
}
