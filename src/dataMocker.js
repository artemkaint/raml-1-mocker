'use strict';
var _ = require('lodash');
var faker = require('faker');
var randexp = require('randexp').randexp;

module.exports = function (definition) {
    var mocker = new SchemaMocker();
    mocker.types = definition.types;
    return mocker.mock(definition.body);
};

var SchemaMocker = function () {

    return {
        parse: function (def, discriminatorValue) {
            var mocks = [];
            switch (false) {
                case !def.isUnion():
                    mocks = this._magicPush(this.parse(def.leftType(), discriminatorValue), mocks);
                    mocks = this._magicPush(this.parse(def.rightType(), discriminatorValue), mocks);
                    return _.sample(mocks);
                case !def.isArray():
                    var superTypes = def.superTypes();
                    if (superTypes) {
                        mocks = this._magicPush(this.array(superTypes[0], discriminatorValue), mocks);
                    }
                    break;
                case !def.hasStructure():
                    mocks = this._magicPush(this.object(def, discriminatorValue), mocks);
                    return _.sample(mocks);
            }
            return mocks;
        },

        mock: function (definition) {
            return this.parse(definition.runtimeDefinition());
        },

        /**
         * Function for generate object mock value
         *
         * @param {TypeDeclarationImpl} property
         * @returns {object}
         *
         * @todo maxProperties
         * @todo minProperties
         * @todo required
         * @todo properties
         * @todo patternProperties
         */
        object: function (definition, discriminatorValue) {
            var mocker = this;

            var getMockForType = function(property) {
                var type = mocker.types[property.typeId()];
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

                    var runtimeParse = function (type, mock, discriminatorValue) {
                        // if value of discriminator is not defined we get it from current type
                        if (!discriminatorValue) {
                            discriminatorValue = type.discriminatorValue();
                        }
                        var retMock = mock ? mock : {};
                        var runtimeType = type.runtimeType();
                        if (runtimeType) {
                            _.each(runtimeType.superTypes(), function (superType) {
                                var stMock = mocker.parse(superType, discriminatorValue);
                                _.each(_.isArray(stMock) ? stMock : [stMock], function (parentMock) {
                                    retMock = _.extend({}, retMock, parentMock);
                                })
                            });
                        }
                        return retMock;
                    };

                    var fillProperties = function (type) {
                        var obj = {};
                        _.each(type.properties(), function (property) {
                            var getPropValue = function (prop) {
                                switch (false) {
                                    case !(prop.name() == type.discriminator()):
                                        return discriminatorValue;
                                    case !getCustomPropertyType(prop):
                                        return getPropValue(getCustomPropertyType(prop));
                                    case !(prop.kind() == 'NumberTypeDeclaration'):
                                        return mocker.number(prop);
                                    case !(prop.kind() == 'IntegerTypeDeclaration'):
                                        return mocker.integer(prop);
                                    case !(prop.kind() == 'StringTypeDeclaration'):
                                        return mocker.string(prop);
                                    case !(prop.kind() == 'BooleanTypeDeclaration'):
                                        return mocker.boolean(prop);
                                    case !(prop.kind() == 'ObjectTypeDeclaration'):
                                        var runtimeType = prop.runtimeType();
                                        var mockObj = {};
                                        var stMock = mocker.parse(runtimeType);
                                        _.each(_.isArray(stMock) ? stMock : [stMock], function (currentMock) {
                                            mockObj = _.extend({}, mockObj, currentMock);
                                        });
                                        return runtimeParse(prop, mockObj);
                                    case !(prop.examples() && prop.examples().length):
                                        return _.sample(prop.example());
                                    default:
                                        return prop.example();
                                }
                            };
                            var getPropName = function (prop) {
                                return prop.name();
                            };
                            obj[getPropName(property)] = getPropValue(property);
                        });
                        return obj;
                    };
                    return runtimeParse(type, fillProperties(type, discriminatorValue), discriminatorValue);
                }
                return {};
            }

            var mock = {};
            if (definition.superTypes) {
                _.each(definition.superTypes(), function(superType) {
                    mock = _.extend({}, mock, getMockForType(superType));
                });
            }
            return _.extend({}, mock, getMockForType(definition));
        },

        /**
         * Function for generate array mock value
         *
         * @param {TypeDeclarationImpl} property
         * @returns {null}
         *
         * @todo items
         */
        array: function (property, discriminatorValue) {
            var mocks = [];
            var mocker = this;
            var type = this.types[property.typeId()];
            if (!type) {
                return mocks;
            }

            var maxItems = type.maxItems() === null || _.isNaN(parseInt(type.maxItems(), 10)) ? 10 : type.maxItems();
            var minItems = type.minItems() || 0;
            var unique = type.uniqueItems() || false;

            _.times(_.random(minItems, maxItems), function () {
                mocks = mocker._magicPush(mocker.parse(property.componentType()), mocks);
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
         */
        string: function (property) {
            switch (false) {
                case !(property.pattern()):
                    return randexp(property.pattern().substr(1, property.pattern().toString().length - 2));
                case !(property.enum().length):
                    return _.sample(property.enum());
                default:
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
         * @todo format
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
         * @todo format
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
         * @todo format
         */
        numberBase: function (property, floating) {
            var ret = null;
            switch (false) {
                case !(property.enum().length):
                    return _.sample(property.enum());
                case !(property.multipleOf()):
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
                    return property.multipleOf() * _.random(multipleMin, multipleMax, floating);
                default:
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
                    return ret;
            }
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
        },

        /**
         * Magic push to array or merge arrays
         * @param el {*[]|*}
         * @param arr {*[]}
         */
        _magicPush: function (el, arr) {
            if (el) {
                if (_.isArray(el)) {
                    arr = [].concat(arr, el);
                }
                else {
                    arr.push(el);
                }
            }
            return arr
        }
    };
};
