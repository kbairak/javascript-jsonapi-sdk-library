/* global expect */

import axios from 'axios';

import { Resource } from '../src/resources';
import { JsonApi } from '../src/apis';

export class Api extends JsonApi {
  static HOST = 'https://api.families.com';
}
export class Item extends Resource {
  static name = 'Item';
  static TYPE = 'items';
}
Api.register(Item);
export class Child extends Resource {
  static name = 'Child';
  static TYPE = 'children';
}
Api.register(Child);
export class Parent extends Resource {
  static name = 'Parent';
  static TYPE = 'parents';
}
Api.register(Parent);
export const api = new Api({ auth: 'MYTOKEN' });

export function expectRequestMock(
  method, url, { data = null, params = null } = {},
) {
  expect(axios.request).toHaveBeenCalledWith({
    method,
    url: 'https://api.families.com' + url,
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Authorization: 'Bearer MYTOKEN',
    },
    data,
    params,
  });
}
