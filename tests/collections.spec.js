/* global test jest expect */

import '@babel/polyfill';

import axios from 'axios';

import { Collection } from '../src/collections';
import { api, expectRequestMock } from './utils';

jest.mock('axios');


test('list', async () => {
  let collection;
  async function testList() {
    axios.request.mockResolvedValue(Promise.resolve({ data: { data: [
      { type: 'items', id: '1', attributes: { name: 'item 1' } },
      { type: 'items', id: '2', attributes: { name: 'item 2' } },
    ] } }));
    await collection.fetch();

    expectRequestMock('get', '/items');
    expect(collection).toEqual({
      _API: api,
      _url: '/items',
      _params: null,
      data: [
        {
          id: '1',
          attributes: { name: 'item 1' },
          links: {},
          redirect: null,
          relationships: {},
          related: {},
        },
        {
          id: '2',
          attributes: { name: 'item 2' },
          links: {},
          redirect: null,
          relationships: {},
          related: {},
        },
      ],
      next: null,
      previous: null,
    });
  }

  collection = new Collection(api, '/items');
  await testList(collection);

  collection = api.Item.list();
  await testList(collection);
});

test('pagination', async () => {
  const page1 = api.Item.list();
  const response1 = Promise.resolve({ data: {
    data: [{ type: 'items', id: '1' }, { type: 'items', id: '2' }],
    links: { next: '/items?page=2' },
  } });
  axios.request.mockResolvedValue(response1);
  await page1.fetch();
  const response2 = Promise.resolve({ data: {
    data: [{ type: 'items', id: '3' }, { type: 'items', id: '4' }],
    links: { previous: '/items' },
  } });
  axios.request.mockResolvedValue(response2);
  const page2 = await page1.getNext();
  expect(page2).toEqual({
    _API: api,
    _url: '/items?page=2',
    _params: null,
    data: [
      {
        id: '3',
        attributes: {},
        links: {},
        redirect: null,
        relationships: {},
        related: {},
      },
      {
        id: '4',
        attributes: {},
        links: {},
        redirect: null,
        relationships: {},
        related: {},
      },
    ],
    next: null,
    previous: '/items',
  });
  axios.request.mockResolvedValue(Promise.resolve(response1));
  const newPage1 = await page2.getPrevious();
  expect(newPage1).toEqual(page1);
});

test('extra', async () => {
  const items = api.Item.list().extra({ a: 'b' });
  axios.request.mockResolvedValue(Promise.resolve({ data: { data: [
    { type: 'items', id: '1' },
    { type: 'items', id: '2' },
  ] } }));
  await items.fetch();
  expectRequestMock('get', '/items', { params: { a: 'b' } });
  expect(items).toEqual({
    _API: api,
    _url: '/items',
    _params: { a: 'b' },
    data: [
      {
        id: '1',
        attributes: {},
        links: {},
        redirect: null,
        relationships: {},
        related: {},
      },
      {
        id: '2',
        attributes: {},
        links: {},
        redirect: null,
        relationships: {},
        related: {},
      },
    ],
    next: null,
    previous: null,
  });
});

test('filter', async () => {
  let items;
  async function testFilter() {
    axios.request.mockResolvedValue(Promise.resolve({ data: { data: [
      { type: 'items', id: '1' },
      { type: 'items', id: '2' },
    ] } }));
    await items.fetch();
    expectRequestMock(
      'get',
      '/items',
      { params: { 'filter[a]': 'b', 'filter[c][d]': 'e' } },
    );
    expect(items).toEqual({
      _API: api,
      _url: '/items',
      _params: { 'filter[a]': 'b', 'filter[c][d]': 'e' },
      data: [
        {
          id: '1',
          attributes: {},
          links: {},
          redirect: null,
          relationships: {},
          related: {},
        },
        {
          id: '2',
          attributes: {},
          links: {},
          redirect: null,
          relationships: {},
          related: {},
        },
      ],
      next: null,
      previous: null,
    });
  }

  items = api.Item.list().filter({ a: 'b', c__d: 'e' });
  await testFilter();

  items = api.Item.filter({ a: 'b', c__d: 'e' });
  await testFilter();
});
