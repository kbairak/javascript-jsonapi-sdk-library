/* global test expect, jest */

import axios from 'axios';

import { api, expectRequestMock } from './utils';

jest.mock('axios');

test('Simple Resource constructor', () => {
  const item = new api.Item({
    id: '1', attributes: { name: 'one' }, links: { self: '/items/1' },
  });
  expect(item).toEqual({
    id: '1',
    attributes: { name: 'one' },
    links: { self: '/items/1' },
    relationships: {},
    related: {},
    redirect: null,
  });
});

test('Constructor with JSON relationship', () => {
  const child = new api.Child({
    relationships: { parent: {
      data: { type: 'parents', id: '1' },
      links: {
        self: '/children/2/relationships/parent',
        related: '/parents/1',
      },
    } },
  });
  expect(child).toEqual({
    id: null,
    attributes: {},
    links: {},
    redirect: null,
    relationships: { parent: {
      data: { type: 'parents', id: '1' },
      links: {
        self: '/children/2/relationships/parent',
        related: '/parents/1',
      },
    } },
    related: { parent: {
      id: '1',
      attributes: {},
      links: {},
      redirect: null,
      relationships: {},
      related: {},
    } },
  });
  expect(child.related.parent.constructor.TYPE).toEqual('parents');
  expect(child.related.parent.constructor.API).toBe(api);
});

test('Constructor with Resource relationship', () => {
  const parent = new api.Parent({ id: '1' });
  const child = new api.Child({ relationships: { parent: parent } });
  expect(child).toEqual({
    id: null,
    attributes: {},
    links: {},
    redirect: null,
    relationships: { parent: { data: { type: 'parents', id: '1' } } },
    related: { parent: {
      id: '1',
      attributes: {},
      links: {},
      redirect: null,
      relationships: {},
      related: {},
    } },
  });
  expect(child.related.parent.constructor.TYPE).toEqual('parents');
  expect(child.related.parent.constructor.API).toBe(api);
});

test('Constructor with null relationship', () => {
  const child = new api.Child({ relationships: { parent: null } });
  expect(child).toEqual({
    id: null,
    attributes: {},
    links: {},
    redirect: null,
    relationships: { parent: null },
    related: { parent: null },
  });
});

test('Constructor with resource identifier relationship', () => {
  const child = new api.Child({
    relationships: { parent: { type: 'parents', id: '1' } },
  });
  expect(child).toEqual({
    id: null,
    attributes: {},
    links: {},
    redirect: null,
    relationships: { parent: {
      data: { type: 'parents', id: '1' },
    } },
    related: { parent: {
      id: '1',
      attributes: {},
      links: {},
      redirect: null,
      relationships: {},
      related: {},
    } },
  });
  expect(child.related.parent.constructor.TYPE).toEqual('parents');
  expect(child.related.parent.constructor.API).toBe(api);
});

test('Constructor with magic props', () => {
  const check = () => {
    expect(item).toEqual({
      id: null,
      attributes: { name: 'the item' },
      links: {},
      redirect: null,
      relationships: { parent: { data: { type: 'parents', id: '1' } } },
      related: { parent: {
        id: '1',
        attributes: {},
        links: {},
        redirect: null,
        relationships: {},
        related: {},
      } },
    });
  };

  let item = new api.Child({
    name: 'the item',
    parent: new api.Parent({ id: '1' }),
  });
  check();

  item = new api.Child({
    name: 'the item',
    parent: { type: 'parents', id: '1' },
  });
  check();

  item = new api.Child({
    name: 'the item',
    parent: { data: { type: 'parents', id: '1' } },
  });
  check();
});

test('set', () => {
  const child = new api.Child({ relationships: { parent: null } });
  child.set('name', 'my name');
  expect(child).toEqual({
    id: null,
    attributes: { name: 'my name' },
    links: {},
    redirect: null,
    relationships: { parent: null },
    related: { parent: null },
  });
  child.set('parent', new api.Parent({ id: '1' }));
  expect(child).toEqual({
    id: null,
    attributes: { name: 'my name' },
    links: {},
    redirect: null,
    relationships: { parent: { data: { type: 'parents', id: '1' } } },
    related: { parent: {
      id: '1',
      attributes: {},
      links: {},
      redirect: null,
      relationships: {},
      related: {},
    } },
  });
});

test('reload', async () => {
  const item = new api.Item({ id: '1' });
  axios.request.mockResolvedValue(Promise.resolve({ data: { data: {
    id: '1',
    attributes: { name: 'the item' },
  } } }));
  await item.reload();
  expect(item).toEqual({
    id: '1',
    attributes: { name: 'the item' },
    links: {},
    redirect: null,
    relationships: {},
    related: {},
  });
  expectRequestMock('get', '/items/1');
});

test('static get', async () => {
  axios.request.mockResolvedValue(Promise.resolve({ data: { data: {
    id: '1',
    attributes: { name: 'the item' },
  } } }));
  const item = await api.Item.get('1');
  expect(item).toEqual({
    id: '1',
    attributes: { name: 'the item' },
    links: {},
    redirect: null,
    relationships: {},
    related: {},
  });
  expectRequestMock('get', '/items/1');
});

test('fetch', async () => {
  const child = new api.Child({
    id: '1',
    parent: { data: { type: 'parents', id: '2' } },
  });
  axios.request.mockResolvedValue(Promise.resolve({ data: { data: {
    id: '2',
    attributes: { name: 'the parent' },
  } } }));
  const parent = await child.fetch('parent');
  expect(parent).toEqual({
    id: '2',
    attributes: { name: 'the parent' },
    links: {},
    redirect: null,
    relationships: {},
    related: {},
  });
  expect(child).toEqual({
    id: '1',
    attributes: {},
    links: {},
    redirect: null,
    relationships: { parent: parent.asRelationship() },
    related: { parent },
  });
  expectRequestMock('get', '/parents/2');
});

test('patch', async () => {
  const parent2 = new api.Parent({ id: '2' });
  const parent3 = new api.Parent({ id: '3' });
  let child;

  function before() {
    child = new api.Child({ id: '1', name: 'John', parent: parent2 });
    axios.request.mockResolvedValue(Promise.resolve({ data: { data: {
      id: '1',
      attributes: { name: 'Bill' },
      relationships: { parent: { data: { type: 'parents', id: '3' } } },
    } } }));
  }

  function after() {
    expectRequestMock(
      'patch',
      '/children/1',
      { data: { data: {
        type: 'children',
        id: '1',
        attributes: { name: 'Bill' },
        relationships: { parent: { data: { type: 'parents', id: '3' } } },
      } } },
    );
    expect(child).toEqual({
      id: '1',
      attributes: { name: 'Bill' },
      links: {},
      redirect: null,
      relationships: { parent: { data: { type: 'parents', id: '3' } } },
      related: { parent: parent3 },
    });
  }

  before();
  child.set('name', 'Bill');
  child.set('parent', parent3);
  await child.save(['name', 'parent']);
  after();

  before();
  await child.save({ name: 'Bill', parent: parent3 });
  after();

  before();
  child.set('name', 'Bill');
  await child.save(['name'], { parent: parent3 });
  after();
});

test('save new', async () => {
  const child = new api.Child({ name: 'John' });
  axios.request.mockResolvedValue(Promise.resolve({ data: { data: {
    id: '1',
    attributes: { name: 'John', created: 'now' },
  } } }));
  await child.save();
  expectRequestMock(
    'post',
    '/children',
    { data: { data: { type: 'children', attributes: { name: 'John' } } } },
  );
  expect(child).toEqual({
    id: '1',
    attributes: { name: 'John', created: 'now' },
    links: {},
    redirect: null,
    relationships: {},
    related: {},
  });
});

test('create', async () => {
  axios.request.mockResolvedValue(Promise.resolve({ data: { data: {
    id: '1',
    attributes: { name: 'John', created: 'now' },
  } } }));
  const child = await api.Child.create({ name: 'John' });
  expectRequestMock(
    'post',
    '/children',
    { data: { data: { type: 'children', attributes: { name: 'John' } } } },
  );
  expect(child).toEqual({
    id: '1',
    attributes: { name: 'John', created: 'now' },
    links: {},
    redirect: null,
    relationships: {},
    related: {},
  });
});

test('delete', async () => {
  const child = new api.Child({ id: '1', name: 'John' });
  axios.request.mockResolvedValue(Promise.resolve({}));
  await child.delete();
  expectRequestMock('delete', '/children/1');
  expect(child).toEqual({
    id: null,
    attributes: { name: 'John' },
    links: {},
    redirect: null,
    relationships: {},
    related: {},
  });
});

test('change', async () => {
  const child = new api.Child({ id: '1', relationships: { parent: null } });
  axios.request.mockResolvedValue(Promise.resolve({}));

  await child.change('parent', new api.Parent({ id: '2' }));
  expectRequestMock(
    'patch',
    '/children/1/relationships/parent',
    { data: { data: { type: 'parents' , id: '2' } } },
  );
  expect(child.related.parent.id).toBe('2');

  await child.change('parent', null);
  expectRequestMock(
    'patch',
    '/children/1/relationships/parent',
    { data: { data: { type: 'parents', id: '2' } } },
  );
  expect(child.related.parent).toBeNull();
});

test('edit plural relationships', async () => {
  const parent = new api.Parent({
    id: '1',
    relationships: {
      children: { links: { self: '/parents/1/relationships/children/' } },
    },
  });
  axios.request.mockResolvedValue(Promise.resolve({}));
  for (const row of [
    ['add', 'post'], ['reset', 'patch'], ['remove', 'delete'],
  ]) {
    const [instanceMethod, httpMethod] = row;
    await parent[instanceMethod](
      'children',
      [new api.Child({ id: '2' }), new api.Child({ id: '3' })],
    );
    expectRequestMock(
      httpMethod,
      '/parents/1/relationships/children/',
      { data: { data: [
        { type: 'children', id: '2' },
        { type: 'children', id: '3' },
      ] } },
    );
  }
});

test('constructor with include', () => {
  const child = new api.Child({
    id: '1',
    parent: { type: 'parents', id: '2' },
    included: [{ type: 'parents', id: '2', attributes: { name: 'Zeus' } }],
  });
  expect(child.get('parent').get('name')).toEqual('Zeus');
});

test('get with include', async () => {
  axios.request.mockResolvedValue(Promise.resolve({ data: {
    data: {
      type: 'children',
      id: '1',
      relationships: { parent: { data: { type: 'parents', id: '2' } } },
    },
    included: [{ type: 'parents', id: '2', attributes: { name: 'Zeus' } }],
  } }));
  const child = await api.Child.get('1', { include: ['parent'] });
  expectRequestMock('get', '/children/1', { params: { include: 'parent' } });
  expect(child.get('parent').get('name')).toEqual('Zeus');
});

test('redirect', async () => {
  const item = new api.Item({ id: '1' });
  axios.request.mockResolvedValue(Promise.resolve({
    status: 302,
    headers: { Location: 'http://redirect.com' },
  }));
  await item.reload();
  axios.get.mockResolvedValue(Promise.resolve('Redirect output'));
  const response = await item.follow();

  expect(axios.get).toHaveBeenCalledWith('http://redirect.com');
  expect(response).toEqual('Redirect output');
});

test('get with included plural relationship', async () => {
  axios.request.mockResolvedValue(Promise.resolve({ data: {
    data: {
      type: 'parents',
      relationships: { children: {
        links: { related: '/parents/1/children' },
        data: [{ type: 'children', id: '2' }, { type: 'children', id: '3' }],
      } },
    },
    included: [
      {
        type: 'children',
        id: '2',
        attributes: { name: 'Hercules' },
        relationships: { parent: { data: { type: 'parents', id: '1' } } },
      },
      {
        type: 'children',
        id: '3',
        attributes: { name: 'Achilles' },
        relationships: { parent: { data: { type: 'parents', id: '1' } } },
      },
    ],
  } }));
  const parent = await api.Parent.get('1', { include: ['children'] });
  expect(parent.get('children')).toEqual({
    _API: api,
    _url: '/parents/1/children',
    _params: null,
    data: [
      {
        id: '2',
        attributes: { name: 'Hercules' },
        links: {},
        redirect: null,
        relationships: { parent: { data: { type: 'parents', id: '1' } } },
        related: { parent: {
          id: '1',
          attributes: {},
          links: {},
          redirect: null,
          relationships: {},
          related: {},
        } },
      },
      {
        id: '3',
        attributes: { name: 'Achilles' },
        links: {},
        redirect: null,
        relationships: { parent: { data: { type: 'parents', id: '1' } } },
        related: { parent: {
          id: '1',
          attributes: {},
          links: {},
          redirect: null,
          relationships: {},
          related: {},
        } },
      },
    ],
    previous: null,
    next: null,
  });
});
