/* global test expect jest */

import './utils';

import axios from 'axios';

import { JsonApi } from '../src/apis';

jest.mock('axios');

test('JsonApi contructor and setup behave the same', () => {
  let props = { host: 1, auth: 2 };
  let api1 = new JsonApi(props);
  let api2 = new JsonApi();
  api2.setup(props);

  expect(api1.host).toEqual(api2.host);
  expect(api1.auth()).toEqual(api2.auth());

  props = { host: 1, auth: () => 2 };
  api1 = new JsonApi(props);
  api2 = new JsonApi();
  api2.setup(props);

  expect(api1.host).toEqual(api2.host);
  expect(api1.auth()).toEqual(api2.auth());
});

test('JsonApi.register', () => {
  class Api extends JsonApi {
    static HOST = 'api.com';
  }
  class Resource {
    static TYPE = 'resources';
  }
  Api.register(Resource);

  const api = new Api();
  expect(api.Resource).toBeTruthy();
  expect(api.Resource.prototype instanceof Resource).toBeTruthy();
  expect(api.Resource.TYPE).toBe('resources');
  expect(api.Resource.API).toBe(api);
  expect(api.registry.resources).toEqual(api.Resource);
});

test('Jsonapi.request with GET', async () => {
  class Api extends JsonApi {
    static HOST = 'https://api.com';
  }
  const api = new Api({ auth: 'MYTOKEN' });
  axios.request.mockResolvedValue(Promise.resolve('mock response'));
  const actualResponse = await api.request('get', '/path');
  expect(actualResponse).toBe('mock response');
  expect(axios.request).toHaveBeenCalledWith({
    method: 'get',
    url: 'https://api.com/path',
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Authorization: 'Bearer MYTOKEN',
    },
    data: null,
    params: null,
  });
});
