import { JsonApi } from './apis';
import { Resource } from './resources';

class TransifexApi extends JsonApi {
  static HOST = 'https://rest.api.transifex.com';
}

class Organization extends Resource {
  static name = 'Organization';

  static TYPE = 'organizations';
}
TransifexApi.register(Organization);

class Project extends Resource {
  static name = 'Project';

  static TYPE = 'projects';
}
TransifexApi.register(Project);

export const transifexApi = new TransifexApi();
