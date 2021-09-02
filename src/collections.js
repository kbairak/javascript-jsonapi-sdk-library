export class Collection {
  /*  const children = api.Child.list();
    * await children.fetch();
    * console.log(children.data[0].get('name'));
    */
  constructor(API, url, params = null) {
    this._API = API;
    this._url = url;
    this._params = params;
    this.data = [];
    this.next = this.previous = null;
  }

  async fetch() {
    const response = await this._API.request(
      'get',
      this._url,
      { params: this._params },
    );
    this.next = (response.data.links || {}).next || null;
    this.previous = (response.data.links || {}).previous || null;
    for (const item of response.data.data) {
      this.data.push(this._API.asResource(item));
    }
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
      const value = filters[key];
      const parts = key.split('__');
      const filterKey = [`filter[${parts[0]}]`];
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        filterKey.push(`[${part}]`);
      }
      params[filterKey.join('')] = value;
    }
    return this.extra(params);
  }

  // TODO: page, include, sort, fields
}
