import _ from 'lodash';
import axios from 'axios';

import { Collection } from './collections';
import {
  hasData, hasLinks, isSingularFetched, isList, isNull, isObject,
  isPluralFetched, isResource, isResourceIdentifier,
} from './utils';

export class Resource {
  /*  Subclass like this:
    *
    *     class Parent extends Resource {
    *       static name = 'Parent';
    *       static TYPE = 'parents';
    *     }
    *
    * - 'TYPE' is needed to map this resource to the proper URLs and map API
    *   responses to the proper registered classes
    * - 'name' is also needed in case your code gets minified because
    *   registering the Resource subclass to an 'API connection type' depends
    *   on the '.name' attribute of the class to be reliable.
    *
    * To register a Resource subclass to an API connection type, do this:
    *
    *     class FamilyApi extends Jsonapi {
    *       static HOST = 'https://api.families.com';
    *     }
    *     class Parent extends Resource {
    *       // ...
    *     }
    *     FamilyApi.register();
    */

  constructor(data = {}) {
    this._overwrite(data);
  }

  _overwrite({
    id = null,
    attributes = {},
    relationships = {},
    links = {},
    redirect = null,
    type = null,
    included = [],
    ...props
  }) {
    /*  Write to the basic attributes of the resource. The input should
      * resemble the body of the 'data' field of an {json:api} response. Used
      * by the constructor, 'reload' and 'save'.
      *
      * Apart from properties that resemble a {json:api} response, you can use
      * any key-value pair. Values that look like relationships will be
      * interpreted as such while everything else will be interpreted as an
      * attribute:
      *
      *     new Child({
      *       attributes: { name: 'Hercules' },
      *       relationships: {
      *         parent: { data: { type: 'parents', id: '2' } },
      *       },
      *     });
      *
      *     // is equivalent to
      *
      *     new Child({
      *       name: 'Hercules',
      *       parent: { data: { type: 'parents', id: '2' } },
      *     });
      *
      * Also, for relationships you can use other Resource objects:
      *
      *     const parent = new api.Parent({ id: '2' });
      *     new Child({ name: 'Hercules', parent });
      */

    if (type && type != this.constructor.TYPE) {
      throw new Error(
        `Received type '${type}', expected ${this.constructor.TYPE}`
      );
    }

    for (const key in props) {
      const value = props[key];
      if (
        isResource(value) || isResourceIdentifier(value) ||
        (hasData(value) && isResourceIdentifier(value.data)) ||
        hasLinks(value)
      ) {
        relationships[key] = value;
      }
      else {
        attributes[key] = value;
      }
    }

    this.id = id;
    this.attributes = attributes;
    this.links = links;
    this.redirect = redirect;

    [this.relationships, this.related] = [{}, {}];
    for (const key in relationships) {
      const value = relationships[key];
      this._setRelationship(key, value);
      const relationship = this.relationships[key];
      if (isNull(relationship) || hasData(relationship)) {
        this.setRelated(key, value);
      }
    }

    const includedMap = {};
    for (const includedItem of included) {
      const key = `${includedItem.type}__${includedItem.id}`;
      includedMap[key] = this.constructor.API.asResource(includedItem);
    }
    for (const relationshipName in this.relationships) {
      const relationship = this.relationships[relationshipName];
      if (isNull(relationship) || ! hasData(relationship)) {
        continue;
      }
      if (! isList(relationship.data)) { // Singular
        const key = `${relationship.data.type}__${relationship.data.id}`;
        if (key in includedMap) {
          this.setRelated(relationshipName, includedMap[key]);
        }
      }
      else {
        const related = [];
        for (const item of relationship.data) {
          const key = `${item.type}__${item.id}`;
          if (key in includedMap) {
            related.push(includedMap[key]);
          }
          else {
            related.push(item);
          }
        }
        this.setRelated(relationshipName, related);
      }
    }
  }

  _setRelationship(key, value) {
    // Set 'value' as 'key' relationship. For value we accept:
    //
    // - A Resource object
    // - A relationship (a dict with either 'data', 'links' or both)
    // - A resource identifier (a dict with 'type' and 'id')
    // - A list of a combination of the above (TODO)
    // - A dict with a 'data' field which is a list of a combination of
    //   the above
    // - null
    //
    // Regardless, in the end `this.relationships[key]` will resemble an API
    // response's relationships.
    
    if (isResource(value)) {
      this.relationships[key] = value.asRelationship();
    }
    // TODO: Plural relationships
    else {
      if (isObject(value)) {
        value = Object.assign({}, value);
      }
      if (! isNull(value) && isResourceIdentifier(value)) {
        value = { data: value };
      }
      if (isNull(value) || hasData(value) || hasLinks(value)) {
        this.relationships[key] = value;
      }
      else {
        throw new Error(`Invalid value '${value}' for relationship '${key}'`);
      }
    }
  }

  setRelated(key, value) {
    // Set 'value' as 'key' relationship's value. Works only with singular
    // relationships. For value we accept:
    //
    // - A Resource object
    // - A JSON representation of a Resource object
    // - A full API response of a Resource object
    // - A relationship (a dict with a 'data' field)
    // - A resource identifier (a dict with 'type' and 'id')
    // - A list of a combination of the above (TODO)
    // - A dict with a 'data' field with a list of a combination of the
    //   above as value
    // - null
    //
    // Regardless, in the end `this.related[key]` will be a Resource instance
    // or null.
    
    if (! (key in this.relationships)) {
      throw new Error(
        `Cannot change relationship ${key} because it is not an existing ` +
        'relationship'
      );
    }
    const relationship = this.relationships[key];
    if (isList(value) || (hasData(value) && isList(value.data))) {
      if (hasData(value)) {
        value = value.data;
      }
      this.related[key] = new Collection(
        this.constructor.API,
        relationship.links.related,
      );
      this.related[key].data = [];
      for (const item of value) {
        this.related[key].data.push(this.constructor.API.asResource(item));
      }
    }
    else {
      value = this.constructor.API.asResource(value);
      const nullToNotNull = isNull(relationship) && ! isNull(value);
      const notNullToNull = ! isNull(relationship) && isNull(value);
      const dataChanged = (
        ! isNull(relationship) &&
        ! isNull(value) &&
        ! _.isEqual(relationship.data, value.asResourceIdentifier())
      );
      if (nullToNotNull || notNullToNull || dataChanged) {
        if (! value) {
          this.relationships[key] = null;
        }
        else {
          this.relationships[key] = value.asRelationship();
        }
      }
      this.related[key] = value;
    }
  }

  get(key) {
    if (key in this.related) {
      return this.related[key];
    }
    else {
      return this.attributes[key];
    }
  }

  set(key, value) {
    if (key in this.relationships) {
      this.setRelated(key, value);
      this.relationships[key] = this.related[key].asRelationship();
    }
    else {
      this.attributes[key] = value;
    }
  }

  async reload(include = null) {
    // Fetch fresh data from the server for the object.

    const response = await this.constructor.API.request(
      'get',
      this.getItemUrl(),
      include ? { params: { include: include.join(',') } } : {},
    );
    if (response.status >= 300 && response.status < 400 && response.headers.Location) {
      this._overwrite({
        id: this.id,
        attributes: this.attributes,
        relationships: Object.assign({}, this.relationships, this.related),
        links: this.links,
        redirect: response.headers.Location,
      });
      return;
    }
    const body = response.data;
    const data = response.data.data;
    if ('included' in body) {
      data.included = body.included;
    }
    this._overwrite(data);
  }

  static async get(arg = null, { include = null } = {}) {
    if (arg === null || _.isPlainObject(arg)) {
      return this.list().get(arg);
    }
    else {
      const instance = new this({ id: arg });
      await instance.reload(include);
      return instance;
    }
  }

  async fetch(relationshipName, force = false) {
    /*  Fetches and returns a relationship, if it wasn't included during
      * construction. If the relationship was previously fetched, it will skip
      * the interaction with the server, unless force is set to true.
      *
      * After fetching, you can access the relationship via the 'related'
      * attribute, but since this behaves lazily without 'force = true', you
      * are advised to reuse 'fetch'.
      * */

    if (! (relationshipName in this.relationships)) {
      throw new Error(
        `Resource does not have relationship '${relationshipName}'`
      );
    }
    const relationship = this.relationships[relationshipName];
    if (isNull(relationship)) {
      return null;
    }
    const related = this.related[relationshipName];
    // TODO: isPluralFetched
    if ((isSingularFetched(related) || isPluralFetched(related)) && ! force) {
      return related;
    }
    if (_.isObject(relationship.data)) {
      await related.reload();
      return related;
    }
    else {
      const url = (relationship.links || {}).related;
      if (! url) {
        throw new Error(`Cannot fetch ${relationshipName}, no 'related' link`);
      }
      this.related[relationshipName] = new Collection(
        this.constructor.API,
        url,
      );
      return this.related[relationshipName];
    }
  }

  async save() {
    /*  Save the resource to the server. If the resource has no 'id', a POST
      * request will be saved, otherwise a PATCH request will. The resource's
      * fields will then be populated by the server's response, including a
      * server-generated 'id' if a POST request was made.
      *
      * - The first argument, if present, lists the resource's fields that will
      *   be sent.
      * - The last argument, if present, should be an object with key-value pairs
      *   that will be set on the resource right before saving.
      * - If no fields are specified by either argument, all the fields in
      *   'this.attributes' and 'this.relationships' will be sent
      *
      *     const parent = new api.Parent({ name: 'Zeus' });
      *     await parent.save();
      *
      *     parent.set('age', 54);
      *     await parent.save(['age']);
      *     // or
      *     await parent.save({ age: 54 });
      */
    let fields = [], props = {};
    if (arguments.length == 2) {
      fields = arguments[0];
      props = arguments[1];
    }
    else if (arguments.length == 1) {
      if (_.isArray(arguments[0])) {
        fields = arguments[0];
      }
      else if (_.isObject(arguments[0])) {
        props = arguments[0];
      }
    }

    for (const field in props) {
      const value = props[field];
      this.set(field, value);
      fields.push(field);
    }

    if (this.id) {
      await this._saveExisting(fields);
    }
    else {
      await this._saveNew(fields);
    }
  }

  async _saveExisting(fields = []) {
    if (fields.length == 0) {
      for (const field in this.attributes) {
        fields.push(field);
      }
      for (const field in this.related) {
        fields.push(field);
      }
    }

    const data = {
      ...this.asResourceIdentifier(),
      ...this._generateDataForSaving(fields),
    };
    const response = await this.constructor.API.request(
      'patch',
      this.getItemUrl(),
      { data: { data } },
    );
    this._postSave(response);
  }

  async _saveNew(fields = []) {
    if (fields.length == 0) {
      for (const field in this.attributes) {
        fields.push(field);
      }
      for (const field in this.related) {
        fields.push(field);
      }
    }

    let data = { type: this.constructor.TYPE };
    if (this.id) {
      data.id = this.id;
    }
    Object.assign(data, this._generateDataForSaving(fields));
    const response = await this.constructor.API.request(
      'post',
      this.constructor.getCollectionUrl(),
      { data: { data } },
    );
    this._postSave(response);
  }

  _generateDataForSaving(fields) {
    let result = {};
    for (const field of fields) {
      if (field in this.attributes) {
        if (! ('attributes' in result)) {
          result.attributes = {};
        }
        result.attributes[field] = this.attributes[field];
      }
      else if (field in this.relationships) {
        if (! ('relationships' in result)) {
          result.relationships = {};
        }
        result.relationships[field] = this.constructor.API.asResource(
          this.relationships[field]
        ).asRelationship();
      }
      else {
        throw new Error(`Unknown field '${field}'`);
      }
    }
    return result;
  }

  _postSave(response) {
    const data = response.data.data;
    let related = Object.assign({}, this.related);
    for (const relationshipName in related) {
      const relatedInstance = related[relationshipName];
      const oldId = relatedInstance.id;
      const newId = data.relationships[relationshipName].data.id;
      if (oldId != newId) {
        if (newId) {
          related[relationshipName] = this.constructor.API.new(
            data.relationships[relationshipName]
          );
        }
        else {
          delete related[relationshipName];
        }
      }
    }
    let relationships = data.relationships || {};
    delete data.relationships;
    Object.assign(relationships, related);
    this._overwrite({ relationships, ...data });
  }

  static async create(...args) {
    /*  Create and return a new resource. It is basically a shortcut for
      * creating a new object and calling 'save' on it straightaway:
      *
      *     const parent = new api.Parent({ name: 'Zeus' });
      *     await parent.save();
      *     // mostly equivalent to
      *     const parent = await api.Parent.create({ name: 'Zeus' });
      *
      * The only difference is that 'create' will *always* send a POST request,
      * so it is your only option to set a client-generated-ID:
      *
      *     // will send a POST request even though 'id' is set
      *     const parent = await api.Parent.create({ id: '1', name: 'Zeus' });
      */
    const instance = new this(...args);
    await instance._saveNew();
    return instance;
  }

  async delete() {
    /*  Deletes a resource from the API. After deletion, all the attributes and
      * relationships will remain but the 'id' will be set to null. This way
      * you can re-create the resource with the same fields or a subset:
      *
      *     await parent.delete();
      *     await parent.save(['name']);
      * */

    await this.constructor.API.request('delete', this.getItemUrl());
    this.id = null;
  }

  async change(field, value) {
    if (! (field in this.relationships)) {
      throw new Error(`${field} is not a relationship`);
    }

    value = value && this.constructor.API.asResource(value);
    await this._editRelationship(
      'patch',
      field,
      value && value.asResourceIdentifier(),
    );
    if (! this.relationships[field]) {
      this.relationships[field] = {};
    }
    this.relationships[field].data = value && value.asResourceIdentifier();
    if ((this.related[field] || {}).id != (value || {}).id) {
      this.related[field] = value;
    }
  }

  async add(field, values) {
    await this._editPluralRelationship('post', field, values);
  }

  async reset(field, values) {
    await this._editPluralRelationship('patch', field, values);
  }

  async remove(field, values) {
    await this._editPluralRelationship('delete', field, values);
  }

  async _editRelationship(method, field, data) {
    const url = _.get(
      this,
      `relationships.${field}.links.self`,
      `/${this.constructor.TYPE}/${this.id}/relationships/${field}`,
    );
    await this.constructor.API.request(method, url, { data: { data } });
  }

  async _editPluralRelationship(method, field, values) {
    const payload = values.map(
      (item) => this.constructor.API.asResource(item).asResourceIdentifier()
    );
    await this._editRelationship(method, field, payload);
  }

  static list() {
    return new Collection(this.API, this.getCollectionUrl());
  }

  async follow() {
    if (! this.redirect) {
      throw new Error('Cannot follow without redirect');
    }
    return await axios.get(this.redirect);
  }

  static async bulkCreate(args) {
    const data = [];
    for (const arg of args) {
      const resource = this.API.asResource(arg);
      const payloadItem = { type: this.TYPE };
      if (_.size(resource.attributes)) {
        payloadItem.attributes = resource.attributes;
      }
      if (_.size(resource.relationships)) {
        payloadItem.relationships = resource.relationships;
      }
      if (resource.id) {
        payloadItem.id = resource.id;
      }
      data.push(payloadItem);
    }
    const response = await this.API.request(
      'post',
      this.getCollectionUrl(),
      { data: { data } },
    );
    return Collection.fromData(this.API, response.data.data);
  }

  static async bulkDelete(args) {
    const data = [];
    for (const arg of args) {
      if (isResource(arg)) {
        data.push(arg.asResourceIdentifier());
      }
      else if (_.isPlainObject(arg)) {
        data.push(this.API.asResource(arg).asResourceIdentifier());
      }
      else {
        data.push({ type: this.TYPE, id: arg });
      }
    }
    await this.API.request(
      'delete',
      this.getCollectionUrl(),
      { data: { data } },
    );
    return data.length;
  }

  static async bulkUpdate(args, fields) {
    const data = [];
    for (const arg of args) {
      const resource = this.API.asResource(arg);
      const payloadItem = resource.asResourceIdentifier();
      for (const field of fields) {
        if (field in resource.attributes) {
          if (! ('attributes' in payloadItem)) {
            payloadItem.attributes = {};
          }
          payloadItem.attributes[field] = resource.attributes[field];
        }
        else if (field in resource.relationships) {
          if (! ('relationships' in payloadItem)) {
            payloadItem.relationships = {};
          }
          payloadItem.relationships[field] = resource.relationships[field];
        }
        else {
          throw new Error(`${field} is not part of one of the resources`);
        }
      }
      data.push(payloadItem);
    }
    const response = await this.API.request(
      'patch',
      this.getCollectionUrl(),
      { data: { data } },
    );
    return Collection.fromData(this.API, response.data.data);
  }

  getItemUrl() {
    let url = this.links.self;
    if (! url) {
      url = `/${this.constructor.TYPE}/${this.id}`;
    }
    return url;
  }

  static getCollectionUrl() {
    return `/${this.TYPE}`;
  }

  asResourceIdentifier() {
    return { type: this.constructor.TYPE, id: this.id };
  }

  asRelationship() {
    return { data: this.asResourceIdentifier() };
  }
}

for (const listMethod of ['filter', 'page', 'include', 'sort', 'fields']) {
  Resource[listMethod] = function(...args) {
    return this.list()[listMethod](...args);
  };
}
