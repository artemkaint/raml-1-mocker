raml-1-mocker
===========

Node module to create mock API service based on RAML 1.0 definition.
Forked from https://github.com/repocho/raml-mocker and remaked.

Using RAML 1.0 mock-service
---
For single file ...
```javascript
var ramlMocker = require('raml-1-mocker');
var options = {
    path: 'test/raml'
};
var callback = function (requests){
    console.log(requests);
};
ramlMocker.generate(options, callback);
```

... or for collection of files
```javascript
var options = {
    files: ['definition1.raml', 'folder/definition2.raml']
};
```

The result of execution:
```javascript
[
    {
        /** URI of the request to mock */
        uri: '/test/:id/objectDef',
        /** Method of the request (get, post, ...) */
        method: 'get',
        /** Function by default to return the mock (codes 2XX defined in the RAML). */
        mock: [Function],
        /** If you don't define a 2XX code or want to use randomly other code responses. You can use this function
          * Just use instead of mock(); -> mockByCode(418);
          */
        mockByCode: [Function](code),
        /** Function by default to return the example (codes 2XX defined in the RAML). */
        example: [Function],
        /** The same as mockByCode but applied to examples */
        exampleByCode: [Function](code)
    }
]
```
Callback for [express] app
```javascript
var callback = function (requestsToMock){
    _.each(requestsToMock, function(reqToMock){
        app[reqToMock.method](reqToMock.uri, function(req,res){
            var code = 200;
            if (reqToMock.defaultCode) {
                code = reqToMock.defaultCode;
            }
            res.send(code ,reqToMock.mock());
        });
    });
};
```
#### Used

[definition.raml]: https://github.com/raml-org/raml-spec/blob/raml-10-rc2/versions/raml-10/raml-10.md
[lodash]:https://www.npmjs.org/package/lodash
[faker]:https://github.com/Marak/Faker.js
[raml-js-parser-2]:https://github.com/raml-org/raml-js-parser-2


#### History Log

##### 0.0.1
- Base project
