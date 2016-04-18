'use strict';
var _ = require('lodash');
var faker = require('faker');
var FormatMocker = require('./format');
var randexp = require('randexp').randexp;

var DataMocker = function (definition, formats) {
    var formatMocker = new FormatMocker(formats);
    var mocker = new SchemaMocker();
    mocker.formatMocker = formatMocker;
    mocker.types = definition.types;
    return mocker.mock(definition.body);
};

var SchemaMocker = function () {
    return {
        parse: function (def) {
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
            switch (false) {
                case !def.isUnion():
                    pushMock(this.parse(def.leftType()));
                    pushMock(this.parse(def.rightType()));
                    return _.sample(mocks);
                case !def.isArray():
                    var superTypes = def.superTypes();
                    if (superTypes) {
                        pushMock(this.array(superTypes[0]));
                    }
                    break;
                case !def.hasStructure():
                    pushMock(this.object(def));
                    break;
            }
            return mocks;
        },

        mock: function (definition) {
            var runtimeDefinition = definition.runtimeDefinition();
            return this.parse(runtimeDefinition);
        },

        /**
         * Function for generate object mock value
         *
         * @param {TypeDeclarationImpl} property
         * @returns {null}
         *
         * TODO:
         * maxProperties
         * minProperties
         * required
         * properties
         * patternProperties
         */
        object: function (property) {
            var type = this.types[property.typeId()];
            var mocker = this;
            var mocks = [];
            if (type) {
                var getCustomPropertyType = function (property) {
                    var customType = _.filter(_.map(property.type(), function (type) {
                        return mocker.types[type];
                    }), function (type) {
                        return !!type;
                    });
                    // TODO: there is only one type support today
                    return customType.length ? customType[0] : null;
                };

                var runtimeParse = function (type, mock) {
                    mock || (mock = {});
                    var runtimeType = type.runtimeType();
                    if (runtimeType) {
                        _.each(runtimeType.superTypes(), function (superType) {
                            _.each(mocker.parse(superType), function (parentMock) {
                                mock = _.extend({}, mock, parentMock);
                            })
                        });
                    }
                    return mock;
                };

                var fillProperties = function (type) {
                    var obj = {};
                    _.each(type.properties(), function (property) {
                        var getPropValue = function (property) {
                            switch (false) {
                                case !getCustomPropertyType(property):
                                    return getPropValue(getCustomPropertyType(property));
                                case !(property.kind() == 'NumberTypeDeclaration'):
                                    return mocker.number(property);
                                case !(property.kind() == 'IntegerTypeDeclaration'):
                                    return mocker.integer(property);
                                case !(property.kind() == 'StringTypeDeclaration'):
                                    return mocker.string(property);
                                case !(property.kind() == 'BooleanTypeDeclaration'):
                                    return mocker.boolean(property);
                                case !(property.kind() == 'ObjectTypeDeclaration'):
                                    var runtimeType = property.runtimeType();
                                    var mock = {};
                                    _.each(mocker.parse(runtimeType), function (currentMock) {
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
                return runtimeParse(type, fillProperties(type));
            }
            return mocks;
        },

        /**
         * Function for generate array mock value
         *
         * @param {TypeDeclarationImpl} property
         * @returns {null}
         *
         * TODO:
         * items
         */
        array: function (property) {
            var mocks = [];
            var mocker = this;
            var type = this.types[property.typeId()];
            if (!type) {
                return mocks;
            }

            var maxItems = type.maxItems() || 10;
            var minItems = type.minItems() || 0;
            var unique = type.uniqueItems() || false;

            this.parse(property.componentType());

            _.times(_.random(minItems, maxItems), function () {
                mocks.push(mocker.parse(property.componentType()));
            });

            if (unique) {
                return _.uniq(mocks);
            }
            return mocks;
        },

        /**
         * Function for generate string mock value
         *
         * @param {TypeDeclarationImpl} property
         * @returns {string}
         * @private
         *
         * @todo enum
         */
        string: function (property) {
            if (property.pattern()) {
                return randexp(property.pattern());
            }
            else {
                var minLength = property.minLength() || 1;
                var maxLength = property.maxLength() || (minLength < 50 ? 50 : minLength);
                var strLen = _.random(minLength, maxLength);
                return faker.lorem.words(strLen).substring(0, strLen).trim();
            }
        },

        /**
         * Function for generate float mock value
         *
         * @param {TypeDeclarationImpl} property
         * @returns {null}
         *
         * @todo enum
         */
        number: function (property) {
            return this.numberBase(property, true);
        },

        /**
         * Function for generate integer mock value
         *
         * @param {TypeDeclarationImpl} property
         * @returns {null}
         *
         * @todo enum
         */
        integer: function (property) {
            return this.numberBase(property, false);
        },

        /**
         * Function for generate float or integer mock value
         *
         * @param {TypeDeclarationImpl} property
         * @param {Boolean} floating
         * @returns {null}
         * @private
         *
         * @todo enum
         * @todo format
         */
        numberBase: function (property, floating) {
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

        boolean: function (property) {
            return faker.random.number(100000) < 50000;
        },

        null: function (property) {
            return null;
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
        }
    };
};

module.exports = DataMocker;
