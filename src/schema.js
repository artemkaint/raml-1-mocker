'use strict';
var _ = require('lodash');
var fs = require('fs');
var faker = require('faker');
var FormatMocker = require('./format');

var DataMocker = function (definition, formats) {
    var formatMocker = new FormatMocker(formats);
    var mocker = new SchemaMocker();
    mocker.formatMocker = formatMocker;
    if (definition.schema) {
        return mocker._mocker(definition.schema, definition.schema);
    }
    else {
        return mocker._mockerType(definition.body, definition.types);
    }
};

var SchemaMocker = function () {
    return {
        /**
         * @param {TypeDeclarationImpl} property
         * @param {Boolean} floating
         * @returns {null}
         * @private
         *
         * @todo enum
         * @todo pattern
         */
        _numberMocker: function (property, floating) {
            var ret = null;
            if (property.multipleOf()) {
                var multipleMin = 1;
                var multipleMax = 5;

                if (property.maximum() !== undefined) {
                    if ((property.maximum() === property.multipleOf()) || (property.maximum() > property.multipleOf())) {
                        multipleMax = Math.floor(property.maximum() / property.multipleOf());
                    } else {
                        multipleMin = 0;
                        multipleMax = 0;
                    }
                }
                ret = property.multipleOf() * _.random(multipleMin, multipleMax, floating);
            } else {
                var minimum = _.isNumber(property.minimum()) ? property.minimum() : -99999999999;
                var maximum = _.isNumber(property.maximum()) ? property.maximum() : 99999999999;
                var gap = maximum - minimum;

                var minFloat = this._getMinFloat(minimum);
                if (minFloat < this._getMinFloat(maximum)) {
                    minFloat = this._getMinFloat(maximum);
                }
                var maxFloat = minFloat + _.random(0, 2);
                var littleGap = this._toFloat(_.random(0, gap, floating), _.random(minFloat, maxFloat)) / 10;
                ret = this._toFloat(_.random(minimum, maximum, floating), _.random(minFloat, maxFloat));
                if (ret === property.maximum()) {
                    ret -= littleGap;
                }
                if (ret === property.minimum()) {
                    ret += littleGap;
                }
            }
            return ret;
        },

        /**
         * @param {TypeDeclarationImpl} property
         * @returns {string}
         * @private
         *
         * @todo enum
         * @todo pattern
         */
        stringMocker: function (property) {
            var ret = null;
            var minLength = property.minLength() || 1;
            var maxLength = property.maxLength() || (minLength < 50 ? 50 : minLength);
            var strLen = _.random(minLength, maxLength);
            return faker.lorem.words(strLen).substring(0, strLen).trim();
        },

        _mockerType: function (definition, types) {
            var runtimeDefinition = definition.runtimeDefinition();
            var mocker = this;

            var parse = function (def) {
                var mocks = [];
                var pushMock = function (mock) {
                    if (mock) {
                        if (_.isArray(mock)) {
                            mocks = [].concat(mocks, mock);
                        }
                        else {
                            mocks.push(mock);
                        }
                    }
                };

                var runtimeParse = function (type, mock) {
                    mock || (mock = {});
                    var runtimeType = type.runtimeType();
                    if (runtimeType) {
                        _.each(runtimeType.superTypes(), function (superType) {
                            _.each(parse(superType), function (parentMock) {
                                mock = _.extend({}, mock, parentMock);
                            })
                        });
                    }
                    return mock;
                };

                var getCustomPropertyType = function (property, types) {
                    var customType = _.filter(_.map(property.type(), function (type) {
                        return types[type];
                    }), function (type) {
                        return !!type;
                    });
                    // TODO: there is only one type support today
                    return customType.length ? customType[0] : null;
                };

                switch (false) {
                    case !def.isUnion():
                        pushMock(parse(def.leftType()));
                        pushMock(parse(def.rightType()));
                        return _.sample(mocks);
                    case !def.hasStructure():
                        var type = types[def.typeId()];
                        if (type) {
                            var fillProperties = function (type) {
                                var obj = {};
                                _.each(type.properties(), function (property) {
                                    var getPropValue = function (property) {
                                        switch (false) {
                                            case !getCustomPropertyType(property, types):
                                                return getPropValue(getCustomPropertyType(property, types));
                                            case !(property.kind() == 'NumberTypeDeclaration'):                                                
                                                return mocker.numberMocker(property);
                                            case !(property.kind() == 'IntegerTypeDeclaration'):
                                                return mocker.integerMocker(property);
                                            case !(property.kind() == 'StringTypeDeclaration'):
                                                return mocker.stringMocker(property);
                                            case !(property.kind() == 'BooleanTypeDeclaration'):
                                                return mocker.booleanMocker(property);
                                            case !(property.kind() == 'ObjectTypeDeclaration'):
                                                var runtimeType = property.runtimeType();
                                                var mock = {};
                                                _.each(parse(runtimeType), function (currentMock) {
                                                    mock = _.extend({}, mock, currentMock);
                                                });
                                                return runtimeParse(property, mock);
                                            case !(property.examples() && property.examples().length):
                                                return _.sample(property.example());
                                            default:
                                                return property.example();
                                        }
                                    };
                                    var getPropName = function (property) {
                                        return property.name();
                                    };
                                    obj[getPropName(property)] = getPropValue(property);
                                });
                                return obj;
                            };
                            pushMock(runtimeParse(type, fillProperties(type)));
                        }
                        break;
                }
                return mocks;
            };
            return parse(runtimeDefinition);
        },

        _mocker: function (schema, wholeSchema) {
            if (schema.$ref) {
                var ref = schema.$ref;
                var newSchema;
                if (/^#\//i.test(ref)) {
                    var path = ref.replace(/^#\//i, '').split('/');
                    var refSchema = wholeSchema;
                    _.each(path, function (p) {
                        refSchema = refSchema[p];
                    });
                    newSchema = _.merge(_.clone(refSchema, true), _.omit(schema, '$ref'));
                    return this._mocker(newSchema, wholeSchema);
                } else { // if reference to json file in the node working directory folder
                    // relative path to json file
                    var relFilePath = ref.substring(0, ref.search('#'));
                    // absolute path to json file
                    var absFilePath = process.env.PWD + '/' + relFilePath;
                    // property path to follow
                    var propPath = ref.substr(ref.search('#'), ref.length).split('/');
                    propPath.shift();
                    try {
                        var data = fs.readFileSync(absFilePath, 'utf8');
                        var obj = JSON.parse(data);
                        var externalSchema = obj;
                        _.each(propPath, function (p) {
                            externalSchema = externalSchema[p];
                        });
                        newSchema = _.merge(_.clone(externalSchema, true), _.omit(schema, '$ref'));
                        return this._mocker(newSchema, wholeSchema);
                    } catch (err) {
                        console.error(err);
                    }
                }
            } else if (schema.enum && schema.enum.length > 0) {
                return schema.enum[_.random(0, schema.enum.length - 1)];
            } else if (schema.allOf || schema.anyOf || schema.oneOf || schema.not) {
                return this._mockSubSchema(schema, wholeSchema);
            } else if (schema.format) {
                var format = schema.format;
                var formatRet = this.formatMocker.format(format, schema);
                return formatRet;
            } else if (schema.type) {
                var type = schema.type;
                if (_.isArray(type)) {
                    type = type[0];
                }
                type = type.toLowerCase();
                if (typeof (this[type + 'Mocker']) !== 'undefined') {
                    var ret = this[type + 'Mocker'](schema, wholeSchema);
                    return ret;
                } else {
                    return undefined;
                }
            } else {
                return undefined;
            }
        },
        _mockSubSchema: function (schema, wholeSchema) {
            if (schema.allOf || schema.anyOf || schema.oneOf) {
                var newSchema = {};
                if (schema.allOf && _.isArray(schema.allOf)) {
                    _.each(schema.allOf, function (s) {
                        newSchema = _.merge(_.clone(newSchema, true), s);
                    });
                } else if (schema.anyOf && _.isArray(schema.anyOf)) {
                    _.each(schema.anyOf, function (s) {
                        if (_.random(0, 100) >= 50) {
                            newSchema = _.merge(_.clone(newSchema, true), s);
                        }
                    });
                } else if (schema.oneOf && _.isArray(schema.oneOf)) {
                    newSchema = schema.oneOf[_.random(0, schema.oneOf.length - 1)];
                }
                if (!_.isEmpty(newSchema)) {
                    newSchema = _.merge(_.clone(newSchema, true), _.omit(schema, ['allOf', 'anyOf', 'oneOf', 'not']));
                    return this._mocker(newSchema, wholeSchema);
                } else {
                    return undefined;
                }
            } else {
                //And schema.not
                return undefined;
            }
        },
        objectMocker: function (schema, wholeSchema) {
            var ret = {};
            var _self = this;
            /**
             * TODO:
             * maxProperties
             * minProperties
             * required
             * additionalProperties, properties and patternProperties
             * dependences
             */
            if (schema.properties) {
                _.each(schema.properties, function (value, key) {
                    ret[key] = _self._mocker(value, wholeSchema);
                });
            }
            return ret;
        },

        arrayMocker: function (schema, wholeSchema) {
            var ret = [];
            var _self = this;
            /**
             * TODO:
             * additionalItems and items
             * maxItems
             * minItems
             */
            if (_.isArray(schema.items)) {
                _.each(schema.items, function (item) {
                    ret.push(_self._mocker(item, wholeSchema));
                });
            } else if (_.isObject(schema.items)) {
                var size = _.random(schema.minItems || 1, schema.maxItems || 5);
                _.times(size, function () {
                    ret.push(_self._mocker(schema.items, wholeSchema));
                });
            }

            // handle "uniqueItems"
            if (_.has(schema, 'uniqueItems') && schema.uniqueItems) {
                ret = _.uniq(ret);
            }

            return ret;
        },

        stringMockerOld: function (schema) {
            /**
             * TODO:
             * maxLength
             * minLength
             * enum
             * pattern
             * @type {string}
             */
            var ret = null;
            var minLength = schema.minLength || 1;
            var maxLength = schema.maxLength || (minLength < 50 ? 50 : schema.minLength);
            var strLen = _.random(minLength, maxLength);
            ret = faker.lorem.words(strLen).substring(0, strLen).trim();
            return ret;
        },

        /**
         * @param number
         * @param len
         * @private
         */
        _toFloat: function (number, len) {
            var num = '' + number;
            var dotIndex = num.indexOf('.');
            if (dotIndex > 0) {
                num = num.substring(0, dotIndex + len + 1);
            }
            return parseFloat(num);
        },

        /**
         * @param num
         * @returns {number}
         * @private
         */
        _getMinFloat: function (num) {
            var ret = /\.(0*)\d*$/.exec(num);
            return ret ? ret[1].length + 1 : 1;
        },

        /**
         * @param schema
         * @param {Boolean} floating
         * @returns {null}
         * @private
         */
        _numberMockerOld: function (schema, floating) {
            var ret = null;
            /**
             * TODO:
             * minimum and exclusiveMinimum
             */
            if (schema.multipleOf) {
                var multipleMin = 1;
                var multipleMax = 5;

                if (schema.maximum !== undefined) {
                    if ((schema.maximum === schema.multipleOf && !schema.exclusiveMaximum) || (schema.maximum > schema.multipleOf)) {
                        multipleMax = Math.floor(schema.maximum / schema.multipleOf);
                    } else {
                        multipleMin = 0;
                        multipleMax = 0;
                    }
                }
                ret = schema.multipleOf * _.random(multipleMin, multipleMax, floating);
            } else {
                var minimum = _.isNumber(schema.minimum) ? schema.minimum : -99999999999;
                var maximum = _.isNumber(schema.maximum) ? schema.maximum : 99999999999;
                var gap = maximum - minimum;
                /**
                 *  - min: 0.000006
                 *  - max: 0.000009
                 */
                var minFloat = this._getMinFloat(minimum);
                if (minFloat < this._getMinFloat(maximum)) {
                    minFloat = this._getMinFloat(maximum);
                }
                var maxFloat = minFloat + _.random(0, 2);
                var littleGap = this._toFloat(_.random(0, gap, floating), _.random(minFloat, maxFloat)) / 10;
                ret = this._toFloat(_.random(minimum, maximum, floating), _.random(minFloat, maxFloat));
                if (ret === schema.maximum && schema.exclusiveMaximum) {
                    ret -= littleGap;
                }
                if (ret === schema.minimum && schema.exclusiveMinimum) {
                    ret += littleGap;
                }
            }
            return ret;
        },

        numberMocker: function (property) {
            return this._numberMocker(property, true);
        },

        integerMocker: function (property) {
            return this._numberMocker(property, false);
        },

        booleanMocker: function (schema) {
            return faker.random.number(100000) < 50000;
        },

        nullMocker: function (schema) {
            return null;
        }
    };
};

module.exports = DataMocker;
