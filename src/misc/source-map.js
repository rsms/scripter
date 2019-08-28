export const {SourceMapConsumer, BasicSourceMapConsumer, IndexedSourceMapConsumer, SourceMapGenerator, SourceNode} = function(module, exports) {
    var root, factory;
    return root = "undefined" != typeof self ? self : this, factory = function(__WEBPACK_EXTERNAL_MODULE_10__, __WEBPACK_EXTERNAL_MODULE_11__) {
        return function(modules) {
            var installedModules = {};
            function __webpack_require__(moduleId) {
                if (installedModules[moduleId]) return installedModules[moduleId].exports;
                var module = installedModules[moduleId] = {
                    i: moduleId,
                    l: !1,
                    exports: {}
                };
                return modules[moduleId].call(module.exports, module, module.exports, __webpack_require__), 
                module.l = !0, module.exports;
            }
            return __webpack_require__.m = modules, __webpack_require__.c = installedModules, 
            __webpack_require__.d = function(exports, name, getter) {
                __webpack_require__.o(exports, name) || Object.defineProperty(exports, name, {
                    configurable: !1,
                    enumerable: !0,
                    get: getter
                });
            }, __webpack_require__.n = function(module) {
                var getter = module && module.__esModule ? function() {
                    return module.default;
                } : function() {
                    return module;
                };
                return __webpack_require__.d(getter, "a", getter), getter;
            }, __webpack_require__.o = function(object, property) {
                return Object.prototype.hasOwnProperty.call(object, property);
            }, __webpack_require__.p = "", __webpack_require__(__webpack_require__.s = 5);
        }([ function(module, exports) {
            exports.getArg = function(aArgs, aName, aDefaultValue) {
                if (aName in aArgs) return aArgs[aName];
                if (3 === arguments.length) return aDefaultValue;
                throw new Error('"' + aName + '" is a required argument.');
            };
            const urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.-]*)(?::(\d+))?(.*)$/, dataUrlRegexp = /^data:.+\,.+$/;
            function urlParse(aUrl) {
                const match = aUrl.match(urlRegexp);
                return match ? {
                    scheme: match[1],
                    auth: match[2],
                    host: match[3],
                    port: match[4],
                    path: match[5]
                } : null;
            }
            function urlGenerate(aParsedUrl) {
                let url = "";
                return aParsedUrl.scheme && (url += aParsedUrl.scheme + ":"), url += "//", aParsedUrl.auth && (url += aParsedUrl.auth + "@"), 
                aParsedUrl.host && (url += aParsedUrl.host), aParsedUrl.port && (url += ":" + aParsedUrl.port), 
                aParsedUrl.path && (url += aParsedUrl.path), url;
            }
            exports.urlParse = urlParse, exports.urlGenerate = urlGenerate;
            const MAX_CACHED_INPUTS = 32;
            const normalize = function(f) {
                const cache = [];
                return function(input) {
                    for (let i = 0; i < cache.length; i++) if (cache[i].input === input) {
                        const temp = cache[0];
                        return cache[0] = cache[i], cache[i] = temp, cache[0].result;
                    }
                    const result = f(input);
                    return cache.unshift({
                        input,
                        result
                    }), cache.length > MAX_CACHED_INPUTS && cache.pop(), result;
                };
            }(function(aPath) {
                let path = aPath;
                const url = urlParse(aPath);
                if (url) {
                    if (!url.path) return aPath;
                    path = url.path;
                }
                const isAbsolute = exports.isAbsolute(path), parts = [];
                let start = 0, i = 0;
                for (;;) {
                    if (start = i, -1 === (i = path.indexOf("/", start))) {
                        parts.push(path.slice(start));
                        break;
                    }
                    for (parts.push(path.slice(start, i)); i < path.length && "/" === path[i]; ) i++;
                }
                let up = 0;
                for (i = parts.length - 1; i >= 0; i--) {
                    const part = parts[i];
                    "." === part ? parts.splice(i, 1) : ".." === part ? up++ : up > 0 && ("" === part ? (parts.splice(i + 1, up), 
                    up = 0) : (parts.splice(i, 2), up--));
                }
                return "" === (path = parts.join("/")) && (path = isAbsolute ? "/" : "."), url ? (url.path = path, 
                urlGenerate(url)) : path;
            });
            function join(aRoot, aPath) {
                "" === aRoot && (aRoot = "."), "" === aPath && (aPath = ".");
                const aPathUrl = urlParse(aPath), aRootUrl = urlParse(aRoot);
                if (aRootUrl && (aRoot = aRootUrl.path || "/"), aPathUrl && !aPathUrl.scheme) return aRootUrl && (aPathUrl.scheme = aRootUrl.scheme), 
                urlGenerate(aPathUrl);
                if (aPathUrl || aPath.match(dataUrlRegexp)) return aPath;
                if (aRootUrl && !aRootUrl.host && !aRootUrl.path) return aRootUrl.host = aPath, 
                urlGenerate(aRootUrl);
                const joined = "/" === aPath.charAt(0) ? aPath : normalize(aRoot.replace(/\/+$/, "") + "/" + aPath);
                return aRootUrl ? (aRootUrl.path = joined, urlGenerate(aRootUrl)) : joined;
            }
            exports.normalize = normalize, exports.join = join, exports.isAbsolute = function(aPath) {
                return "/" === aPath.charAt(0) || urlRegexp.test(aPath);
            }, exports.relative = function(aRoot, aPath) {
                "" === aRoot && (aRoot = "."), aRoot = aRoot.replace(/\/$/, "");
                let level = 0;
                for (;0 !== aPath.indexOf(aRoot + "/"); ) {
                    const index = aRoot.lastIndexOf("/");
                    if (index < 0) return aPath;
                    if ((aRoot = aRoot.slice(0, index)).match(/^([^\/]+:\/)?\/*$/)) return aPath;
                    ++level;
                }
                return Array(level + 1).join("../") + aPath.substr(aRoot.length + 1);
            };
            const supportsNullProto = !("__proto__" in Object.create(null));
            function identity(s) {
                return s;
            }
            function isProtoString(s) {
                if (!s) return !1;
                const length = s.length;
                if (length < 9) return !1;
                if (95 !== s.charCodeAt(length - 1) || 95 !== s.charCodeAt(length - 2) || 111 !== s.charCodeAt(length - 3) || 116 !== s.charCodeAt(length - 4) || 111 !== s.charCodeAt(length - 5) || 114 !== s.charCodeAt(length - 6) || 112 !== s.charCodeAt(length - 7) || 95 !== s.charCodeAt(length - 8) || 95 !== s.charCodeAt(length - 9)) return !1;
                for (let i = length - 10; i >= 0; i--) if (36 !== s.charCodeAt(i)) return !1;
                return !0;
            }
            function strcmp(aStr1, aStr2) {
                return aStr1 === aStr2 ? 0 : null === aStr1 ? 1 : null === aStr2 ? -1 : aStr1 > aStr2 ? 1 : -1;
            }
            exports.toSetString = supportsNullProto ? identity : function(aStr) {
                return isProtoString(aStr) ? "$" + aStr : aStr;
            }, exports.fromSetString = supportsNullProto ? identity : function(aStr) {
                return isProtoString(aStr) ? aStr.slice(1) : aStr;
            }, exports.compareByOriginalPositions = function(mappingA, mappingB, onlyCompareOriginal) {
                let cmp = strcmp(mappingA.source, mappingB.source);
                return 0 !== cmp ? cmp : 0 != (cmp = mappingA.originalLine - mappingB.originalLine) ? cmp : 0 != (cmp = mappingA.originalColumn - mappingB.originalColumn) || onlyCompareOriginal ? cmp : 0 != (cmp = mappingA.generatedColumn - mappingB.generatedColumn) ? cmp : 0 != (cmp = mappingA.generatedLine - mappingB.generatedLine) ? cmp : strcmp(mappingA.name, mappingB.name);
            }, exports.compareByGeneratedPositionsDeflated = function(mappingA, mappingB, onlyCompareGenerated) {
                let cmp = mappingA.generatedLine - mappingB.generatedLine;
                return 0 !== cmp ? cmp : 0 != (cmp = mappingA.generatedColumn - mappingB.generatedColumn) || onlyCompareGenerated ? cmp : 0 !== (cmp = strcmp(mappingA.source, mappingB.source)) ? cmp : 0 != (cmp = mappingA.originalLine - mappingB.originalLine) ? cmp : 0 != (cmp = mappingA.originalColumn - mappingB.originalColumn) ? cmp : strcmp(mappingA.name, mappingB.name);
            }, exports.compareByGeneratedPositionsInflated = function(mappingA, mappingB) {
                let cmp = mappingA.generatedLine - mappingB.generatedLine;
                return 0 !== cmp ? cmp : 0 != (cmp = mappingA.generatedColumn - mappingB.generatedColumn) ? cmp : 0 !== (cmp = strcmp(mappingA.source, mappingB.source)) ? cmp : 0 != (cmp = mappingA.originalLine - mappingB.originalLine) ? cmp : 0 != (cmp = mappingA.originalColumn - mappingB.originalColumn) ? cmp : strcmp(mappingA.name, mappingB.name);
            }, exports.parseSourceMapInput = function(str) {
                return JSON.parse(str.replace(/^\)]}'[^\n]*\n/, ""));
            }, exports.computeSourceURL = function(sourceRoot, sourceURL, sourceMapURL) {
                if (sourceURL = sourceURL || "", sourceRoot && ("/" !== sourceRoot[sourceRoot.length - 1] && "/" !== sourceURL[0] && (sourceRoot += "/"), 
                sourceURL = sourceRoot + sourceURL), sourceMapURL) {
                    const parsed = urlParse(sourceMapURL);
                    if (!parsed) throw new Error("sourceMapURL could not be parsed");
                    if (parsed.path) {
                        const index = parsed.path.lastIndexOf("/");
                        index >= 0 && (parsed.path = parsed.path.substring(0, index + 1));
                    }
                    sourceURL = join(urlGenerate(parsed), sourceURL);
                }
                return normalize(sourceURL);
            };
        }, function(module, exports, __webpack_require__) {
            const base64VLQ = __webpack_require__(2), util = __webpack_require__(0), ArraySet = __webpack_require__(3).ArraySet, MappingList = __webpack_require__(7).MappingList;
            class SourceMapGenerator {
                constructor(aArgs) {
                    aArgs || (aArgs = {}), this._file = util.getArg(aArgs, "file", null), this._sourceRoot = util.getArg(aArgs, "sourceRoot", null), 
                    this._skipValidation = util.getArg(aArgs, "skipValidation", !1), this._sources = new ArraySet(), 
                    this._names = new ArraySet(), this._mappings = new MappingList(), this._sourcesContents = null;
                }
                static fromSourceMap(aSourceMapConsumer) {
                    const sourceRoot = aSourceMapConsumer.sourceRoot, generator = new SourceMapGenerator({
                        file: aSourceMapConsumer.file,
                        sourceRoot
                    });
                    return aSourceMapConsumer.eachMapping(function(mapping) {
                        const newMapping = {
                            generated: {
                                line: mapping.generatedLine,
                                column: mapping.generatedColumn
                            }
                        };
                        null != mapping.source && (newMapping.source = mapping.source, null != sourceRoot && (newMapping.source = util.relative(sourceRoot, newMapping.source)), 
                        newMapping.original = {
                            line: mapping.originalLine,
                            column: mapping.originalColumn
                        }, null != mapping.name && (newMapping.name = mapping.name)), generator.addMapping(newMapping);
                    }), aSourceMapConsumer.sources.forEach(function(sourceFile) {
                        let sourceRelative = sourceFile;
                        null !== sourceRoot && (sourceRelative = util.relative(sourceRoot, sourceFile)), 
                        generator._sources.has(sourceRelative) || generator._sources.add(sourceRelative);
                        const content = aSourceMapConsumer.sourceContentFor(sourceFile);
                        null != content && generator.setSourceContent(sourceFile, content);
                    }), generator;
                }
                addMapping(aArgs) {
                    const generated = util.getArg(aArgs, "generated"), original = util.getArg(aArgs, "original", null);
                    let source = util.getArg(aArgs, "source", null), name = util.getArg(aArgs, "name", null);
                    this._skipValidation || this._validateMapping(generated, original, source, name), 
                    null != source && (source = String(source), this._sources.has(source) || this._sources.add(source)), 
                    null != name && (name = String(name), this._names.has(name) || this._names.add(name)), 
                    this._mappings.add({
                        generatedLine: generated.line,
                        generatedColumn: generated.column,
                        originalLine: null != original && original.line,
                        originalColumn: null != original && original.column,
                        source,
                        name
                    });
                }
                setSourceContent(aSourceFile, aSourceContent) {
                    let source = aSourceFile;
                    null != this._sourceRoot && (source = util.relative(this._sourceRoot, source)), 
                    null != aSourceContent ? (this._sourcesContents || (this._sourcesContents = Object.create(null)), 
                    this._sourcesContents[util.toSetString(source)] = aSourceContent) : this._sourcesContents && (delete this._sourcesContents[util.toSetString(source)], 
                    0 === Object.keys(this._sourcesContents).length && (this._sourcesContents = null));
                }
                applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
                    let sourceFile = aSourceFile;
                    if (null == aSourceFile) {
                        if (null == aSourceMapConsumer.file) throw new Error('SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, or the source map\'s "file" property. Both were omitted.');
                        sourceFile = aSourceMapConsumer.file;
                    }
                    const sourceRoot = this._sourceRoot;
                    null != sourceRoot && (sourceFile = util.relative(sourceRoot, sourceFile));
                    const newSources = this._mappings.toArray().length > 0 ? new ArraySet() : this._sources, newNames = new ArraySet();
                    this._mappings.unsortedForEach(function(mapping) {
                        if (mapping.source === sourceFile && null != mapping.originalLine) {
                            const original = aSourceMapConsumer.originalPositionFor({
                                line: mapping.originalLine,
                                column: mapping.originalColumn
                            });
                            null != original.source && (mapping.source = original.source, null != aSourceMapPath && (mapping.source = util.join(aSourceMapPath, mapping.source)), 
                            null != sourceRoot && (mapping.source = util.relative(sourceRoot, mapping.source)), 
                            mapping.originalLine = original.line, mapping.originalColumn = original.column, 
                            null != original.name && (mapping.name = original.name));
                        }
                        const source = mapping.source;
                        null == source || newSources.has(source) || newSources.add(source);
                        const name = mapping.name;
                        null == name || newNames.has(name) || newNames.add(name);
                    }, this), this._sources = newSources, this._names = newNames, aSourceMapConsumer.sources.forEach(function(srcFile) {
                        const content = aSourceMapConsumer.sourceContentFor(srcFile);
                        null != content && (null != aSourceMapPath && (srcFile = util.join(aSourceMapPath, srcFile)), 
                        null != sourceRoot && (srcFile = util.relative(sourceRoot, srcFile)), this.setSourceContent(srcFile, content));
                    }, this);
                }
                _validateMapping(aGenerated, aOriginal, aSource, aName) {
                    if (aOriginal && "number" != typeof aOriginal.line && "number" != typeof aOriginal.column) throw new Error("original.line and original.column are not numbers -- you probably meant to omit the original mapping entirely and only map the generated position. If so, pass null for the original mapping instead of an object with empty or null values.");
                    if (aGenerated && "line" in aGenerated && "column" in aGenerated && aGenerated.line > 0 && aGenerated.column >= 0 && !aOriginal && !aSource && !aName) ; else if (!(aGenerated && "line" in aGenerated && "column" in aGenerated && aOriginal && "line" in aOriginal && "column" in aOriginal && aGenerated.line > 0 && aGenerated.column >= 0 && aOriginal.line > 0 && aOriginal.column >= 0 && aSource)) throw new Error("Invalid mapping: " + JSON.stringify({
                        generated: aGenerated,
                        source: aSource,
                        original: aOriginal,
                        name: aName
                    }));
                }
                _serializeMappings() {
                    let next, mapping, nameIdx, sourceIdx, previousGeneratedColumn = 0, previousGeneratedLine = 1, previousOriginalColumn = 0, previousOriginalLine = 0, previousName = 0, previousSource = 0, result = "";
                    const mappings = this._mappings.toArray();
                    for (let i = 0, len = mappings.length; i < len; i++) {
                        if (next = "", (mapping = mappings[i]).generatedLine !== previousGeneratedLine) for (previousGeneratedColumn = 0; mapping.generatedLine !== previousGeneratedLine; ) next += ";", 
                        previousGeneratedLine++; else if (i > 0) {
                            if (!util.compareByGeneratedPositionsInflated(mapping, mappings[i - 1])) continue;
                            next += ",";
                        }
                        next += base64VLQ.encode(mapping.generatedColumn - previousGeneratedColumn), previousGeneratedColumn = mapping.generatedColumn, 
                        null != mapping.source && (sourceIdx = this._sources.indexOf(mapping.source), next += base64VLQ.encode(sourceIdx - previousSource), 
                        previousSource = sourceIdx, next += base64VLQ.encode(mapping.originalLine - 1 - previousOriginalLine), 
                        previousOriginalLine = mapping.originalLine - 1, next += base64VLQ.encode(mapping.originalColumn - previousOriginalColumn), 
                        previousOriginalColumn = mapping.originalColumn, null != mapping.name && (nameIdx = this._names.indexOf(mapping.name), 
                        next += base64VLQ.encode(nameIdx - previousName), previousName = nameIdx)), result += next;
                    }
                    return result;
                }
                _generateSourcesContent(aSources, aSourceRoot) {
                    return aSources.map(function(source) {
                        if (!this._sourcesContents) return null;
                        null != aSourceRoot && (source = util.relative(aSourceRoot, source));
                        const key = util.toSetString(source);
                        return Object.prototype.hasOwnProperty.call(this._sourcesContents, key) ? this._sourcesContents[key] : null;
                    }, this);
                }
                toJSON() {
                    const map = {
                        version: this._version,
                        sources: this._sources.toArray(),
                        names: this._names.toArray(),
                        mappings: this._serializeMappings()
                    };
                    return null != this._file && (map.file = this._file), null != this._sourceRoot && (map.sourceRoot = this._sourceRoot), 
                    this._sourcesContents && (map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot)), 
                    map;
                }
                toString() {
                    return JSON.stringify(this.toJSON());
                }
            }
            SourceMapGenerator.prototype._version = 3, exports.SourceMapGenerator = SourceMapGenerator;
        }, function(module, exports, __webpack_require__) {
            const base64 = __webpack_require__(6);
            exports.encode = function(aValue) {
                let digit, encoded = "", vlq = function(aValue) {
                    return aValue < 0 ? 1 + (-aValue << 1) : 0 + (aValue << 1);
                }(aValue);
                do {
                    digit = 31 & vlq, (vlq >>>= 5) > 0 && (digit |= 32), encoded += base64.encode(digit);
                } while (vlq > 0);
                return encoded;
            };
        }, function(module, exports) {
            class ArraySet {
                constructor() {
                    this._array = [], this._set = new Map();
                }
                static fromArray(aArray, aAllowDuplicates) {
                    const set = new ArraySet();
                    for (let i = 0, len = aArray.length; i < len; i++) set.add(aArray[i], aAllowDuplicates);
                    return set;
                }
                size() {
                    return this._set.size;
                }
                add(aStr, aAllowDuplicates) {
                    const isDuplicate = this.has(aStr), idx = this._array.length;
                    isDuplicate && !aAllowDuplicates || this._array.push(aStr), isDuplicate || this._set.set(aStr, idx);
                }
                has(aStr) {
                    return this._set.has(aStr);
                }
                indexOf(aStr) {
                    const idx = this._set.get(aStr);
                    if (idx >= 0) return idx;
                    throw new Error('"' + aStr + '" is not in the set.');
                }
                at(aIdx) {
                    if (aIdx >= 0 && aIdx < this._array.length) return this._array[aIdx];
                    throw new Error("No element indexed by " + aIdx);
                }
                toArray() {
                    return this._array.slice();
                }
            }
            exports.ArraySet = ArraySet;
        }, function(module, exports, __webpack_require__) {
            (function(__dirname) {
                if ("function" == typeof fetch) {
                    let mappingsWasmUrl = null;
                    module.exports = function() {
                        if ("string" != typeof mappingsWasmUrl) throw new Error("You must provide the URL of lib/mappings.wasm by calling SourceMapConsumer.initialize({ 'lib/mappings.wasm': ... }) before using SourceMapConsumer");
                        return fetch(mappingsWasmUrl).then(response => response.arrayBuffer());
                    }, module.exports.initialize = (url => mappingsWasmUrl = url);
                } else {
                    const fs = __webpack_require__(10), path = __webpack_require__(11);
                    module.exports = function() {
                        return new Promise((resolve, reject) => {
                            const wasmPath = path.join(__dirname, "mappings.wasm");
                            fs.readFile(wasmPath, null, (error, data) => {
                                error ? reject(error) : resolve(data.buffer);
                            });
                        });
                    }, module.exports.initialize = (_ => {
                        console.debug("SourceMapConsumer.initialize is a no-op when running in node.js");
                    });
                }
            }).call(exports, "/");
        }, function(module, exports, __webpack_require__) {
            exports.SourceMapGenerator = __webpack_require__(1).SourceMapGenerator, exports.SourceMapConsumer = __webpack_require__(8).SourceMapConsumer, 
            exports.SourceNode = __webpack_require__(13).SourceNode;
        }, function(module, exports) {
            const intToCharMap = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
            exports.encode = function(number) {
                if (0 <= number && number < intToCharMap.length) return intToCharMap[number];
                throw new TypeError("Must be between 0 and 63: " + number);
            };
        }, function(module, exports, __webpack_require__) {
            const util = __webpack_require__(0);
            exports.MappingList = class {
                constructor() {
                    this._array = [], this._sorted = !0, this._last = {
                        generatedLine: -1,
                        generatedColumn: 0
                    };
                }
                unsortedForEach(aCallback, aThisArg) {
                    this._array.forEach(aCallback, aThisArg);
                }
                add(aMapping) {
                    !function(mappingA, mappingB) {
                        const lineA = mappingA.generatedLine, lineB = mappingB.generatedLine, columnA = mappingA.generatedColumn, columnB = mappingB.generatedColumn;
                        return lineB > lineA || lineB == lineA && columnB >= columnA || util.compareByGeneratedPositionsInflated(mappingA, mappingB) <= 0;
                    }(this._last, aMapping) ? (this._sorted = !1, this._array.push(aMapping)) : (this._last = aMapping, 
                    this._array.push(aMapping));
                }
                toArray() {
                    return this._sorted || (this._array.sort(util.compareByGeneratedPositionsInflated), 
                    this._sorted = !0), this._array;
                }
            };
        }, function(module, exports, __webpack_require__) {
            const util = __webpack_require__(0), binarySearch = __webpack_require__(9), ArraySet = __webpack_require__(3).ArraySet, readWasm = (__webpack_require__(2), 
            __webpack_require__(4)), wasm = __webpack_require__(12), INTERNAL = Symbol("smcInternal");
            class SourceMapConsumer {
                constructor(aSourceMap, aSourceMapURL) {
                    return aSourceMap == INTERNAL ? Promise.resolve(this) : function(aSourceMap, aSourceMapURL) {
                        let sourceMap = aSourceMap;
                        "string" == typeof aSourceMap && (sourceMap = util.parseSourceMapInput(aSourceMap));
                        const consumer = null != sourceMap.sections ? new IndexedSourceMapConsumer(sourceMap, aSourceMapURL) : new BasicSourceMapConsumer(sourceMap, aSourceMapURL);
                        return Promise.resolve(consumer);
                    }(aSourceMap, aSourceMapURL);
                }
                static initialize(opts) {
                    readWasm.initialize(opts["lib/mappings.wasm"]);
                }
                static fromSourceMap(aSourceMap, aSourceMapURL) {
                    return function(aSourceMap, aSourceMapURL) {
                        return BasicSourceMapConsumer.fromSourceMap(aSourceMap, aSourceMapURL);
                    }(aSourceMap, aSourceMapURL);
                }
                static with(rawSourceMap, sourceMapUrl, f) {
                    let consumer = null;
                    return new SourceMapConsumer(rawSourceMap, sourceMapUrl).then(c => (consumer = c, 
                    f(c))).then(x => (consumer && consumer.destroy(), x), e => {
                        throw consumer && consumer.destroy(), e;
                    });
                }
                _parseMappings(aStr, aSourceRoot) {
                    throw new Error("Subclasses must implement _parseMappings");
                }
                eachMapping(aCallback, aContext, aOrder) {
                    throw new Error("Subclasses must implement eachMapping");
                }
                allGeneratedPositionsFor(aArgs) {
                    throw new Error("Subclasses must implement allGeneratedPositionsFor");
                }
                destroy() {
                    throw new Error("Subclasses must implement destroy");
                }
            }
            SourceMapConsumer.prototype._version = 3, SourceMapConsumer.GENERATED_ORDER = 1, 
            SourceMapConsumer.ORIGINAL_ORDER = 2, SourceMapConsumer.GREATEST_LOWER_BOUND = 1, 
            SourceMapConsumer.LEAST_UPPER_BOUND = 2, exports.SourceMapConsumer = SourceMapConsumer;
            class BasicSourceMapConsumer extends SourceMapConsumer {
                constructor(aSourceMap, aSourceMapURL) {
                    return super(INTERNAL).then(that => {
                        let sourceMap = aSourceMap;
                        "string" == typeof aSourceMap && (sourceMap = util.parseSourceMapInput(aSourceMap));
                        const version = util.getArg(sourceMap, "version");
                        let sources = util.getArg(sourceMap, "sources");
                        const names = util.getArg(sourceMap, "names", []);
                        let sourceRoot = util.getArg(sourceMap, "sourceRoot", null);
                        const sourcesContent = util.getArg(sourceMap, "sourcesContent", null), mappings = util.getArg(sourceMap, "mappings"), file = util.getArg(sourceMap, "file", null);
                        if (version != that._version) throw new Error("Unsupported version: " + version);
                        return sourceRoot && (sourceRoot = util.normalize(sourceRoot)), sources = sources.map(String).map(util.normalize).map(function(source) {
                            return sourceRoot && util.isAbsolute(sourceRoot) && util.isAbsolute(source) ? util.relative(sourceRoot, source) : source;
                        }), that._names = ArraySet.fromArray(names.map(String), !0), that._sources = ArraySet.fromArray(sources, !0), 
                        that._absoluteSources = that._sources.toArray().map(function(s) {
                            return util.computeSourceURL(sourceRoot, s, aSourceMapURL);
                        }), that.sourceRoot = sourceRoot, that.sourcesContent = sourcesContent, that._mappings = mappings, 
                        that._sourceMapURL = aSourceMapURL, that.file = file, that._computedColumnSpans = !1, 
                        that._mappingsPtr = 0, that._wasm = null, wasm().then(w => (that._wasm = w, that));
                    });
                }
                _findSourceIndex(aSource) {
                    let relativeSource = aSource;
                    if (null != this.sourceRoot && (relativeSource = util.relative(this.sourceRoot, relativeSource)), 
                    this._sources.has(relativeSource)) return this._sources.indexOf(relativeSource);
                    for (let i = 0; i < this._absoluteSources.length; ++i) if (this._absoluteSources[i] == aSource) return i;
                    return -1;
                }
                static fromSourceMap(aSourceMap, aSourceMapURL) {
                    return new BasicSourceMapConsumer(aSourceMap.toString());
                }
                get sources() {
                    return this._absoluteSources.slice();
                }
                _getMappingsPtr() {
                    return 0 === this._mappingsPtr && this._parseMappings(this._mappings, this.sourceRoot), 
                    this._mappingsPtr;
                }
                _parseMappings(aStr, aSourceRoot) {
                    const size = aStr.length, mappingsBufPtr = this._wasm.exports.allocate_mappings(size), mappingsBuf = new Uint8Array(this._wasm.exports.memory.buffer, mappingsBufPtr, size);
                    for (let i = 0; i < size; i++) mappingsBuf[i] = aStr.charCodeAt(i);
                    const mappingsPtr = this._wasm.exports.parse_mappings(mappingsBufPtr);
                    if (!mappingsPtr) {
                        const error = this._wasm.exports.get_last_error();
                        let msg = `Error parsing mappings (code ${error}): `;
                        switch (error) {
                          case 1:
                            msg += "the mappings contained a negative line, column, source index, or name index";
                            break;

                          case 2:
                            msg += "the mappings contained a number larger than 2**32";
                            break;

                          case 3:
                            msg += "reached EOF while in the middle of parsing a VLQ";
                            break;

                          case 4:
                            msg += "invalid base 64 character while parsing a VLQ";
                            break;

                          default:
                            msg += "unknown error code";
                        }
                        throw new Error(msg);
                    }
                    this._mappingsPtr = mappingsPtr;
                }
                eachMapping(aCallback, aContext, aOrder) {
                    const context = aContext || null, order = aOrder || SourceMapConsumer.GENERATED_ORDER, sourceRoot = this.sourceRoot;
                    this._wasm.withMappingCallback(mapping => {
                        null !== mapping.source && (mapping.source = this._sources.at(mapping.source), mapping.source = util.computeSourceURL(sourceRoot, mapping.source, this._sourceMapURL), 
                        null !== mapping.name && (mapping.name = this._names.at(mapping.name))), aCallback.call(context, mapping);
                    }, () => {
                        switch (order) {
                          case SourceMapConsumer.GENERATED_ORDER:
                            this._wasm.exports.by_generated_location(this._getMappingsPtr());
                            break;

                          case SourceMapConsumer.ORIGINAL_ORDER:
                            this._wasm.exports.by_original_location(this._getMappingsPtr());
                            break;

                          default:
                            throw new Error("Unknown order of iteration.");
                        }
                    });
                }
                allGeneratedPositionsFor(aArgs) {
                    let source = util.getArg(aArgs, "source");
                    const originalLine = util.getArg(aArgs, "line"), originalColumn = aArgs.column || 0;
                    if ((source = this._findSourceIndex(source)) < 0) return [];
                    if (originalLine < 1) throw new Error("Line numbers must be >= 1");
                    if (originalColumn < 0) throw new Error("Column numbers must be >= 0");
                    const mappings = [];
                    return this._wasm.withMappingCallback(m => {
                        let lastColumn = m.lastGeneratedColumn;
                        this._computedColumnSpans && null === lastColumn && (lastColumn = 1 / 0), mappings.push({
                            line: m.generatedLine,
                            column: m.generatedColumn,
                            lastColumn
                        });
                    }, () => {
                        this._wasm.exports.all_generated_locations_for(this._getMappingsPtr(), source, originalLine - 1, "column" in aArgs, originalColumn);
                    }), mappings;
                }
                destroy() {
                    0 !== this._mappingsPtr && (this._wasm.exports.free_mappings(this._mappingsPtr), 
                    this._mappingsPtr = 0);
                }
                computeColumnSpans() {
                    this._computedColumnSpans || (this._wasm.exports.compute_column_spans(this._getMappingsPtr()), 
                    this._computedColumnSpans = !0);
                }
                originalPositionFor(aArgs) {
                    const needle = {
                        generatedLine: util.getArg(aArgs, "line"),
                        generatedColumn: util.getArg(aArgs, "column")
                    };
                    if (needle.generatedLine < 1) throw new Error("Line numbers must be >= 1");
                    if (needle.generatedColumn < 0) throw new Error("Column numbers must be >= 0");
                    let mapping, bias = util.getArg(aArgs, "bias", SourceMapConsumer.GREATEST_LOWER_BOUND);
                    if (null == bias && (bias = SourceMapConsumer.GREATEST_LOWER_BOUND), this._wasm.withMappingCallback(m => mapping = m, () => {
                        this._wasm.exports.original_location_for(this._getMappingsPtr(), needle.generatedLine - 1, needle.generatedColumn, bias);
                    }), mapping && mapping.generatedLine === needle.generatedLine) {
                        let source = util.getArg(mapping, "source", null);
                        null !== source && (source = this._sources.at(source), source = util.computeSourceURL(this.sourceRoot, source, this._sourceMapURL));
                        let name = util.getArg(mapping, "name", null);
                        return null !== name && (name = this._names.at(name)), {
                            source,
                            line: util.getArg(mapping, "originalLine", null),
                            column: util.getArg(mapping, "originalColumn", null),
                            name
                        };
                    }
                    return {
                        source: null,
                        line: null,
                        column: null,
                        name: null
                    };
                }
                hasContentsOfAllSources() {
                    return !!this.sourcesContent && (this.sourcesContent.length >= this._sources.size() && !this.sourcesContent.some(function(sc) {
                        return null == sc;
                    }));
                }
                sourceContentFor(aSource, nullOnMissing) {
                    if (!this.sourcesContent) return null;
                    const index = this._findSourceIndex(aSource);
                    if (index >= 0) return this.sourcesContent[index];
                    let url, relativeSource = aSource;
                    if (null != this.sourceRoot && (relativeSource = util.relative(this.sourceRoot, relativeSource)), 
                    null != this.sourceRoot && (url = util.urlParse(this.sourceRoot))) {
                        const fileUriAbsPath = relativeSource.replace(/^file:\/\//, "");
                        if ("file" == url.scheme && this._sources.has(fileUriAbsPath)) return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)];
                        if ((!url.path || "/" == url.path) && this._sources.has("/" + relativeSource)) return this.sourcesContent[this._sources.indexOf("/" + relativeSource)];
                    }
                    if (nullOnMissing) return null;
                    throw new Error('"' + relativeSource + '" is not in the SourceMap.');
                }
                generatedPositionFor(aArgs) {
                    let source = util.getArg(aArgs, "source");
                    if ((source = this._findSourceIndex(source)) < 0) return {
                        line: null,
                        column: null,
                        lastColumn: null
                    };
                    const needle = {
                        source,
                        originalLine: util.getArg(aArgs, "line"),
                        originalColumn: util.getArg(aArgs, "column")
                    };
                    if (needle.originalLine < 1) throw new Error("Line numbers must be >= 1");
                    if (needle.originalColumn < 0) throw new Error("Column numbers must be >= 0");
                    let mapping, bias = util.getArg(aArgs, "bias", SourceMapConsumer.GREATEST_LOWER_BOUND);
                    if (null == bias && (bias = SourceMapConsumer.GREATEST_LOWER_BOUND), this._wasm.withMappingCallback(m => mapping = m, () => {
                        this._wasm.exports.generated_location_for(this._getMappingsPtr(), needle.source, needle.originalLine - 1, needle.originalColumn, bias);
                    }), mapping && mapping.source === needle.source) {
                        let lastColumn = mapping.lastGeneratedColumn;
                        return this._computedColumnSpans && null === lastColumn && (lastColumn = 1 / 0), 
                        {
                            line: util.getArg(mapping, "generatedLine", null),
                            column: util.getArg(mapping, "generatedColumn", null),
                            lastColumn
                        };
                    }
                    return {
                        line: null,
                        column: null,
                        lastColumn: null
                    };
                }
            }
            BasicSourceMapConsumer.prototype.consumer = SourceMapConsumer, exports.BasicSourceMapConsumer = BasicSourceMapConsumer;
            class IndexedSourceMapConsumer extends SourceMapConsumer {
                constructor(aSourceMap, aSourceMapURL) {
                    return super(INTERNAL).then(that => {
                        let sourceMap = aSourceMap;
                        "string" == typeof aSourceMap && (sourceMap = util.parseSourceMapInput(aSourceMap));
                        const version = util.getArg(sourceMap, "version"), sections = util.getArg(sourceMap, "sections");
                        if (version != that._version) throw new Error("Unsupported version: " + version);
                        that._sources = new ArraySet(), that._names = new ArraySet(), that.__generatedMappings = null, 
                        that.__originalMappings = null, that.__generatedMappingsUnsorted = null, that.__originalMappingsUnsorted = null;
                        let lastOffset = {
                            line: -1,
                            column: 0
                        };
                        return Promise.all(sections.map(s => {
                            if (s.url) throw new Error("Support for url field in sections not implemented.");
                            const offset = util.getArg(s, "offset"), offsetLine = util.getArg(offset, "line"), offsetColumn = util.getArg(offset, "column");
                            if (offsetLine < lastOffset.line || offsetLine === lastOffset.line && offsetColumn < lastOffset.column) throw new Error("Section offsets must be ordered and non-overlapping.");
                            return lastOffset = offset, new SourceMapConsumer(util.getArg(s, "map"), aSourceMapURL).then(consumer => ({
                                generatedOffset: {
                                    generatedLine: offsetLine + 1,
                                    generatedColumn: offsetColumn + 1
                                },
                                consumer
                            }));
                        })).then(s => (that._sections = s, that));
                    });
                }
                get _generatedMappings() {
                    return this.__generatedMappings || this._sortGeneratedMappings(), this.__generatedMappings;
                }
                get _originalMappings() {
                    return this.__originalMappings || this._sortOriginalMappings(), this.__originalMappings;
                }
                get _generatedMappingsUnsorted() {
                    return this.__generatedMappingsUnsorted || this._parseMappings(this._mappings, this.sourceRoot), 
                    this.__generatedMappingsUnsorted;
                }
                get _originalMappingsUnsorted() {
                    return this.__originalMappingsUnsorted || this._parseMappings(this._mappings, this.sourceRoot), 
                    this.__originalMappingsUnsorted;
                }
                _sortGeneratedMappings() {
                    const mappings = this._generatedMappingsUnsorted;
                    mappings.sort(util.compareByGeneratedPositionsDeflated), this.__generatedMappings = mappings;
                }
                _sortOriginalMappings() {
                    const mappings = this._originalMappingsUnsorted;
                    mappings.sort(util.compareByOriginalPositions), this.__originalMappings = mappings;
                }
                get sources() {
                    const sources = [];
                    for (let i = 0; i < this._sections.length; i++) for (let j = 0; j < this._sections[i].consumer.sources.length; j++) sources.push(this._sections[i].consumer.sources[j]);
                    return sources;
                }
                originalPositionFor(aArgs) {
                    const needle = {
                        generatedLine: util.getArg(aArgs, "line"),
                        generatedColumn: util.getArg(aArgs, "column")
                    }, sectionIndex = binarySearch.search(needle, this._sections, function(aNeedle, section) {
                        const cmp = aNeedle.generatedLine - section.generatedOffset.generatedLine;
                        return cmp || aNeedle.generatedColumn - section.generatedOffset.generatedColumn;
                    }), section = this._sections[sectionIndex];
                    return section ? section.consumer.originalPositionFor({
                        line: needle.generatedLine - (section.generatedOffset.generatedLine - 1),
                        column: needle.generatedColumn - (section.generatedOffset.generatedLine === needle.generatedLine ? section.generatedOffset.generatedColumn - 1 : 0),
                        bias: aArgs.bias
                    }) : {
                        source: null,
                        line: null,
                        column: null,
                        name: null
                    };
                }
                hasContentsOfAllSources() {
                    return this._sections.every(function(s) {
                        return s.consumer.hasContentsOfAllSources();
                    });
                }
                sourceContentFor(aSource, nullOnMissing) {
                    for (let i = 0; i < this._sections.length; i++) {
                        const content = this._sections[i].consumer.sourceContentFor(aSource, !0);
                        if (content) return content;
                    }
                    if (nullOnMissing) return null;
                    throw new Error('"' + aSource + '" is not in the SourceMap.');
                }
                generatedPositionFor(aArgs) {
                    for (let i = 0; i < this._sections.length; i++) {
                        const section = this._sections[i];
                        if (-1 === section.consumer._findSourceIndex(util.getArg(aArgs, "source"))) continue;
                        const generatedPosition = section.consumer.generatedPositionFor(aArgs);
                        if (generatedPosition) {
                            return {
                                line: generatedPosition.line + (section.generatedOffset.generatedLine - 1),
                                column: generatedPosition.column + (section.generatedOffset.generatedLine === generatedPosition.line ? section.generatedOffset.generatedColumn - 1 : 0)
                            };
                        }
                    }
                    return {
                        line: null,
                        column: null
                    };
                }
                _parseMappings(aStr, aSourceRoot) {
                    const generatedMappings = this.__generatedMappingsUnsorted = [], originalMappings = this.__originalMappingsUnsorted = [];
                    for (let i = 0; i < this._sections.length; i++) {
                        const section = this._sections[i], sectionMappings = [];
                        section.consumer.eachMapping(m => sectionMappings.push(m));
                        for (let j = 0; j < sectionMappings.length; j++) {
                            const mapping = sectionMappings[j];
                            let source = util.computeSourceURL(section.consumer.sourceRoot, null, this._sourceMapURL);
                            this._sources.add(source), source = this._sources.indexOf(source);
                            let name = null;
                            mapping.name && (this._names.add(mapping.name), name = this._names.indexOf(mapping.name));
                            const adjustedMapping = {
                                source,
                                generatedLine: mapping.generatedLine + (section.generatedOffset.generatedLine - 1),
                                generatedColumn: mapping.generatedColumn + (section.generatedOffset.generatedLine === mapping.generatedLine ? section.generatedOffset.generatedColumn - 1 : 0),
                                originalLine: mapping.originalLine,
                                originalColumn: mapping.originalColumn,
                                name
                            };
                            generatedMappings.push(adjustedMapping), "number" == typeof adjustedMapping.originalLine && originalMappings.push(adjustedMapping);
                        }
                    }
                }
                eachMapping(aCallback, aContext, aOrder) {
                    const context = aContext || null;
                    let mappings;
                    switch (aOrder || SourceMapConsumer.GENERATED_ORDER) {
                      case SourceMapConsumer.GENERATED_ORDER:
                        mappings = this._generatedMappings;
                        break;

                      case SourceMapConsumer.ORIGINAL_ORDER:
                        mappings = this._originalMappings;
                        break;

                      default:
                        throw new Error("Unknown order of iteration.");
                    }
                    const sourceRoot = this.sourceRoot;
                    mappings.map(function(mapping) {
                        let source = null;
                        return null !== mapping.source && (source = this._sources.at(mapping.source), source = util.computeSourceURL(sourceRoot, source, this._sourceMapURL)), 
                        {
                            source,
                            generatedLine: mapping.generatedLine,
                            generatedColumn: mapping.generatedColumn,
                            originalLine: mapping.originalLine,
                            originalColumn: mapping.originalColumn,
                            name: null === mapping.name ? null : this._names.at(mapping.name)
                        };
                    }, this).forEach(aCallback, context);
                }
                _findMapping(aNeedle, aMappings, aLineName, aColumnName, aComparator, aBias) {
                    if (aNeedle[aLineName] <= 0) throw new TypeError("Line must be greater than or equal to 1, got " + aNeedle[aLineName]);
                    if (aNeedle[aColumnName] < 0) throw new TypeError("Column must be greater than or equal to 0, got " + aNeedle[aColumnName]);
                    return binarySearch.search(aNeedle, aMappings, aComparator, aBias);
                }
                allGeneratedPositionsFor(aArgs) {
                    const line = util.getArg(aArgs, "line"), needle = {
                        source: util.getArg(aArgs, "source"),
                        originalLine: line,
                        originalColumn: util.getArg(aArgs, "column", 0)
                    };
                    if (needle.source = this._findSourceIndex(needle.source), needle.source < 0) return [];
                    if (needle.originalLine < 1) throw new Error("Line numbers must be >= 1");
                    if (needle.originalColumn < 0) throw new Error("Column numbers must be >= 0");
                    const mappings = [];
                    let index = this._findMapping(needle, this._originalMappings, "originalLine", "originalColumn", util.compareByOriginalPositions, binarySearch.LEAST_UPPER_BOUND);
                    if (index >= 0) {
                        let mapping = this._originalMappings[index];
                        if (void 0 === aArgs.column) {
                            const originalLine = mapping.originalLine;
                            for (;mapping && mapping.originalLine === originalLine; ) {
                                let lastColumn = mapping.lastGeneratedColumn;
                                this._computedColumnSpans && null === lastColumn && (lastColumn = 1 / 0), mappings.push({
                                    line: util.getArg(mapping, "generatedLine", null),
                                    column: util.getArg(mapping, "generatedColumn", null),
                                    lastColumn
                                }), mapping = this._originalMappings[++index];
                            }
                        } else {
                            const originalColumn = mapping.originalColumn;
                            for (;mapping && mapping.originalLine === line && mapping.originalColumn == originalColumn; ) {
                                let lastColumn = mapping.lastGeneratedColumn;
                                this._computedColumnSpans && null === lastColumn && (lastColumn = 1 / 0), mappings.push({
                                    line: util.getArg(mapping, "generatedLine", null),
                                    column: util.getArg(mapping, "generatedColumn", null),
                                    lastColumn
                                }), mapping = this._originalMappings[++index];
                            }
                        }
                    }
                    return mappings;
                }
                destroy() {
                    for (let i = 0; i < this._sections.length; i++) this._sections[i].consumer.destroy();
                }
            }
            exports.IndexedSourceMapConsumer = IndexedSourceMapConsumer;
        }, function(module, exports) {
            exports.GREATEST_LOWER_BOUND = 1, exports.LEAST_UPPER_BOUND = 2, exports.search = function(aNeedle, aHaystack, aCompare, aBias) {
                if (0 === aHaystack.length) return -1;
                let index = function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare, aBias) {
                    const mid = Math.floor((aHigh - aLow) / 2) + aLow, cmp = aCompare(aNeedle, aHaystack[mid], !0);
                    return 0 === cmp ? mid : cmp > 0 ? aHigh - mid > 1 ? recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare, aBias) : aBias == exports.LEAST_UPPER_BOUND ? aHigh < aHaystack.length ? aHigh : -1 : mid : mid - aLow > 1 ? recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare, aBias) : aBias == exports.LEAST_UPPER_BOUND ? mid : aLow < 0 ? -1 : aLow;
                }(-1, aHaystack.length, aNeedle, aHaystack, aCompare, aBias || exports.GREATEST_LOWER_BOUND);
                if (index < 0) return -1;
                for (;index - 1 >= 0 && 0 === aCompare(aHaystack[index], aHaystack[index - 1], !0); ) --index;
                return index;
            };
        }, function(module, exports) {
            module.exports = __WEBPACK_EXTERNAL_MODULE_10__;
        }, function(module, exports) {
            module.exports = __WEBPACK_EXTERNAL_MODULE_11__;
        }, function(module, exports, __webpack_require__) {
            const readWasm = __webpack_require__(4);
            let cachedWasm = null;
            module.exports = function() {
                if (cachedWasm) return cachedWasm;
                const callbackStack = [];
                return cachedWasm = readWasm().then(buffer => WebAssembly.instantiate(buffer, {
                    env: {
                        mapping_callback(generatedLine, generatedColumn, hasLastGeneratedColumn, lastGeneratedColumn, hasOriginal, source, originalLine, originalColumn, hasName, name) {
                            const mapping = new function() {
                                this.generatedLine = 0, this.generatedColumn = 0, this.lastGeneratedColumn = null, 
                                this.source = null, this.originalLine = null, this.originalColumn = null, this.name = null;
                            }();
                            mapping.generatedLine = generatedLine + 1, mapping.generatedColumn = generatedColumn, 
                            hasLastGeneratedColumn && (mapping.lastGeneratedColumn = lastGeneratedColumn - 1), 
                            hasOriginal && (mapping.source = source, mapping.originalLine = originalLine + 1, 
                            mapping.originalColumn = originalColumn, hasName && (mapping.name = name)), callbackStack[callbackStack.length - 1](mapping);
                        },
                        start_all_generated_locations_for() {
                            console.time("all_generated_locations_for");
                        },
                        end_all_generated_locations_for() {
                            console.timeEnd("all_generated_locations_for");
                        },
                        start_compute_column_spans() {
                            console.time("compute_column_spans");
                        },
                        end_compute_column_spans() {
                            console.timeEnd("compute_column_spans");
                        },
                        start_generated_location_for() {
                            console.time("generated_location_for");
                        },
                        end_generated_location_for() {
                            console.timeEnd("generated_location_for");
                        },
                        start_original_location_for() {
                            console.time("original_location_for");
                        },
                        end_original_location_for() {
                            console.timeEnd("original_location_for");
                        },
                        start_parse_mappings() {
                            console.time("parse_mappings");
                        },
                        end_parse_mappings() {
                            console.timeEnd("parse_mappings");
                        },
                        start_sort_by_generated_location() {
                            console.time("sort_by_generated_location");
                        },
                        end_sort_by_generated_location() {
                            console.timeEnd("sort_by_generated_location");
                        },
                        start_sort_by_original_location() {
                            console.time("sort_by_original_location");
                        },
                        end_sort_by_original_location() {
                            console.timeEnd("sort_by_original_location");
                        }
                    }
                })).then(Wasm => ({
                    exports: Wasm.instance.exports,
                    withMappingCallback: (mappingCallback, f) => {
                        callbackStack.push(mappingCallback);
                        try {
                            f();
                        } finally {
                            callbackStack.pop();
                        }
                    }
                })).then(null, e => {
                    throw cachedWasm = null, e;
                });
            };
        }, function(module, exports, __webpack_require__) {
            const SourceMapGenerator = __webpack_require__(1).SourceMapGenerator, util = __webpack_require__(0), REGEX_NEWLINE = /(\r?\n)/, NEWLINE_CODE = 10, isSourceNode = "$$$isSourceNode$$$";
            class SourceNode {
                constructor(aLine, aColumn, aSource, aChunks, aName) {
                    this.children = [], this.sourceContents = {}, this.line = null == aLine ? null : aLine, 
                    this.column = null == aColumn ? null : aColumn, this.source = null == aSource ? null : aSource, 
                    this.name = null == aName ? null : aName, this[isSourceNode] = !0, null != aChunks && this.add(aChunks);
                }
                static fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer, aRelativePath) {
                    const node = new SourceNode(), remainingLines = aGeneratedCode.split(REGEX_NEWLINE);
                    let remainingLinesIndex = 0;
                    const shiftNextLine = function() {
                        return getNextLine() + (getNextLine() || "");
                        function getNextLine() {
                            return remainingLinesIndex < remainingLines.length ? remainingLines[remainingLinesIndex++] : void 0;
                        }
                    };
                    let nextLine, lastGeneratedLine = 1, lastGeneratedColumn = 0, lastMapping = null;
                    return aSourceMapConsumer.eachMapping(function(mapping) {
                        if (null !== lastMapping) {
                            if (!(lastGeneratedLine < mapping.generatedLine)) {
                                const code = (nextLine = remainingLines[remainingLinesIndex] || "").substr(0, mapping.generatedColumn - lastGeneratedColumn);
                                return remainingLines[remainingLinesIndex] = nextLine.substr(mapping.generatedColumn - lastGeneratedColumn), 
                                lastGeneratedColumn = mapping.generatedColumn, addMappingWithCode(lastMapping, code), 
                                void (lastMapping = mapping);
                            }
                            addMappingWithCode(lastMapping, shiftNextLine()), lastGeneratedLine++, lastGeneratedColumn = 0;
                        }
                        for (;lastGeneratedLine < mapping.generatedLine; ) node.add(shiftNextLine()), lastGeneratedLine++;
                        lastGeneratedColumn < mapping.generatedColumn && (nextLine = remainingLines[remainingLinesIndex] || "", 
                        node.add(nextLine.substr(0, mapping.generatedColumn)), remainingLines[remainingLinesIndex] = nextLine.substr(mapping.generatedColumn), 
                        lastGeneratedColumn = mapping.generatedColumn), lastMapping = mapping;
                    }, this), remainingLinesIndex < remainingLines.length && (lastMapping && addMappingWithCode(lastMapping, shiftNextLine()), 
                    node.add(remainingLines.splice(remainingLinesIndex).join(""))), aSourceMapConsumer.sources.forEach(function(sourceFile) {
                        const content = aSourceMapConsumer.sourceContentFor(sourceFile);
                        null != content && (null != aRelativePath && (sourceFile = util.join(aRelativePath, sourceFile)), 
                        node.setSourceContent(sourceFile, content));
                    }), node;
                    function addMappingWithCode(mapping, code) {
                        if (null === mapping || void 0 === mapping.source) node.add(code); else {
                            const source = aRelativePath ? util.join(aRelativePath, mapping.source) : mapping.source;
                            node.add(new SourceNode(mapping.originalLine, mapping.originalColumn, source, code, mapping.name));
                        }
                    }
                }
                add(aChunk) {
                    if (Array.isArray(aChunk)) aChunk.forEach(function(chunk) {
                        this.add(chunk);
                    }, this); else {
                        if (!aChunk[isSourceNode] && "string" != typeof aChunk) throw new TypeError("Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk);
                        aChunk && this.children.push(aChunk);
                    }
                    return this;
                }
                prepend(aChunk) {
                    if (Array.isArray(aChunk)) for (let i = aChunk.length - 1; i >= 0; i--) this.prepend(aChunk[i]); else {
                        if (!aChunk[isSourceNode] && "string" != typeof aChunk) throw new TypeError("Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk);
                        this.children.unshift(aChunk);
                    }
                    return this;
                }
                walk(aFn) {
                    let chunk;
                    for (let i = 0, len = this.children.length; i < len; i++) (chunk = this.children[i])[isSourceNode] ? chunk.walk(aFn) : "" !== chunk && aFn(chunk, {
                        source: this.source,
                        line: this.line,
                        column: this.column,
                        name: this.name
                    });
                }
                join(aSep) {
                    let newChildren, i;
                    const len = this.children.length;
                    if (len > 0) {
                        for (newChildren = [], i = 0; i < len - 1; i++) newChildren.push(this.children[i]), 
                        newChildren.push(aSep);
                        newChildren.push(this.children[i]), this.children = newChildren;
                    }
                    return this;
                }
                replaceRight(aPattern, aReplacement) {
                    const lastChild = this.children[this.children.length - 1];
                    return lastChild[isSourceNode] ? lastChild.replaceRight(aPattern, aReplacement) : "string" == typeof lastChild ? this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement) : this.children.push("".replace(aPattern, aReplacement)), 
                    this;
                }
                setSourceContent(aSourceFile, aSourceContent) {
                    this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
                }
                walkSourceContents(aFn) {
                    for (let i = 0, len = this.children.length; i < len; i++) this.children[i][isSourceNode] && this.children[i].walkSourceContents(aFn);
                    const sources = Object.keys(this.sourceContents);
                    for (let i = 0, len = sources.length; i < len; i++) aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
                }
                toString() {
                    let str = "";
                    return this.walk(function(chunk) {
                        str += chunk;
                    }), str;
                }
                toStringWithSourceMap(aArgs) {
                    const generated = {
                        code: "",
                        line: 1,
                        column: 0
                    }, map = new SourceMapGenerator(aArgs);
                    let sourceMappingActive = !1, lastOriginalSource = null, lastOriginalLine = null, lastOriginalColumn = null, lastOriginalName = null;
                    return this.walk(function(chunk, original) {
                        generated.code += chunk, null !== original.source && null !== original.line && null !== original.column ? (lastOriginalSource === original.source && lastOriginalLine === original.line && lastOriginalColumn === original.column && lastOriginalName === original.name || map.addMapping({
                            source: original.source,
                            original: {
                                line: original.line,
                                column: original.column
                            },
                            generated: {
                                line: generated.line,
                                column: generated.column
                            },
                            name: original.name
                        }), lastOriginalSource = original.source, lastOriginalLine = original.line, lastOriginalColumn = original.column, 
                        lastOriginalName = original.name, sourceMappingActive = !0) : sourceMappingActive && (map.addMapping({
                            generated: {
                                line: generated.line,
                                column: generated.column
                            }
                        }), lastOriginalSource = null, sourceMappingActive = !1);
                        for (let idx = 0, length = chunk.length; idx < length; idx++) chunk.charCodeAt(idx) === NEWLINE_CODE ? (generated.line++, 
                        generated.column = 0, idx + 1 === length ? (lastOriginalSource = null, sourceMappingActive = !1) : sourceMappingActive && map.addMapping({
                            source: original.source,
                            original: {
                                line: original.line,
                                column: original.column
                            },
                            generated: {
                                line: generated.line,
                                column: generated.column
                            },
                            name: original.name
                        })) : generated.column++;
                    }), this.walkSourceContents(function(sourceFile, sourceContent) {
                        map.setSourceContent(sourceFile, sourceContent);
                    }), {
                        code: generated.code,
                        map
                    };
                }
            }
            exports.SourceNode = SourceNode;
        } ]);
    }, "object" == typeof exports && "object" == typeof module ? module.exports = factory({}, {}) : "function" == typeof define && define.amd ? define([ "fs", "path" ], factory) : "object" == typeof exports ? exports.sourceMap = factory({}, {}) : root.sourceMap = factory(root.fs, root.path), 
    module.exports;
}({
    exports: {}
}, {});