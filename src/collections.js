import _ from 'lodash';

import { Resource } from './resources';
import { isNull, hasData } from './utils';

export class Collection {
  constructor(API, url, params = null) {
    this._API = API;
    this._url = url;
    this._params = params;
    this.data = null;
    this.next = this.previous = null;
  }

  async fetch() {
    if (! isNull(this.data)) {
      return;
    }

    const response = await this._API.request(
      'get',
      this._url,
      { params: this._params },
    );

    const includedMap = {};
    if ('included' in response.data) {
      for (const includedItem of response.data.included) {
        const key = `${includedItem.type}__${includedItem.id}`;
        includedMap[key] = includedItem;
      }
    }

    this.data = [];
    for (const item of response.data.data) {
      const related = {};
      for (const name in (item.relationships || {})) {
        const relationship = item.relationships[name];
        if (isNull(relationship) || ! hasData(relationship)) {
          continue;
        }
        const key = `${relationship.data.type}__${relationship.data.id}`;
        if (key in includedMap) {
          related[name] = this._API.new(includedMap[key]);
        }
      }
      const relationships = item.relationships || {};
      delete item.relationships;
      Object.assign(relationships, related);
      this.data.push(this._API.new({ relationships, ...item }));
    }

    this.next = (response.data.links || {}).next || null;
    this.previous = (response.data.links || {}).previous || null;
  }

  async getNext() {
    const page = new this.constructor(this._API, this.next);
    await page.fetch();
    return page;
  }

  async getPrevious() {
    const page = new this.constructor(this._API, this.previous);
    await page.fetch();
    return page;
  }

  extra(params) {
    const newParams = Object.assign({}, this._params || {}, params);
    return new this.constructor(this._API, this._url, newParams);
  }

  filter(filters) {
    const params = {};
    for (const key in filters) {
      let value = filters[key];
      const parts = key.split('__');
      const filterKey = [`filter[${parts[0]}]`];
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        filterKey.push(`[${part}]`);
      }
      if (value instanceof Resource) {
        value = value.id;
      }
      params[filterKey.join('')] = value;
    }
    return this.extra(params);
  }

  page(arg) {
    let params = {};
    if (_.isPlainObject(arg)) {
      for (const key in arg) {
        const value = arg[key];
        params[`page[${key}]`] = value;
      }
    }
    else {
      params.page = arg;
    }
    return this.extra(params);
  }

  include(...args) {
    return this.extra({ include: args.join(',') });
  }

  sort(...args) {
    return this.extra({ sort: args.join(',') });
  }

  fields(...args) {
    return this.extra({ fields: args.join(',') });
  }

  async get(filters = {}) {
    const qs = this.filter(filters);
    await qs.fetch();
    if (qs.data.length == 0) {
      throw new Error('Does not exist');
    }
    else if (qs.data.length > 1) {
      throw new Error(`Multiple objects returned (${qs.data.length})`);
    }
    else {
      return qs.data[0];
    }
  }

  async * allPages() {
    await this.fetch();
    let page = this;
    while (true) {
      yield page;
      if (page.next) {
        page = await page.getNext();
      }
      else {
        break;
      }
    }
  }

  async * all() {
    for await (const page of this.allPages()) {
      for (const item of page.data) {
        yield item;
      }
    }
  }
}
