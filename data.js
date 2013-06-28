//     (c) 2013 Michael Aufreiter, Oliver Buchtala
//     Data.js is freely distributable under the MIT license.
//     Portions of Data.js are inspired or borrowed from Underscore.js,
//     Backbone.js and Google's Visualization API.
//     For all details and documentation:
//     http://github.com/michael/data

(function(root){ "use strict";

var _,
    util,
    errors,
    ot,
    Chronicle;

if (typeof exports !== 'undefined') {
  _    = require('underscore');
  // Should be require('substance-util') in the future
  util   = require('./lib/util/util');
  errors   = require('./lib/util/errors');
  Chronicle = require('./lib/chronicle/chronicle');
  ot = require('./lib/chronicle/lib/ot/index');
} else {
  _ = root._;
  util = root.Substance.util;
  errors   = root.Substance.errors;
  Chronicle   = root.Substance.Chronicle;
  ot = Chronicle.ot;
}


// Initial Setup
// -------------

// The top-level namespace. All public Data.js classes and modules will
// be attached to this. Exported for both CommonJS and the browser.
var Data = {};

// Current version of the library. Keep in sync with `package.json`.
Data.VERSION = '0.7.0';

// Top Level API
// -------

Data.VALUE_TYPES = [
  'object',
  'array',
  'string',
  'number',
  'boolean',
  'date'
];

// Node: the actual type of a composite type is the first entry
// I.e., ["array", "string"] is an array in first place
Data.isValueType = function (type) {
  if (_.isArray(type)) {
    type = type[0];
  }
  return Data.VALUE_TYPES.indexOf(type) >= 0;
};

// Data.Schema
// ========
//
// Provides a schema inspection API

Data.Schema = function(schema) {
  _.extend(this, schema);
};

Data.Schema.__prototype__ = function() {

  // Return Default value for a given type
  // --------
  //

  this.defaultValue = function(valueType) {
    if (valueType === "object") return {};
    if (valueType === "array") return [];
    if (valueType === "string") return "";
    if (valueType === "number") return 0;
    if (valueType === "boolean") return false;
    if (valueType === "date") return new Date();

    return null;
    // throw new Error("Unknown value type: " + valueType);
  };

  // Return type object for a given type id
  // --------
  //

  this.parseValue = function(valueType, value) {
    if (_.isString(value)) {
      if (valueType === "object") return JSON.parse(value);
      if (valueType === "array") return JSON.parse(value);
      if (valueType === "string") return value;
      if (valueType === "number") return parseInt(value, 10);
      if (valueType === "boolean") {
        if (value === "true") return true;
        else if (value === "false") return false;
        else throw new Error("Can not parse boolean value from: " + value);
      }
      if (valueType === "date") return new Date(value);

      // all other types must be string compatible ??
      return value;

    } else {
      if (valueType === 'array') {
        if (!_.isArray(value)) {
          throw new Error("Illegal value type: expected array.");
        }
        value = util.deepclone(value);
      }
      else if (valueType === 'string') {
        if (!_.isString(value)) {
          throw new Error("Illegal value type: expected string.");
        }
      }
      else if (valueType === 'object') {
        if (!_.isObject(value)) {
          throw new Error("Illegal value type: expected object.");
        }
        value = util.deepclone(value);
      }
      else if (valueType === 'number') {
        if (!_.isNumber(value)) {
          throw new Error("Illegal value type: expected number.");
        }
      }
      else if (valueType === 'boolean') {
        if (!_.isBoolean(value)) {
          throw new Error("Illegal value type: expected boolean.");
        }
      }
      else if (valueType === 'date') {
        value = new Date(value);
      }
      else {
        throw new Error("Unsupported value type: " + valueType);
      }
      return value;
    }
  };

  // Return type object for a given type id
  // --------
  //

  this.type = function(typeId) {
    return this.types[typeId];
  };

  // For a given type id return the type hierarchy
  // --------
  //
  // => ["base_type", "specific_type"]

  this.typeChain = function(typeId) {
    var type = this.types[typeId];
    if (!type) throw new Error('Type ' + typeId + ' not found in schema');

    var chain = (type.parent) ? this.typeChain(type.parent) : [];
    chain.push(typeId);
    return chain;
  };

  // Provides the top-most parent type of a given type.
  // --------
  //

  this.baseType = function(typeId) {
    return this.typeChain(typeId)[0];
  };

  // Return all properties for a given type
  // --------
  //

  this.properties = function(type) {
    type = _.isObject(type) ? type : this.type(type);
    var result = (type.parent) ? this.properties(type.parent) : {};
    _.extend(result, type.properties);
    return result;
  };

  // Returns the full type for a given property
  // --------
  //
  // => ["array", "string"]

  this.propertyType = function(type, property) {
    var properties = this.properties(type);
    var propertyType = properties[property];
    if (!propertyType) throw new Error("Property not found for" + type +'.'+property);
    return _.isArray(propertyType) ? propertyType : [propertyType];
  };

  // Returns the base type for a given property
  // --------
  //
  //  ["string"] => "string"
  //  ["array", "string"] => "array"

  this.propertyBaseType = function(type, property) {
    return this.propertyType(type, property)[0];
  };
};

Data.Schema.prototype = new Data.Schema.__prototype__();

// Data.Node
// ========
//
// A `Data.Node` refers to one element in the graph

Data.Node = function() {
  throw new Error("A Data.Node can't be instantiated.");
};

// Safely constructs a new node based on type information
// Node needs to have a valid type
// All properties that are not registered, are dropped
// All properties that don't have a value are

Data.Node.create = function (schema, node) {
  if (!node.id || !node.type) {
    throw new Error("Can not create Node: 'id' and 'type' are mandatory.");
  }

  var type = schema.type(node.type);
  if (!type) throw new Error("Type not found in the schema");

  var properties = schema.properties(node.type);
  var freshNode = { type: node.type, id: node.id };

  // Start constructing the fresh node
  _.each(properties, function(p, key) {
    // Find property base type
    var baseType = schema.propertyBaseType(node.type, key);

    // Assign user defined property value or use default value for baseType
    var val = (node[key] !== undefined) ? node[key] : schema.defaultValue(baseType);
    freshNode[key] = util.deepclone(val);
  });

  return freshNode;
};

// Data.Graph
// ========

// A `Data.Graph` can be used for representing arbitrary complex object
// graphs. Relations between objects are expressed through links that
// point to referred objects. Data.Graphs can be traversed in various ways.
// See the testsuite for usage.

Data.Graph = function(schema, options) {
  options = options || {};

  // Initialization
  this.schema = new Data.Schema(schema);
  this.objectAdapter = new Data.Graph.ObjectAdapter(this);

  this.nodes = {};
  this.indexes = {};

  this.init();

  if(options.store) {
    Data.Graph.makePersistent(this, options.store);
  }

  if(options.chronicle) {
    Data.Graph.makeVersioned(this, options.chronicle);
  }

  // Populate graph
  if (options.graph) this.merge(options.graph);
};

Data.Graph.__prototype__ = function() {

  var _private = new Data.Graph.Private();

  // Manipulation API
  // ========

  // Adds a new node to the graph
  // --------
  // Only properties that are specified in the schema are taken.

  this.create = function(node) {
    this.exec(Data.Graph.Create(node));
  };

  // Removes a node with given id
  // --------

  this.delete = function(path, key) {
    // Shortcut for graph deletes
    if (_.isString(path)) {
      key = path;
      path = [];
      // console.log('DELETE', key);
      return this.exec(Data.Graph.Delete(this.get(key)));
    }

    // 1. resolve
    var prop = this.resolve(path);
    var propType = prop.baseType();

    if (propType === "array") {
      return this.exec(Data.Graph.Update(path, Data.Array.Delete(prop.get(), key)));
    }

    throw new Error('Delete not supported for '+ propType);
  };

  // Updates the property with a given operation.
  // --------
  // Note: the diff has to be given as an appropriate operation.

  this.update = function(path, diff) {
    this.exec(Data.Graph.Update(path, diff));
  };

  // Sets the property to a given value
  // --------

  this.set = function(path, value) {
    this.exec(Data.Graph.Set(path, value));
  };

  // Executes a graph command
  // --------

  this.exec = function(command) {

    // Note: all Graph commands are converted to ObjectOperations
    // which get applied on this graph instance (via ObjectAdapter).
    var op;

    if (!(command instanceof ot.ObjectOperation)) {
      op = _private.convertToObjectOperation.call(this, command);
    } else {
      op = command;
    }
    op.apply(this.objectAdapter);
    return op;
  };

  // Others
  // ========

  this.get = function(path) {
    if (!path) return undefined;

    if (arguments.length > 1) path = _.toArray(arguments);
    if (_.isString(path)) return this.nodes[path];

    var prop = this.resolve(path);
    return prop.get();
  };

  this.query = function(path) {
    var prop = this.resolve(path);

    var type = prop.type();
    var baseType = prop.baseType();
    var val = prop.get();

    // resolve referenced nodes in array types
    if (baseType === "array") {
      return _private.queryArray.call(this, val, type);
    } else if (!Data.isValueType(baseType)) {
      return this.get(val);
    } else {
      return val;
    }
  };

  // Checks if a node with given id exists
  // ---------

  this.contains = function(id) {
    return (!!this.nodes[id]);
  };

  // Resolves a property with a given path
  // ---------

  this.resolve = function(path) {
    return new Data.Property(this, path);
  };

  // Resets the graph to an initial state.
  // --------

  this.reset = function() {
    this.init();
  };

  this.init = function() {
    this.nodes = {};
    this.indexes = {};
    _private.initIndexes.call(this);
  };

  // Merges this graph with another graph
  // --------
  //

  this.merge = function(graph) {
    _.each(graph.nodes, function(n) {
      graph.create(n);
    });

    return this;
  };

  // View Traversal
  // --------

  this.traverse = function(view) {
    return _.map(this.getView(view), function(node) {
      return this.get(node);
    }, this);
  };

  // Find data nodes based on index
  // --------

  this.find = function(index, scope) {
    var indexes = this.indexes;
    var self = this;

    function wrap(nodeIds) {
      return _.map(nodeIds, function(n) {
        return self.get(n);
      });
    }

    if (!indexes[index]) return []; // throw index-not-found error instead?
    if (_.isArray(indexes[index])) return wrap(indexes[index]);
    if (!indexes[index][scope]) return [];

    return wrap(indexes[index][scope]);
  };

  this.properties = function(type) {
    var result = type.parent ? this.schema.types[type.parent].properties : {};
    _.extend(result, type.properties);
    return result;
  };

  // Returns the property type
  // TODO: should take typename, key instead of node object, key
  this.propertyType = function(node, path) {
    var type = node.type;
    for (var idx = 0; idx < path.length; idx++) {
      var types = this.properties(this.schema.types[type]);
      type = types[path[idx]];
      if (type === undefined) {
        throw new Error("Can not resolve type for path " + JSON.stringify(path));
      }
    }
    return _.isArray(type) ? type : [type];
  };

};

// Private Graph implementation
// ========
//

Data.Graph.Private = function() {

  var _private = this;

  this.convertToObjectOperation = function(command) {

    // parse the command to have a normalized representation
    // TODO: need to map convenience operations to atomic graph commands
    command = new Data.Command(command);

    var op, id, prop;
    // Note: we convert the Data.Commands to ObjectOperations

    if (command.op === "create") {
      id = command.args.id;
      // Note: in this case the path must be empty, as otherwise the property lookup
      // claims due to the missing data
      op = ot.ObjectOperation.Create([id], command.args);
    }
    else if (command.op === "delete") {
      id = command.args.id;
      var node = this.get(id);
      // Note: OTOH, in this case the path must be set to the node id
      // as ObjectOperation will check if the value is correct
      op = ot.ObjectOperation.Delete([id], node);
    }
    else if (command.op === "update") {
      prop = this.resolve(command.path);
      var valueType = prop.baseType();
      op = ot.ObjectOperation.Update(command.path, command.args, valueType);
    }
    else if (command.op === "set") {
      prop = this.resolve(command.path);
      op = ot.ObjectOperation.Set(command.path, prop.get(), command.args);
    }

    return op;
  };

  this.create = function(node) {
    var newNode = Data.Node.create(this.schema, node);
    if (this.contains(newNode.id)) {
      throw new Error("Node already exists: " + newNode.id);
    }
    this.nodes[newNode.id] = newNode;
    _private.addToIndex.call(this, newNode);
    return this;
  };

  // Delete node by id, referenced nodes remain untouched
  this.delete = function(node) {
    _private.removeFromIndex.call(this, this.nodes[node.id]);
    delete this.nodes[node.id];
  };

  this.set = function(path, value) {
    var property = this.resolve(path);
    var oldValue = util.deepclone(property.get());
    property.set(value);

    _private.updateIndex.call(this, property, oldValue);
  };

  this.update = function(path, diff) {
    var property = this.resolve(path);
    var oldValue = util.deepclone(property.get());
    var val = property.get();

    var valueType = property.baseType();

    if (valueType === 'string') {
      val = ot.TextOperation.apply(diff, val);
    } else if (valueType === 'array') {
      val = ot.ArrayOperation.apply(diff, val);
    } else if (valueType === 'object') {
      val = ot.ObjectOperation.apply(diff, val);
    } else {
      // Note: all other types are treated via TextOperation on the String representation
      val = val.toString();
      val = ot.TextOperation.apply(diff, val);
    }
    property.set(val);

    _private.updateIndex.call(this, property, oldValue);
  };

  this.queryArray = function(arr, type) {
    if (!_.isArray(type)) {
      throw new Error("Illegal argument: array types must be specified as ['array'(, 'array')*, <type>]");
    }
    var result, idx;
    if (type[1] === "array") {
      result = [];
      for (idx = 0; idx < arr.length; idx++) {
        result.push(_private.queryArray.call(this, arr[idx], type.slice(1)));
      }
    } else if (!Data.isValueType(type[1])) {
      result = [];
      for (idx = 0; idx < arr.length; idx++) {
        result.push(this.get(arr[idx]));
      }
    } else {
      result = arr;
    }
    return result;
  };

  // Setup indexes data-structure based on schema information
  // --------
  //

  this.initIndexes = function() {
    this.indexes = {};
    _.each(this.schema.indexes, function(index, key) {
      if (index.properties === undefined || index.properties.length === 0) {
        this.indexes[key] = [];
      } else if (index.properties.length === 1) {
        this.indexes[key] = {};
      } else {
        // index.properties.length > 1
        throw new Error('No multi-property indexes supported yet');
      }
    }, this);
  };

  this.matchIndex = function(schema, nodeType, indexType) {
    var typeChain = schema.typeChain(nodeType);
    return (typeChain.indexOf(indexType) >= 0);
  };

  this.addToSingleIndex = function(indexSpec, index, node) {

    // Note: it is not necessary to create index containers as
    // it is already done by initIndexes
    var groups = indexSpec.properties;
    if (groups) {
      for (var i = 0; i < groups.length; i++) {
        var groupKey = groups[i];
        // Note: grouping is only supported for first level properties
        var groupVal = node[groupKey];
        if (groupVal === undefined) {
          throw new Error("Illegal node: missing property for indexing " + groupKey);
        }

        index[groupVal] = index[groupVal] || [];
        index[groupVal].push(node.id);
      }
    } else {
      index.push(node.id);
    }
  };

  // Adds a node to indexes
  // --------
  //

  this.addToIndex = function(node) {
    _.each(this.schema.indexes, function(indexSpec, key) {
      // skip irrelevant indexes
      if (_private.matchIndex(this.schema, node.type, indexSpec.type)) {
        _private.addToSingleIndex(indexSpec, this.indexes[key], node);
      }
    }, this);
  };

  // Silently remove node from index
  // --------

  this.removeFromSingleIndex = function(indexSpec, index, node) {
    var groups = indexSpec.properties;
    var pos;
    if (groups) {
      // remove the node from every group
      for (var i = 0; i < groups.length; i++) {
        var groupKey = groups[i];
        // Note: grouping is only supported for first level properties
        var groupVal = node[groupKey];
        if (groupVal === undefined) {
          throw new Error("Illegal node: missing property for indexing " + groupKey);
        }
        pos = index[groupVal].indexOf(node.id);
        if (pos >= 0) index[groupVal].splice(pos, 1);
        // prune empty groups
        if (index[groupVal].length === 0) delete index[groupVal];
      }
    } else {
      pos = index.indexOf(node.id);
      if (pos >= 0) index.splice(pos, 1);
    }
  };

  // Removes a node from indexes
  // --------
  //

  this.removeFromIndex = function(node) {
    _.each(this.schema.indexes, function(indexSpec, key) {
      var index = this.indexes[key];

      // Remove all indexed entries that have been registered for
      // a given node itself
      if (index[node.id]) delete index[node.id];

      // skip irrelevant indexes
      if (_private.matchIndex(this.schema, node.type, indexSpec.type)) {
        _private.removeFromSingleIndex(indexSpec, index, node);
      }

    }, this);
  };

  this.updateSingleIndex = function(indexSpec, index, property, oldValue) {
    // Note: intentionally, this is not implemented by delegating to removeFromIndex
    //  and addToIndex. The reason, removeFromIndex erases every occurance of the
    //  modified property. Instead we have to update only the affected indexes,
    //  i.e., those which are registered to the property key

    if (!indexSpec.properties) return;

    var groups = indexSpec.properties;

    var groupIdx = groups.indexOf(property.key());

    // only indexes with groupBy semantic have to be handled
    if (!groups || groupIdx < 0) return;

    var nodeId = property.node().id;
    var newValue = property.get();

    // remove the changed node from the old group
    // and prune the group if it would be empty
    index[oldValue] = _.without(index[oldValue], nodeId);
    if (index[oldValue].length === 0) delete index[oldValue];

    // add the node to the new group
    index[newValue] = index[newValue] || [];
    index[newValue].push(nodeId);

  };

  // Updates all indexes affected by the change of a given property
  // --------
  //

  this.updateIndex = function(property, oldValue) {
    if (oldValue === property.get()) return;

    _.each(this.schema.indexes, function(indexSpec, key) {
      // skip unrelated indexes
      if (_private.matchIndex(this.schema, property.node().type, indexSpec.type)) {
        _private.updateSingleIndex(indexSpec, this.indexes[key], property, oldValue);
      }

    }, this);
  };

};
Data.Graph.prototype = _.extend(new Data.Graph.__prototype__(), util.Events);

// ObjectOperation Adapter
// ========
//
// This adapter delegates object changes as supported by ot.ObjectOperation
// to graph methods

Data.Graph.ObjectAdapter = function(graph) {
  this.graph = graph;
};

Data.Graph.ObjectAdapter.__prototype__ = function() {
  var impl = new Data.Graph.Private();

  this.get = function(path) {
    var prop = this.graph.resolve(path);
    return prop.get();
  };

  this.create = function(__, value) {
    // Note: only nodes (top-level) can be created
    impl.create.call(this.graph, value);
  };

  this.set = function(path, value) {
    impl.set.call(this.graph, path, value);
  };

  this.delete = function(__, value) {
    // Note: only nodes (top-level) can be deleted
    impl.delete.call(this.graph, value);
  };
};
Data.Graph.ObjectAdapter.__prototype__.prototype = ot.ObjectOperation.Object.prototype;
Data.Graph.ObjectAdapter.prototype = new Data.Graph.ObjectAdapter.__prototype__();


Data.Property = function(graph, path) {
  if (!path) {
    throw new Error("Illegal argument: path is null/undefined.");
  }

  this.graph = graph;
  this.path = path;
  this.schema = graph.schema;

  this.__data__ = this.resolve();
};

Data.Property.__prototype__ = function() {

  this.resolve = function() {
    var node = this.graph;
    var parent = node;
    var type = "ROOT";

    var key;
    var value;

    var idx = 0;
    for (; idx < this.path.length; idx++) {

      if (parent === undefined) {
        throw new Error("Key error: could not find element for path " + JSON.stringify(this.path));
      }
      // TODO: check if the property references a node type
      if (type === "ROOT" || this.schema.types[type] !== undefined) {
        // remember the last node type
        parent = this.graph.get(this.path[idx]);
        node = parent;
        type = this.schema.properties(parent.type);
        value = node;
        key = undefined;
      } else {
        key = this.path[idx];
        var propName = this.path[idx];
        type = type[propName];
        value = parent[key];

        if (idx < this.path.length-1) {
          parent = parent[propName];
        }
      }
    }

    return {
      node: node,
      parent: parent,
      type: type,
      key: key,
      value: value
    };

  };

  this.get = function() {
    if (this.__data__.key !== undefined) {
      return this.__data__.parent[this.__data__.key];
    } else {
      return this.__data__.node;
    }
  };

  this.set = function(value) {
    if (this.__data__.key !== undefined) {
      this.__data__.parent[this.__data__.key] = this.schema.parseValue(this.baseType(), value);
    } else {
      throw new Error("'set' is only supported for node properties.");
    }
  };

  this.type = function() {
    return this.__data__.type;
  };

  this.baseType = function() {
    if (_.isArray(this.__data__.type)) return this.__data__.type[0];
    else return this.__data__.type;
  };

  this.node = function() {
    return this.__data__.node;
  };

  this.key = function() {
    return this.__data__.key;
  };

};
Data.Property.prototype = new Data.Property.__prototype__();

// Resolves the containing node and the node relative path to a property
// --------
//
Data.Property.resolve = function(graph, path) {

  var result = {};

  if (path.length === 0) {
    result.node = graph;
    result.path = [];
  } else {
    // TODO: it would be great if we could resolve references stored in properties (using schema)
    //       for now, the first fragment of the path is the id of a node or empty
    result.node = graph.get(path[0]);
    result.path = path.slice(1);
  }

  // in case the path is used to specify a new node
  if (result.node === undefined && path.length === 1) {
    result.node = graph;
    result.path = path;
  }

  return result;
};

Data.Command = function(options) {

  if (!options) throw new Error("Illegal argument: expected command spec, was " + options);

  // convert the convenient array notation into the internal object notation
  if (_.isArray(options)) {
    var op = options[0];
    var path = options.slice(1);
    var args = _.last(path);

    options = {
      op: op,
      path: path
    };

    if (_.isObject(args)) {
      options.args = path.pop();
    }
  }

  this.op = options.op;
  this.path = options.path;
  this.args = options.args;
};

Data.Command.__prototype__ = function() {

  this.clone = function() {
    return new Data.Command(this);
  };

  this.toJSON = function() {
    return {
      op: this.op,
      path: this.path,
      args: this.args
    };
  };
};

Data.Command.prototype = new Data.Command.__prototype__();

// Graph manipulation
// ---------

Data.Graph.Create = function(node) {
  return new Data.Command({
    op: "create",
    path: [],
    args: node
  });
};

Data.Graph.Delete = function(node) {
  return new Data.Command({
    op: "delete",
    path: [],
    args: node
  });
};

Data.Graph.Update = function(path, diff) {
  return new Data.Command({
    op: "update",
    path: path,
    args: diff
  });
};

Data.Graph.Set = function(path, val) {
  return new Data.Command({
    op: "set",
    path: path,
    args: val
  });
};



// Array manipulation
// ---------

Data.Array = {};

Data.Array.Delete = function(arr, val) {
  return ot.ArrayOperation.Delete(arr, val);
};

Data.Array.Push = function(arr, val) {
  return ot.ArrayOperation.Push(arr, val);
};

// Does not yet return a value
Data.Array.Pop = function(arr) {
  return ot.ArrayOperation.Pop(arr);
};

Data.Array.Clear = function(arr) {
  return ot.ArrayOperation.Clear(arr);
};


// Extensions
// ========

var PersistenceAdapter = function(delegate, nodes) {
  this.delegate = delegate;
  this.nodes = nodes;
};

PersistenceAdapter.__prototype__ = function() {

  this.get = function(path) {
    return this.delegate.get(path);
  };

  this.create = function(__, value) {
    this.delegate.create(__, value);
    this.nodes.set(value.id, value);
  };

  this.set = function(path, value) {
    this.delegate.set(path, value);
    // TODO: is it ok to store the value as node???
    var nodeId = path[0];
    var updated = this.delegate.get([nodeId]);
    this.nodes.set(nodeId, updated);
  };

  this.delete = function(__, value) {
    this.delegate.delete(__, value);
    this.nodes.delete(value.id);
  };
};
PersistenceAdapter.__prototype__.prototype = ot.ObjectOperation.Object.prototype;
PersistenceAdapter.prototype = new PersistenceAdapter.__prototype__();

// A mix-in for Data.Graph that makes a graph persistent
Data.Graph.makePersistent = function(graph, store) {

  if (graph.__nodes__ !== undefined) {
    throw new Error("Graph is already persistent");
  }

  var nodes = store.hash("nodes");
  graph.__nodes__ = nodes;
  graph.objectAdapter = new PersistenceAdapter(graph.objectAdapter, nodes);

  graph.load = function() {
    // import persistet nodes
    var keys = this.__nodes__.keys();
    for (var idx = 0; idx < keys.length; idx++) {
      graph.create(this.__nodes__.get(keys[idx]));
    }

    return this;
  };

  var __get__ = graph.get;
  graph.get = function(path) {
    if (_.isString(path)) return this.__nodes__.get(path);
    else return __get__.call(this, path);
  };

  var __reset__ = graph.reset;
  graph.reset = function() {
    __reset__.call(this);
    if (this.__nodes__) this.__nodes__.clear();
  };

};


// Versioning
// --------

var ChronicleAdapter = function(graph) {
  this.graph = graph;
  this.state = Chronicle.ROOT;
};

ChronicleAdapter.__prototype__ = function() {

  this.apply = function(change) {
    this.graph.__exec__(change);
  };

  this.invert = function(change) {
    return ot.ObjectOperation.fromJSON(change).invert();
  };

  this.transform = function(a, b, options) {
    return ot.ObjectOperation.transform(a, b, options);
  };

  this.reset = function() {
    this.graph.reset();
  };
};
ChronicleAdapter.__prototype__.prototype = Chronicle.Versioned.prototype;
ChronicleAdapter.prototype = new ChronicleAdapter.__prototype__();


Data.Graph.makeVersioned = function(graph, chronicle) {

  if (graph.chronicle !== undefined) {
    throw new Error("Graph is already versioned.");
  }

  graph.chronicle = chronicle || Chronicle.create();
  graph.chronicle.manage(new ChronicleAdapter(graph));

  graph.__exec__ = graph.exec;
  graph.exec = function(command) {
    var op = graph.__exec__.call(this, command);
    this.chronicle.record(util.clone(op));
    return op;
  };

  var __reset__ = graph.reset;
  graph.reset = function() {
    __reset__.call(this);
    this.chronicle.versioned.state = Chronicle.ROOT;
  };
};

// Exports
// ========

if (typeof exports !== 'undefined') {
  module.exports = Data;
} else {
  root.Substance.Data = Data;
}

})(this);

// TODO: this was pulled from the test case and should be revisited and merged into
// the Graph documentation.
// We should decide what convenience methods are wanted, and if we want to introduce
// NumberOperations as well.

// Graph operations
// ================
//
// Message format
// [:opcode, :target, :data] where opcodes can be overloaded for different types, the type is determined by the target (can either be a node or node.property),
//                           data is an optional hash
//
// Node operations
// --------
// create heading node
// ["create", {id: "h1", type: "heading", "content": "Hello World" } ]
//
// internal representation:
// { op: "create", path: [], args: {id: "h1", type: "heading", "content": "Hello World" } }
//
// delete node
// ["delete", {"id": "t1"}]

// String operations
// ---------
//
// update content (String OT)
// ["update", "h1", "content", [-1, "ABC", 4]]
//

// Number operations
// ---------
//
// update content (String OT)
// ["increment", "h1.level"]
//

// Array operations
// ---------------

// Push new value to end of array
// ["push", "content_view.nodes", {value: "new-entry"}]
//
// Delete 1..n elements
// ["delete", "content_view.nodes", {values: ["v1", "v2"]}]

// Insert element at position index
// ["insert", "content_view.nodes", {value: "newvalue", index: 3}]

