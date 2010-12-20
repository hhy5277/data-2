//     (c) 2010 Michael Aufreiter
//     Data.js is freely distributable under the MIT license.
//     Portions of Daja.js are inspired or borrowed from Underscore.js
//     and Google's Visualization API.
//     For all details and documentation:
//     http://github.com/michael/data

(function(){

  // Initial Setup
  // -------------

  // The top-level namespace. All public Data.js classes and modules will
  // be attached to this. Exported for both CommonJS and the browser.
  var Data;
  if (typeof exports !== 'undefined') {
    Data = exports;
  } else {
    Data = this.Data = {};
  }
  
  // Current version of the library. Keep in sync with `package.json`.
  Data.VERSION = '0.2.0';

  // Require Underscore, if we're on the server, and it's not already present.
  var _ = this._;
  if (!_ && (typeof require !== 'undefined')) _ = require("underscore");
  
  
  // Top Level API
  // -------

  Data.VALUE_TYPES = [
    'string',
    'number',
    'boolean',
    'date'
  ];
  
  Data.isValueType = function (type) {
    return _.include(Data.VALUE_TYPES, type);
  };
  
  // Set a new Data.Adapter and enable Persistance API
  Data.setAdapter = function(name, config) {
    var Adapter = require('./adapters/'+name+'_adapter');
    Data.adapter = new Adapter(config);
  };

  // Helpers
  // -------


  // _.Events (borrowed from Backbone.js)
  // -----------------
  
  // A module that can be mixed in to *any object* in order to provide it with
  // custom events. You may `bind` or `unbind` a callback function to an event;
  // `trigger`-ing an event fires all callbacks in succession.
  //
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.bind('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //
  
  _.Events = {

    // Bind an event, specified by a string name, `ev`, to a `callback` function.
    // Passing `"all"` will bind the callback to all events fired.
    bind : function(ev, callback) {
      var calls = this._callbacks || (this._callbacks = {});
      var list  = this._callbacks[ev] || (this._callbacks[ev] = []);
      list.push(callback);
      return this;
    },

    // Remove one or many callbacks. If `callback` is null, removes all
    // callbacks for the event. If `ev` is null, removes all bound callbacks
    // for all events.
    unbind : function(ev, callback) {
      var calls;
      if (!ev) {
        this._callbacks = {};
      } else if (calls = this._callbacks) {
        if (!callback) {
          calls[ev] = [];
        } else {
          var list = calls[ev];
          if (!list) return this;
          for (var i = 0, l = list.length; i < l; i++) {
            if (callback === list[i]) {
              list.splice(i, 1);
              break;
            }
          }
        }
      }
      return this;
    },

    // Trigger an event, firing all bound callbacks. Callbacks are passed the
    // same arguments as `trigger` is, apart from the event name.
    // Listening for `"all"` passes the true event name as the first argument.
    trigger : function(ev) {
      var list, calls, i, l;
      if (!(calls = this._callbacks)) return this;
      if (list = calls[ev]) {
        for (i = 0, l = list.length; i < l; i++) {
          list[i].apply(this, Array.prototype.slice.call(arguments, 1));
        }
      }
      if (list = calls['all']) {
        for (i = 0, l = list.length; i < l; i++) {
          list[i].apply(this, arguments);
        }
      }
      return this;
    }
  };

  // Shared empty constructor function to aid in prototype-chain creation.
  var ctor = function(){};

  // Helper function to correctly set up the prototype chain, for subclasses.
  // Similar to `goog.inherits`, but uses a hash of prototype properties and
  // class properties to be extended.
  // Taken from Underscore.js (c) Jeremy Ashkenas
  _.inherits = function(parent, protoProps, staticProps) {
    var child;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call `super()`.
    if (protoProps && protoProps.hasOwnProperty('constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ return parent.apply(this, arguments); };
    }

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) _.extend(child.prototype, protoProps);

    // Add static properties to the constructor function, if supplied.
    if (staticProps) _.extend(child, staticProps);

    // Correctly set child's `prototype.constructor`, for `instanceof`.
    child.prototype.constructor = child;

    // Set a convenience property in case the parent's prototype is needed later.
    child.__super__ = parent.prototype;

    return child;
  };
  
  
  
  // Data.Hash
  // --------------

  // A Hash data structure that provides a simple layer of abstraction for
  // managing a sortable data-structure with hash semantics. It's heavily
  // used throughout Data.js.
  
  Data.Hash = function(data) {
    var that = this;
    this.data = {};
    this.keyOrder = [];
    this.length = 0;

    if (data instanceof Array) {
      _.each(data, function(datum, index) {
        that.set(index, datum);
      });
    } else if (data instanceof Object) {
      _.each(data, function(datum, key) {
        that.set(key, datum);
      });
    }
    
    if (this.initialize) this.initialize(attributes, options);
  };

  _.extend(Data.Hash.prototype, {

    // Returns a copy of the Hash
    // Used by transformation methods
    clone: function () {
      var copy = new Data.Hash();
      copy.length = this.length;
      _.each(this.data, function(value, key) {
        copy.data[key] = value;
      });
      copy.keyOrder = this.keyOrder.slice(0, this.keyOrder.length);
      return copy;
    },
    
    // Set a value at a given *key*
    set: function (key, value, targetIndex) {
      if (key === undefined)
        return this;

      if (!this.data[key]) {
        if (targetIndex !== undefined) { // insert at a given index
          var front = this.select(function(item, key, index) {
            return index < targetIndex;
          });

          var back = this.select(function(item, key, index) {
            return index >= targetIndex;
          });

          this.keyOrder = [].concat(front.keyOrder);
          this.keyOrder.push(key);
          this.keyOrder = this.keyOrder.concat(back.keyOrder);
        } else {
          this.keyOrder.push(key);
        }
        this.length += 1;
      }

      this.data[key] = value;
      return this;
    },
    
    // Remove entry at given *key*
    del: function (key) {
      delete this.data[key];
      this.keyOrder.splice(this.index(key), 1);
      this.length -= 1;
      return this;
    },
    
    // Get value at given *key*
    get: function (key) {
      return this.data[key];
    },
    
    // Get value at given *index*
    at: function (index) {
      var key = this.keyOrder[index];
      return this.data[key];
    },
    
    // Get first item
    first: function () {
      return this.at(0);
    },
    
    // Get last item
    last: function () {
      return this.at(this.length-1);
    },
    
    // Returns for an index the corresponding *key*
    key: function (index) {
      return this.keyOrder[index];
    },
    
    // Returns for a given *key* the corresponding *index*
    index: function(key) {
      return this.keyOrder.indexOf(key);
    },
    
    // Iterate over values contained in the `Data.Hash`
    each: function (fn) {
      var that = this;
      _.each(this.keyOrder, function(key, index) {
        fn.call(that, that.data[key], key, index);
      });
      return this;
    },
    
    // Convert to an ordinary JavaScript Array containing just the values
    values: function () {
      var result = [];
      this.each(function(value, key, index) {
        result.push(value);
      });
      return result;
    },

    // Returns all keys in current order
    keys: function () {
      return this.keyOrder;
    },
    
    // Convert to an ordinary JavaScript Array containing
    // key value pairs. Used by `sort`.
    toArray: function () {
      var result = [];
    
      this.each(function(value, key) {
        result.push({key: key, value: value});
      });
    
      return result;
    },

    // Map the `Set` to your needs
    map: function (fn) {
      var result = this.clone(),
          that = this;
      result.each(function(item, key, index) {
        result.data[that.key(index)] = fn.call(result, item);
      });
      return result;
    },

    // Select items that match some conditions expressed by a matcher function
    select: function (fn) {
      var result = new Data.Hash(),
          that = this;
    
      this.each(function(value, key, index) {
        if (fn.call(that, value, key, index)) {
          result.set(key, value);
        }
      });
      return result;
    },
    
    // Performs a sort
    sort: function (comparator) {
      var result = this.clone();
          sortedKeys = result.toArray().sort(comparator);
    
      // update keyOrder
      result.keyOrder = _.map(sortedKeys, function(k) {
        return k.key;
      });
      return result;
    },
    
    // Performs an intersection with the given *hash*
    intersect: function(hash) {
      var that = this,
      result = new Data.Hash();
    
      this.each(function(value, key) {
        hash.each(function(value2, key2) {
          if (key === key2) {
            result.set(key, value);
          }
        });
      });
      return result;
    },
    
    // Performs an union with the given *hash*
    union: function(hash) {
      var that = this,
      result = new Data.Hash();
    
      this.each(function(value, key) {
        if (!result.get(key))
          result.set(key, value);
      });
      hash.each(function(value, key) {
        if (!result.get(key))
          result.set(key, value);
      });
      return result;
    }
  });
  
  // Data.Comparators
  // --------------

  Data.Comparators = {};
  
  Data.Comparators.ASC = function(item1, item2) {
    return item1.value === item2.value ? 0 : (item1.value < item2.value ? -1 : 1);
  };

  Data.Comparators.DESC = function(item1, item2) {
    return item1.value === item2.value ? 0 : (item1.value > item2.value ? -1 : 1);
  };
  
  
  // Data.Aggregators
  // --------------

  Data.Aggregators = {};

  Data.Aggregators.SUM = function (values) {
    var result = 0;

    values.each(function(value, key, index) {
      result += value;
    });

    return result;
  };

  Data.Aggregators.MIN = function (values) {
    var result = Infinity;
    values.each(function(value, key, index) {
      if (value < result) {
        result = value;
      }
    });
    return result;
  };

  Data.Aggregators.MAX = function (values) {
    var result = -Infinity;
    values.each(function(value, key, index) {
      if (value > result) {
        result = value;
      }
    });
    return result;
  };

  Data.Aggregators.AVG = function (values) {
    return Data.Aggregators.SUM(values) / values.length;
  };

  Data.Aggregators.COUNT = function (values) {
    return values.length;
  };
  
  // Data.Node
  // --------------
  
  // JavaScript Node implementation that hides graph complexity from
  // the interface. It introduces properties, which group types of edges
  // together. Therefore multi-partite graphs are possible without any hassle.
  // Every Node simply contains properties which conform to outgoing edges.
  // It makes heavy use of hashing through JavaScript object properties to
  // allow random access whenever possible. If I've got it right, it should 
  // perform sufficiently fast, allowing speedy graph traversals.
  
  Data.Node = function(options) {
    this.nodeId = Data.Node.generateId();
    if (options) {
      this.val = options.value;
    }
    this._properties = {};
    
    if (this.initialize) this.initialize(options);
  };
  
  Data.Node.nodeCount = 0;
  
  // Generates a unique id for each node
  Data.Node.generateId = function () {
    return Data.Node.nodeCount += 1;
  };
  
  _.extend(Data.Node.prototype, _.Events, {
    // Node identity, which is simply the node's id
    identity: function() {
      return this.nodeId;
    },
    
    // Replace a property with a complete `Hash`
    replace: function(property, hash) {
      this._properties[property] = hash;
    },

    // Set a Node's property
    // 
    // Takes a property key, a value key and value. Values that aren't
    // instances of `Data.Node` wrapped are automatically.
    set: function (property, key, value) {
      if (!this._properties[property]) {
        this._properties[property] = new Data.Hash();
      }
      this._properties[property].set(key, value instanceof Data.Node ? value : new Data.Node({value: value}));
      return this;
    },
    

    // Get node for given *property* at given *key*
    get: function (property, key) {
      if (key !== undefined && this._properties[property] !== undefined) {
        return this._properties[property].get(key);
      }
    },

    // Get all connected nodes at given *property*
    all: function(property) {
      return this._properties[property];
    },
    
    // Get first connected node at given *property*
    // 
    // Useful if you want to mimic the behavior of unique properties.
    // That is, if you know that there's always just one associated node
    // at a given property.
    first: function(property) {
      var p = this._properties[property];
      return p ? p.first() : null;  
    },

    // Value of first connected target node at given *property*
    value: function(property) {
      return this.values(property).first();
    },
    
    // Values of associated target nodes for non-unique properties
    values: function(property) {
      if (!this.all(property)) return new Data.Hash();
      return this.all(property).map(function(n) {
        return n.val;
      });
    }
  });
  
  
  // Data.Adapter
  // --------------
  
  // An abstract interface for persisting and reading Data.Graphs.
  
  Data.Adapter = function(config) {
    // The config object is used to describe database credentials
    this.config = config;
  };
  
  _.extend(Data.Adapter.prototype, {
    
    // Takes a query object to match objects in the database 
    // and return them as a Data.Graph
    // 
    // Fetch all nodes of /type/document:
    //
    //  {
    //    "type": "/type/document"
    //  }
    // 
    // Fetch all nodes of /type/document associated with "user": "/user/michael"
    //  {
    //    "type": "/type/document"
    //    "user": "/user/michael"
    //  }
    readGraph: function(qry, targetGraph, options, callback) {
      // No-op
    },
    
    // Takes a serialized graph object and persists it
    writeGraph: function(graph, callback) {
      // No-op
    }
  });
  
  
  // Data.Property
  // --------------
  
  // Meta-data (data about data) is represented as a set of properties that
  // belongs to a certain `Data.Type`. A `Data.Property` holds a key, a name
  // and an expected type, telling whether the data is numeric or textual, etc.
  
  Data.Property = _.inherits(Data.Node, {
    constructor: function(type, key, options) {
      Data.Node.call(this);
      this.key = key;
      this.type = type;
      this.unique = options.unique;
      this.name = options.name;
      this.expectedType = options['expected_type'];
      this.replace('values', new Data.Hash());
    },
    
    isValueType: function() {
      return Data.isValueType(this.expectedType);
    },
    
    isObjectType: function() {
      return !this.isValueType();
    },
    
    // Aggregates the property's values
    aggregate: function (fn) {
      return fn(this.values("values"));
    }
  });
  
   
  // Data.Type
  // --------------
  
  // A `Data.Type` denotes an IS A relationship about a `Data.Object`. 
  // For example, if you type the object 'Shakespear' with the type 'Person'
  // you are saying that Shakespeare IS A person. Types are also used to hold
  // collections of properties that belong to a certain group of objects.
  
  Data.Type = _.inherits(Data.Node, {
    constructor: function(g, key, type) {
      var that = this;
      Data.Node.call(this);
  
      this.g = g; // belongs to the DataGraph
      this.key = key;
      this.type = type.type;
      this.name = type.name;
  
      // extract properties
      _.each(type.properties, function(property, key) {
        that.set('properties', key, new Data.Property(that, key, property));
      });
    },
    
    // Serialize a single type node
    toJSON: function() {
      var result = {
        type: '/type/type',
        name: this.name,
        properties: {}
      };
      
      this.all('properties').each(function(property) {
        result.properties[property.key] = {
          name: property.name,
          unique: property.unique,
          expected_type: property.expectedType
        };
      });
      
      return result;
    }
  });
  

  // Data.Object
  // --------------
  
  // Represents a typed data object within a `Data.Graph`.
  // Provides access to properties, defined on the corresponding `Data.Type`.
  
  Data.Object = _.inherits(Data.Node, {
    constructor: function(g, key, data) {
      Data.Node.call(this);
  
      this.g = g;
      
      // TODO: remove in favor of _id
      this.key = key;

      // Pull off _id and _rev properties      
      this._id = data._id; delete data._id;
      this._rev = data._rev; delete data._rev;
      
      this.type = g.get('objects', data.type);
  
      // Associated Data.Objects
      this.referencedObjects = new Data.Hash();
      
      // Memoize raw data for the build process
      this.data = data;
    },
    
    // After all nodes are recognized the Item can be built
    build: function() {
      var that = this;
    
      _.each(this.data, function(property, key) {
        if (key === 'type') return; // Skip type property
        
        // Ask the schema wheter this property holds a
        // value type or an object type
        var values = _.isArray(property) ? property : [property];
        var p = that.type.get('properties', key);
  
        if (!p) {
          throw "property "+key+" not found at "+that.type.key+" for object "+that.key+"";
        }
  
        // init key
        that.replace(p.key, new Data.Hash());
  
        if (p.isObjectType()) {
          _.each(values, function(v, index) {
            var res = that.g.get('objects', v);
            if (!res) {
              throw "Can't reference "+v;
            }
            
            // Register referenced `Data.Objects` on the resource
            res.referencedObjects.set(that.key, that);
            
            that.set(p.key, res.key, res);
            p.set('values', res.key, res);
          });
        } else {
          that.setValueProperty(p.key, values);
        }
      });
    },
    
    // Set a value property
    setValueProperty: function(property, values) {
      var that = this;
      var p = this.type.get('properties', property);
      
      // Reset property
      this.replace(p.key, new Data.Hash());
      
      _.each(values, function(v, index) {
        var val = p.get('values', v);

        // Check if the value is already registered
        // on this property
        if (!val) {
          val = new Data.Node({value: v});
          val.referencedObjects = new Data.Hash();
        }
        
        // Register associated `Data.Objects` on the value
        // TODO: update registered oldvalue and point it to the new value
        val.referencedObjects.set(that.key, that); 
        
        that.set(p.key, v, val);
        p.set('values', v, val);
      });
    },
    
    // There are four different access scenarios for getting a certain property
    // 
    // * Unique value types
    // * Non-unique value types
    // * Unique object types 
    // * Non-Unique object types 
    // 
    // For convenience there's a get method, which always returns the right
    // result depending on the schema information. However, internally, every
    // property of a resource is represented as a non-unique `Data.Hash` 
    // of `Data.Node` objects, even if it's a unique property. So if you want 
    // to be explicit you should use the native methods of `Data.Node`. If
    // two arguments are provided `get` delegates to `Data.Node#get`.
    
    get: function(property, key) {
      var p = this.type.get('properties', property);
      if (!p) return null;
  
      if (arguments.length === 1) {
        if (p.isObjectType()) {
          return p.unique ? this.first(property) : this.all(property);
        } else {
          return p.unique ? this.value(property) : this.values(property);
        }
      } else {
        return Data.Node.prototype.get.call(this, property, key);
      }
    },
    
    // Sets properties on the object
    // Existing properties are overridden / replaced
    set: function(properties) {
      var that = this;
      
      if (arguments.length === 1) {
        _.each(properties, function(value, key) {
          var p = that.type.get('properties', key);
          
          if (p.isObjectType()) {
            throw 'Manually setting object properties is not yet implemented.';
          } else {
            that.setValueProperty(key, _.isArray(value) ? value : [value]);
          }
        });
      } else {
        return Data.Node.prototype.set.call(this, arguments[0], arguments[1], arguments[2]);
      }
    },
    
    // Serialize an `Data.Object`'s properties
    toJSON: function() {
      var that = this;
      result = {};
      
      _.each(this._properties, function(value, key) {
        var p = that.type.get('properties', key);
        if (p.isObjectType()) {
          result[key] = p.unique ? that.all(key).keys()[0] : that.all(key).keys()
        } else {
          result[key] = p.unique ? that.value(key) : that.values(key).values();
        }
      });
      result['type'] = this.type.key;
      return result;
    }
  });
  
  
  // Data.Graph
  // --------------
  
  // A `Data.Graph` can be used for representing arbitrary complex object
  // graphs. Relations between objects are expressed through links that
  // point to referred objects. Data.Graphs can be traversed in various ways.
  // See the testsuite for usage. They're meant to be used read-only in a 
  // functional style.
  
  Data.Graph = _.inherits(Data.Node, {
    constructor: function(g) {
      var that = this;
      
      Data.Node.call(this);
      
      // TODO: Put everything under a 'nodes' property
      this.replace('objects', new Data.Hash());
      if (!g) return;
      this.merge(g);
    },
    
    
    // Merges in another Graph
    merge: function(g) {
      var that = this;
      
      // Process schema nodes
      var types = _.select(g, function(node, key) {
        if (node.type === '/type/type') {
          that.set('objects', key, new Data.Type(that, key, node));
          return true;
        }
        return false;
      });
      
      // Process object nodes
      var objects = _.select(g, function(node, key) {
        if (node.type !== '/type/type') {
          var res = that.get('objects', key) || new Data.Object(that, key, node);
          that.set('objects', key, res);
          
          if (!that.get('objects', node.type)) {
            throw "Type '"+node.type+"' not found for "+key+"...";
          }
          that.get('objects', node.type).set('objects', key, res);
          return true;
        }
        return false;
      });
        
      // Now that all objects are registered we can build them
      this.objects().each(function(r, key, index) {
        r.build();
      });
    },
    
    // API method for accessing objects in the graph space
    // TODO: Ask the datastore if the node is not known in the local graph
    //       use async method queues for this!
    get: function(key) {
      if (arguments.length === 1) {
        return this.get('objects', key);
        
      } else {
        return Data.Node.prototype.get.call(this, arguments[0], arguments[1]);
      }
    },
    
    // Serializes the graph to the JSON-based exchange format
    toJSON: function() {
      var result = {};
      
      // Serialize object nodes
      this.all('objects').each(function(obj, key) {
        result[key] = obj.toJSON();
      });
      
      return result;
    },
    
    // Fetches a new subgraph from the adapter and either merges the new nodes
    // into the current set of nodes or replaces the graph completely with
    // the query result
    fetch: function(qry, options, callback) {
      var that = this;
      
      Data.adapter.readGraph(qry, this, options, function(err, graph) {
        that.merge(graph);
        err ? callback(err) : callback(null, graph);
      });
    },
    
    // Write all new and dirty nodes to the server
    save: function(callback) {
      var that = this;
      
      Data.adapter.writeGraph(this.toJSON(), function(err) {
        err ? callback(err) : callback();
      });
    },
    
    // Perform a filter on the graph. Expects `Data.Criterion` object
    // describing the filter conditions
    filter: function(criteria) {
      var g2 = {};
      
      // Include schema information from the original graph
      this.types().each(function(type, key) {
        g2[key] = type.toJSON();
      });
      
      // Include matched object nodes
      criteria.run(this).each(function(obj, key) {
        g2[key] = obj.toJSON();
      });
      
      return new Data.Graph(g2);
    },
    
    // Type nodes
    types: function() {
      return this.all('objects').select(function(node, key) {
        return node.type === '/type/type';
      });
    },
    
    // Object nodes
    objects: function() {
      return this.all('objects').select(function(node, key) {
        return node.type !== '/type/type';
      });
    }
  });
  
  
  // Data.Collection
  // --------------
  
  // A Collection is a simple data abstraction format where a dataset under
  // investigation conforms to a collection of data items that describes all
  // facets of the underlying data in a simple and universal way. You can
  // think of a Collection as a table of data, except it provides precise
  // information about the data contained (meta-data). A Data.Collection
  // just wraps a `Data.Graph` internally, in order to simplify the interface,
  // for cases where you do not have to deal with linked data.
  
  Data.Collection = function(spec) {
    var that = this,
        gspec = { "/type/item": {"type": "/type/type", "properties": {}}};

    // Convert to Data.Graph serialization format
    if (spec) {
      _.each(spec.properties, function(property, key) {
        gspec["/type/item"].properties[key] = property;
      });
      
      _.each(spec.items, function(item, key) {
        gspec[key] = item;
        gspec[key].type = "/type/item";
      });
      
      this.g = new Data.Graph(gspec);
    } else {
      this.g = new Data.Graph();
    }
  };
  
  _.extend(Data.Collection.prototype, {
    get: function(property, key) {
      if (property === 'properties') {
        return this.g.get('objects', '/type/item').get('properties', key);
      } else if (property === 'items') {
        return this.g.get('objects', key);
      }
    },
    
    all: function() {
      if (property === 'properties') {
        return this.g.get('objects', '/type/item').all('properties');
      } else if (property === 'items') {
        return this.g.all('objects', key);
      }
    }
  });

  
  // Data.Criterion
  // --------------

  Data.Criterion = function (operator, type, property, value) {
    this.operator = operator;
    this.type = type;
    this.property = property;
    this.value = value;
    this.children = [];
  };
  
  Data.Criterion.operators = {};
  
  _.extend(Data.Criterion.operators, {
    
    // Logical Connectors
    
    AND: function(target, criteria) {
      if (criteria.length === 0) return new Data.Hash();
      var result = criteria[0].run(target);
      for(var i=1; i < criteria.length; i++) {
        result = result.intersect(criteria[i].run(target));
      }
      return result;
    },

    OR: function(target, criteria) {
      var result = new Data.Hash();
      for(var i=0; i < criteria.length; i++) {
        result = result.union(criteria[i].run(target));
      }
      return result;
    },

    // Logical Operators
    
    CONTAINS: function(target, typeKey, propertyKey, value) {
      var type = target.get('objects', typeKey),
          property = type.get('properties', propertyKey),
          v = property.get('values', value);
      
      // Only return results within the requested type range
      return v.referencedObjects.select(function(obj, key) {
        return obj.type.key === typeKey;
      });
    },
    
    // Only works with value type properties
    GT: function(target, typeKey, propertyKey, value) {
      var type = target.get('objects', typeKey),
          property = type.get('properties', propertyKey),
          values = property.all('values'),
          matchedObjects = new Data.Hash();
          
      values = values.select(function(v) {
        return v.val >= value;
      });
      
      values.each(function(v) {
        matchedObjects = matchedObjects.union(v.referencedObjects);
      });
      return matchedObjects;
    }
  });
  
  _.extend(Data.Criterion.prototype, {
    add: function(criterion) {
      this.children.push(criterion);
      return this;
    },

    // Run criterion against a Data.Graph (target)
    // TODO: allow Data.Collections to be passed here too,
    // for Collections the type attribute can be derived automatically.
    run: function(target) {
      if (this.operator === "AND") {
        return Data.Criterion.operators.AND(target, this.children);
      } else if (this.operator === "OR") {
        return Data.Criterion.operators.OR(target, this.children);
      } else {
        // Leaf nodes
        return Data.Criterion.operators[this.operator](target, this.type, this.property, this.value);
      }
    }
  });
  
})();