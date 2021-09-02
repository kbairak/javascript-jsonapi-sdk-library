import axios from 'axios';
import _ from 'lodash';

import { Resource } from './resources';
import { isNull, isResource } from './utils';

export class JsonApi {
  constructor(props = {}) {
    this.host = this.constructor.HOST;
    this.auth = null;
    this.registry = {};

    this.setup(props);
  }

  setup({ host, auth } = {}) {
    if (host) {
      this.host = host;
    }
    if (auth) {
      if (_.isFunction(auth)) {
        this.auth = auth;
      } else {
        this.auth = () => { return { Authorization: `Bearer ${auth}` }; };
      }
    }
  }

  static register(parentCls) {
    /*  Register a API resource type with this API connection *type* (since
      * this is a static method). When a new API connection *instance* is
      * created, it will use this to build its own registry in order to
      * identify API types with the relevant API resource classes.
      */
    function get() {
      const jsonApiInstance = this;
      let childCls = jsonApiInstance.registry[parentCls.TYPE];
      if (! childCls) {
        childCls = class extends parentCls {
          static API = jsonApiInstance;
        };
        jsonApiInstance.registry[parentCls.TYPE] = childCls;
      }
      return childCls;
    }
    Object.defineProperty(this.prototype, parentCls.name, { get });
    Object.defineProperty(this.prototype, parentCls.TYPE, { get });
  }

  async request(method, url, { data = null, params = null } = {}) {
    if (url[0] == '/') {
      url = this.host + url;
    }
    const headers = {
      'Content-Type': 'application/vnd.api+json',
      ...this.auth(),
    };
    const response = await axios.request({
      method, url, headers, data, params,
    });
    return response;
  }

  new({ type, ...props }) {
    /*  Return a new resource instance, using the appropriate Resource
      * subclass, provided that it has been registered with this API instance.
      */

    const jsonApiInstance = this;
    let cls = this.registry[type];
    if (! cls) {
      this.registry[type] = class extends Resource {
        static TYPE = type;
        static API = jsonApiInstance;
      };
    }
    return new this.registry[type](props);
  }

  asResource(value) {
    // Little convenience function when we don't know if we are dealing with a
    // Resource instance or a dict describing a relationship. Will use the
    // appropriate Resource subclass.

    if (isNull(value) || isResource(value)) {
      return value;
    }
    else {
      if ('data' in value) {
        value = value.data;
      }
      return this.new(value);
    }
  }
}