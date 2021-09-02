# {json:api} SDK library for Javascript

## Setting up

```sh
npm install --save javascript-jsonapi-sdk-library
```

Using  this library means creating your own API SDK for a remote service. In
order to do that, you need to first define an *API connection type*. This is
done by subclassing `JsonApi`:

```javascript
import { JsonApi } from 'javascript-jsonapi-sdk-library';

class FamilyApi extends JsonApi {
    static HOST = 'https://api.families.com';
}
```

Next, you have to define some *API resource types* and register them to the
*API connection type*. This is done by subclassing `Resource` and decorating it
with the connection type's `register` method:

```javascript
import { Resource } from 'javascript-jsonapi-sdk-library';

class Parent extends Resource {
    static name = 'Parent';
    static TYPE = 'parents';
}
FamilyApi.register(Parent);

class Child extends Resource {
    static name = 'Child';
    static TYPE = 'children';
}
FamilyApi.register(Child);
```

Users of your SDK can then instantiate your *API connection type*, providing
authentication credentials and/or overriding the host, in case you want to test
against a sandbox API server and not the production one:

```javascript
const familyApi = new FamilyApi({
    host: 'https://sandbox.api.families.com',
    auth: 'MYTOKEN',
});
```

Finally the API resource types you have registered can be accessed as
attributes on this _API connection instance_. You can either use the class's
name or the API resource's type:

```javascript
const child = await familyApi.Child.get('1')
const child = await familyApi.children.get('1')
```

This is enough to get you started since the library will be able to provide you
with a lot of functionality based on the structure of the responses you get
from the server. Make sure you define and register Resource subclasses for
every type you intend to encounter, because the library will use the API
instance's registry to resolve the appropriate subclass for the items included
in the API's responses.

### Global _API connection instances_

You can configure an already created _API connection instance_ by calling the
`setup` method, which accepts the same properties as the constructor. In
fact, `JsonApi`'s `constructor` and `setup` methods have been written in such a
way that the following two snippets should produce an identical outcome:

```javascript
const props = ...;
const familyApi = new FamilyApi(props);
```

```javascript
const props = ...;
const familyApi = new FamilyApi();
familyApi.setup(props);
```

This way, you can implement your SDK in a way that offers the option to users
to either use a _global API connection instance_ or multiple instances. In
fact, this is exactly how `@transifex/api` has been set up:

```javascript
// transifexApi/src/index.js

import { JsonApi, Resource } from 'javascript-jsonapi-sdk-library';

export class TransifexApi extends JsonApi {
    static HOST = 'https://rest.api.transifex.com';
}

class Organization extends Resource {
    static name = "Organization";
    static TYPE = "organizations";
}
TransifexApi.register(Organization);

export const transifexApi = TransifexApi();
```

```javascript
// app.js (uses the global API connection instance)

import { transifexApi } from './transifexApi';

transifexApi.setup({ auth: 'MYTOKEN' });
const organization = await transifexApi.Organization.get("1");
```

```javascript
// app.js (uses multiple custom API connection instances)

import { TransifexApi } from './transifexApi';

const api1 = new TransifexApi({ auth: 'APITOKEN1' });
const api2 = new TransifexApi({ auth: 'APITOKEN2' });

const organization1 = await api1.Organization.get('1');
const organization2 = await api2.Organization.get('2');
```

_(The whole logic behind this initialization process is further explained
[here](https://www.kbairak.net/programming/python/2020/09/16/global-singleton-vs-instance-for-libraries.html))_

### Authentication

The `auth` property to `JsonApi` or `setup` can either be:

1. A string, in which case all requests to the API server will include the
   `Authorization: Bearer <API_TOKEN>` header
2. A callable, in which case the return value is expected to be a dictionary
   which will be merged with the headers of all requests to the API server

   ```javascript
   import { FamilyApi } from './families';
   import { encrypt } from './crypto';

   function myAuth() {
       return { 'x-signature': encrypt(Date()) };
   }

   const familyApi = new FamilyApi({ auth: myAuth });
   ```

## Retrieval

### URLs

By default, collection URLs have the form `/<type>` (eg `/children`) and item
URLs have the form `/<type>/<id>` (eg `/children/1`). This is also part of
{json:api}'s recommendations. If you want to customize them, you need to
override the `getCollectionUrl` static method and the `getItemUrl()` method
of the resource's subclass:

```javascript
class Child extends Resource {
    static name = 'Child';
    static TYPE = 'children';

    static getCollectionUrl() {
        return '/children_collection';
    }

    getItemUrl() {
        return `/child_item/${this.id}`;
    }
}
FamilyApi.register(Child);
```

### Getting a single resource object from the API

If you know the ID of the resource object, you can fetch its {json:api}
representation with:

```javascript
const child = await familyApi.Child.get('1');
```

The attributes of a resource object are `id`, `attributes`, `relationships`,
`links` and `related`. `id`, `attributes`, `relationships` and `links` have
exactly the same value as in the API response.

```javascript
const parent = await familyApi.Parent.get('1');
console.log(parent.id);
// <<< '1'
console.log(parent.attributes);
// <<<  { name: 'Zeus' }
console.log(parent.relationships);
// <<< { children: { links: { self: '/parent/1/relationships/children',
// ...                        related: '/children?filter[parent]=1' } } }

const child = await familyApi.Child.get('1');
console.log(child.id);
// <<< '1'
console.log(child.attributes);
// <<<  { name: 'Hercules' }
console.log(child.relationships);
// <<< { parent: { data: { type: 'parents', id: '1' },
// ...             links: { self: '/children/1/relationships/parent',
// ...                      related: '/parents/1' } } }
```

You can reload an object from the server by calling `.reload()`:

```javascript
await child.reload();
// equivalent to
child = await familyApi.Child.get(child.id);
```

### Relationships

#### Intro

We need to talk a bit about how {json:api} represents relationships and how the
`transifex.api.jsonapi` library interprets them. Depending on the value of a
field of `relationships`, we consider the following possibilities. A
relationship can either be:

1. A **null** relationship which will be represented by a null value:

   ```javascript
   { type: 'children',
     id: '...',
     attributes: { ... },
     relationships: {
         parent: null,  # <---
         ...,
     },
     links: { ... } }
   ```

2. A **singular** relationship which will be represented by an object with both
   `data` and `links` fields, with the `data` field being a dictionary:

   ```javascript
   { type: 'children',
     id: '...',
     attributes: { ... },
     relationships: {
         parent: { data: { type: 'parents', id: '...' },      // <---
                   links: { self: '...', related: '...' } },  // <---
         ... ,
     },
     links: { ... } }
   ```

3. A **plural** relationship which will be represented by an object with a
   `links` field and either a missing `data` field or a `data` field which is a
   list:

   ```javascript
   { type: 'parents',
     id: '...',
     attributes: { ... },
     relationships: {
         children: { links: { self: '...', related: '...' } },  // <---
         ...,
     },
     links: { ... } }
   ```

   or

   ```javascript
   { type: 'parents',
     id: '...',
     attributes: { ... },
     relationships: {
         children: { links: { self: '...', related: '...' },    // <---
                     data: [{ type: 'children', id: '...' },    // <---
                            { type: 'children', id: '...' },    // <---
                            ... ] },                            // <---
         ... ,
     },
     links: { ... } }
   ```

This is important because the library will make assumptions about the nature of
relationships based on the existence of these fields.

#### Fetching relationships

The `related` field is meant to host the data of the relationships, **after**
these have been fetched from the API. Lets revisit the last example and inspect
the `relationships` and `related` fields:

```javascript
const parent = await familyApi.Parent.get('1');
console.log(parent.relationships);
// <<< { children: { links: { self: '/parent/1/relationships/children',
// ...                        related: '/children?filter[parent]=1' } } }
console.log(parent.related);
// <<< {}

const child = await familyApi.Child.get('1');
console.log(child.relationships);
// <<< { parent: { data: { type: 'parents', id: '1' },
// ...             links: { self: '/children/1/relationships/parent',
// ...                      related: '/parents/1' } } }
console.log(child.related.id);
// <<< '1'
console.log(child.related.attributes);
// <<< {}
console.log(child.related.relationships);
// <<< {}
```

As you can see, the _parent→children_ `related` field is empty while the
_child→parent_ `related` field is prefilled with an "unfetched" Parent
instance. This happens because the first one is a _plural_ relationship while
the second is a _singular_ relationship. Unfetched means that we only know its
`id` so far. In both cases, we don't know any meaningful data about the
relationships yet.

In order to fetch the related data, you need to call `.fetch()` with the names
of the relationship you want to fetch:

```javascript
await child.fetch('parent');  // Now `related.parent` has all the information
console.log(child.related.parent.id);
// <<< '1'
console.log(child.related.parent.attributes);
// <<< { name: 'Zeus' }
console.log(child.related.parent.relationships);
// <<< { children: { links: { self: '/parent/1/relationships/children',
// ...                        related: '/children?filter[parent]=1' } } })

await parent.fetch('children');
await parent.related.children.fetch();
console.log(parent.related.children.data[0].id);
// <<< '1'
console.log(parent.related.children.data[0].attributes);
// <<< { name: 'Hercules' }
console.log(parent.related.children.data[0].relationships);
// <<< { parent: { data: { type: 'parents', id: '1' },
// ...             links: { self: '/children/1/relationships/parent',
// ...                      related: '/parents/1' } } }
```

Trying to fetch an already-fetched relationship will not actually trigger
another request, unless you pass `{ force: true }` to `.fetch()`.

`.fetch()` will return the relation:

```javascript
const children = await parent.fetch('children');
// is equivalent to
await parent.fetch('children');
const children = parent.related.children;

await children.fetch();
console.log(children.data[0].attributes.name);
// <<< 'Hercules'
```
