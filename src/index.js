'use strict';
var path = require('path'),
    fs = require('fs'),
    async = require('async'),
    raml = require('raml-1-parser'),
    _ = require('lodash'),
    schemaMocker = require('./schema.js'),
    RequestMocker = require('./requestMocker.js');

function generate(options, callback) {
    var formats = {};
    if (options) {
        if (options.formats) {
            formats = options.formats;
        }
        if (!callback || !_.isFunction(callback)) {
            console.error('[RAML-MOCKER] You must define a callback function:\n');
            showUsage();
        }
        try {
            if (options.path) {
                generateFromPath(options.path, formats, callback);
            } else if (options.files && _.isArray(options.files)) {
                generateFromFiles(options.files, formats, callback);
            }
        } catch (exception) {
            console.error('[RAML-MOCKER] A runtime error has ocurred:\n');
            console.error(exception.stack);
            showUsage();
        }
    } else {
        console.error('[RAML-MOCKER] You must define a options object:\n');
        showUsage();
    }
}

function showUsage() {
    console.log('--------------------------------------------------------------------');
    console.log('---------------------- HOW TO USE RAML MOCKER ----------------------');
    console.log('--  var ramlMocker = require(\'raml-mocker\');                      --');
    console.log('--  var options = { path: \'test/raml\' };                          --');
    console.log('--  var callback = function (requests){ console.log(requests); }; --');
    console.log('--  ramlMocker.generate(options, callback);                       --');
    console.log('--------------------------------------------------------------------');
}

function generateFromPath(filesPath, formats, callback) {
    fs.readdir(filesPath, function (err, files) {
        if (err) {
            throw err;
        }
        var filesToGenerate = [];
        _.each(files, function (file) {
            if (file.substr(-5) === '.raml') {
                filesToGenerate.push(path.join(filesPath, file));
            }
        });
        generateFromFiles(filesToGenerate, formats, callback);
    });
}

function generateFromFiles(files, formats, callback) {
    var requestsToMock = [];
    async.each(files, function (file, cb) {
        raml.loadApi(file).then(function (data) {
            getRamlRequestsToMock(data, data, '/', formats, function (reqs) {
                requestsToMock = _.union(requestsToMock, reqs);
                cb();
            });
        }, function (error) {
            cb('Error parsing: ' + error);
        });
    }, function (err) {
        if (err) {
            console.log(err);
        } else {
            callback(requestsToMock);
        }
    });
}

function getRamlRequestsToMock(definition, api, uri, formats, callback) {
    var requestsToMock = [];

    if (definition.relativeUri) {
        var nodeURI = definition.relativeUri().value();
        if (definition.uriParameters()) {
            _.each(definition.uriParameters(), function (uriParam, name) {
                nodeURI = nodeURI.replace('{' + name + '}', ':' + name);
            });
        }
        uri = (uri + '/' + nodeURI).replace(/\/{2,}/g, '/');
    }
    var tasks = [];
    if (definition.methods) {
        tasks.push(function (cb) {
            getRamlRequestsToMockMethods(definition, api, uri, formats, function (reqs) {
                requestsToMock = _.union(requestsToMock, reqs);
                cb();
            });
        });
    }
    if (definition.resources) {
        tasks.push(function (cb) {
            getRamlRequestsToMockResources(definition, api, uri, formats, function (reqs) {
                requestsToMock = _.union(requestsToMock, reqs);
                cb();
            });
        });
    }
    async.parallel(tasks, function (err) {
        if (err) {
            console.log(err);
        }
        callback(requestsToMock);
    });
}

function getRamlRequestsToMockMethods(definition, api, uri, formats, callback) {
    var responsesByCode = [];
    async.each(definition.methods(), function (method) {
        if (method.method() && /get|post|put|delete/i.test(method.method()) && method.responses) {
            var responsesMethodByCode = getResponsesByCode(method.responses(), api);
            var methodMocker = new RequestMocker(uri, method.method());

            var currentMockDefaultCode = null;
            _.each(responsesMethodByCode, function (reqDefinition) {
                methodMocker.addResponse(reqDefinition.code, function () {
                    if (reqDefinition.schema || reqDefinition.body) {
                        return schemaMocker(reqDefinition, formats);
                    } else {
                        return null;
                    }
                }, function () {
                    return reqDefinition.example;
                });
                if ((!currentMockDefaultCode || currentMockDefaultCode > reqDefinition.code) && /^2\d\d$/.test(reqDefinition.code)) {
                    methodMocker.mock = methodMocker.getResponses()[reqDefinition.code];
                    methodMocker.example = methodMocker.getExamples()[reqDefinition.code];
                    currentMockDefaultCode = reqDefinition.code;
                }
            });
            if (currentMockDefaultCode) {
                methodMocker.defaultCode = currentMockDefaultCode;
            }
            responsesByCode.push(methodMocker);
        }
    });
    callback(responsesByCode);
}

function getResponsesByCode(responses, api) {
    var responsesByCode = [];

    var typeByName = _.zipObject(_.map(api.types(), function(item) {
       return item.name();
    }), api.types());

    var parseExample = function (body, code, example) {
        if (body.type()) {
            responsesByCode.push({
                code: code,
                body: body,
                types: typeByName,
                example: example
            });
        }
        else if (body.schema()) {
            var schema = null;
            try {
                schema = JSON.parse(body.schema());
            } catch (exception) {
                console.log(exception.stack);
            }
            responsesByCode.push({
                code: code,
                schema: schema,
                example: example
            });
        }
    };

    _.each(responses, function (response) {
        if (!response) return;
        var code = response.code() && response.code().value();
        _.each(response.body(), function (body) {
            if (!_.isNaN(Number(code)) && body) {
                code = Number(code);

                if (body.example()) {
                    parseExample(body, code, body.example());
                }
                else if (body.examples()) {
                    _.each(body.examples(), function (example) {
                        parseExample(body, code, example.content());
                    });
                }
            }
        });
    });
    return responsesByCode;
}

function getRamlRequestsToMockResources(definition, api, uri, formats, callback) {
    var requestsToMock = [];
    async.each(definition.resources(), function (def, cb) {
        getRamlRequestsToMock(def, api, uri, formats, function (reqs) {
            requestsToMock = _.union(requestsToMock, reqs);
            cb(null);
        });
    }, function (err) {
        if (err) {
            console.log(err);
        }
        callback(requestsToMock);
    });
}
module.exports = {
    generate: generate
};
