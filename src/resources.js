import _ from 'lodash';
import axios from 'axios';

import { hasData, hasLinks, isList, isNull, isObject, isPluralFetched,
         isResource, isResourceIdentifier, isSingularFetched } from './utils';
import { Collection } from './collections';

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

  _overwrite({ id = null,
               attributes = {},
               relationships = {},
               links = {},
               redirect = null,
               type = null,
               included = [],
               ...props }) {
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

    if (type && type !== this.constructor.TYPE) {
      throw new Error(
        `Received type '${type}', expected ${this.constructor.TYPE}`,
      );
    }

    for (const key in props) {
      const value = props[key];
      if (
        // Parent: { type: 'parents', id: '1' }
        isResourceIdentifier(value) ||

        // Parent: new Parent({ id: '1' })
        isResource(value) ||

        (isObject(value) && (

          // Parent: { links: { related: 'related' } }
          hasLinks(value) ||

          (hasData(value) && (

            // Parent: { data: { type: 'parents', id: '1' } }
            isResourceIdentifier(value.data) ||

            // Parent: { data: new Parent({ id: '1' }) }
            isResource(value.data) ||

            // Children: { data: [{ type: 'children', id: '1' },
            //                    New Child({ id: '1' })] }
            _.every(value.data, (item) => (isResourceIdentifier(item) ||
                                           isResource(item)))
          ))
        )) ||

        // Children: [{ type: 'children', id: '1' }, new Child({ id: '1' })]
        isList(value) && value.length > 0 && _.every(value, (item) => (
          isResourceIdentifier(item) ||
          isResource(item)
        ))
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

    this.relationships = _.pickBy(this.relationships,
                                  (value, key) => key in relationships);
    this.related = _.pickBy(this.related,
                            (value, key) => key in relationships);
    const includedMap = {};
    for (const includedItem of included) {
      const key = `${includedItem.type}__${includedItem.id}`;
      includedMap[key] = this.constructor.API.asResource(includedItem);
    }
    for (const key in relationships) {
      const value = relationships[key];
      this._setRelated(key, value, includedMap);
    }
  }

  _setRelated(relationshipName, value, includedMap = null) {
    if (! includedMap) {
      includedMap = {};
    }
    if (! value) {
      this.relationships[relationshipName] = null;
      this.related[relationshipName] = null;
    }
    else if (
      isList(value) ||
      (isObject(value) && isList(value.data)) ||
      (isObject(value) && hasLinks(value) && ! hasData(value))
    ) {
      this.relationships[relationshipName] = {};
      const relationship = this.relationships[relationshipName];
      if (isObject(value) && hasLinks(value)) {
        relationship.links = value.links;
      }
      if (hasData(value)) {
        value = value.data;
      }
      if (isList(value)) {
        let datas = [], resources = [];
        for (const item of value) {
          const resource = this.constructor.API.asResource(item);
          const data = resource.asResourceIdentifier();
          datas.push(data);
          const key = `${data.type}__${data.id}`;
          if (key in includedMap) {
            resources.push(includedMap[key]);
          }
          else {
            resources.push(resource);
          }
        }

        relationship.data = datas;
        let url = null;
        if ('links' in relationship && 'related' in relationship.links) {
          url = relationship.links.related;
        }

        if (
          ! this.related[relationshipName] ||
          ! this.related[relationshipName].data ||
          this.related[relationshipName].data.length !== resources.length ||
          _.some(
            _.zip(this.related[relationshipName].data, resources),
            ([ previous, next ]) => (previous.id !== next.id ||
                                     _.size(next.attributes) > 0 ||
                                     _.size(next.relationships) > 0),
          )
        ) {
          this.related[relationshipName] = Collection.fromData(
            this.constructor.API, resources, url,
          );
        }
      }
    }
    else {
      let resource, data, links = null;
      if (isObject(value)) {
        if (hasData(value)) {
          data = value.data;
          if ('links' in value) {
            links = value.links;
          }
        }
        else {
          data = value;
        }
        resource = this.constructor.API.new(data);
      }
      else if (isResource(value)) {
        resource = value;
        data = resource.asResourceIdentifier();
      }
      else {
        throw new Error(`Cannot set relationship '${relationshipName}'`);
      }
      const key = `${data.type}__${data.id}`;
      if (key in includedMap) {
        resource = includedMap[key];
      }

      this.relationships[relationshipName] = { data };
      if (links) {
        this.relationships[relationshipName].links = links;
      }

      if (
        (this.related[relationshipName] || {}).id !== resource.id ||
        _.size(resource.attributes) > 0 ||
        _.size(resource.relationships) > 0
      ) {
        this.related[relationshipName] = resource;
      }
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
      this._setRelated(key, value);
      this.relationships[key] = this.related[key].asRelationship();
    }
    else {
      this.attributes[key] = value;
    }
  }

  async reload(include = null) {
    // Fetch fresh data from the server for the object.

    const response = await this.constructor.API.request({
      method: 'get',
      url: this.getItemUrl(),
      params: include ? { include: include.join(',') } : null,
    });
    if (response.status >= 300 &&
        response.status < 400 &&
        response.headers.Location) {
      this._overwrite({
        id: this.id,
        attributes: this.attributes,
        relationships: { ...this.relationships, ...this.related },
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
        `Resource does not have relationship '${relationshipName}'`,
      );
    }
    const relationship = this.relationships[relationshipName];
    if (isNull(relationship)) {
      return null;
    }
    const related = this.related[relationshipName];
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
      this.related[relationshipName] = new Collection(this.constructor.API,
                                                      url);
      return this.related[relationshipName];
    }
  }

  async save(firstArg = null, secondArg = null) {
    /*  Save the resource to the server. If the resource has no 'id', a POST
      * request will be saved, otherwise a PATCH request will. The resource's
      * fields will then be populated by the server's response, including a
      * server-generated 'id' if a POST request was made.
      *
      * - The first argument, if present, lists the resource's fields that will
      *   be sent.
      * - The last argument, if present, should be an object with key-value
      *   pairs that will be set on the resource right before saving.
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
    if (firstArg && secondArg) {
      fields = firstArg;
      props = secondArg;
    }
    else if (firstArg) {
      if (_.isArray(firstArg)) {
        fields = firstArg;
      }
      else if (_.isObject(firstArg)) {
        props = firstArg;
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
    if (fields.length === 0) {
      for (const field in this.attributes) {
        fields.push(field);
      }
      for (const field in this.related) {
        fields.push(field);
      }
    }

    const data = { ...this.asResourceIdentifier(),
                   ...this._generateDataForSaving(fields) };
    const response = await this.constructor.API.request({
      method: 'patch',
      url: this.getItemUrl(),
      data: { data },
    });
    this._postSave(response);
  }

  async _saveNew(fields = []) {
    if (fields.length === 0) {
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
    const response = await this.constructor.API.request({
      method: 'post',
      url: this.constructor.getCollectionUrl(),
      data: { data },
    });
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
          this.relationships[field],
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
    let related = { ...this.related };
    for (const relationshipName in related) {
      const relatedInstance = related[relationshipName];
      const oldId = relatedInstance.id;
      const newId = data.relationships[relationshipName].data.id;
      if (oldId !== newId) {
        if (newId) {
          related[relationshipName] = this.constructor.API.new(
            data.relationships[relationshipName],
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

    await this.constructor.API.request({ method: 'delete',
                                         url: this.getItemUrl() });
    this.id = null;
  }

  async change(field, value) {
    if (! (field in this.relationships)) {
      throw new Error(`${field} is not a relationship`);
    }

    value = value && this.constructor.API.asResource(value);
    await this._editRelationship('patch',
                                 field,
                                 value && value.asResourceIdentifier());
    if (! this.relationships[field]) {
      this.relationships[field] = {};
    }
    this.relationships[field].data = value && value.asResourceIdentifier();
    if ((this.related[field] || {}).id !== (value || {}).id) {
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
    await this.constructor.API.request({ method, url, data: { data } });
  }

  async _editPluralRelationship(method, field, values) {
    const payload = values.map(
      (item) => this.constructor.API.asResource(item).asResourceIdentifier(),
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
    const response = await this.API.request({ method: 'post',
                                              url: this.getCollectionUrl(),
                                              data: { data },
                                              bulk: true });
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
    await this.API.request({ method: 'delete',
                             url: this.getCollectionUrl(),
                             data: { data },
                             bulk: true });
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
    const response = await this.API.request({ method: 'patch',
                                              url: this.getCollectionUrl(),
                                              data: { data },
                                              bulk: true });
    return Collection.fromData(this.API, response.data.data);
  }

  static async createWithForm(...props) {
    const response = await this.API.request({ method: 'post',
                                              url: this.getCollectionUrl(),
                                              ...props });
    const body = response.data;
    const data = body.data;
    const included = body.included;
    if (included) {
      data.included = included;
    }
    return this.API.new(data);
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

for (const listMethod of [ 'filter', 'page', 'include', 'sort', 'fields' ]) {
  Resource[listMethod] = function(...args) {
    return this.list()[listMethod](...args);
  };
}
