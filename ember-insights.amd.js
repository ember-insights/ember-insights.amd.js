define("ember-insights", 
  ["runtime","middleware","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var runtime = __dependency1__["default"];
    var middleware = __dependency2__["default"];

    var initializer = (function() {
      var Addon = {
        isActivated:  false,
        configs:      {},
        settings:     null
      };

      // start catching all of actions and transitions
      middleware.use(Addon);

      return runtime(Addon);
    })();

    __exports__["default"] = initializer;
  });
define("handler", 
  ["exports"],
  function(__exports__) {
    "use strict";
    function transitionHandler(data, tracker, settings) {
      switch (settings.trackTransitionsAs) {
        case 'event':
          tracker.sendEvent(
            'transition', JSON.stringify({ from: data.oldRouteName, to: data.routeName })
          );
          break;
        case 'pageview':
          tracker.trackPageView(data.url);
          break;
      }
    }

    function actionHandler(data, tracker, settings) {
      settings = settings || {};
      var actionLabel = data.actionArguments[0];
      var actionValue = data.actionArguments[1];

      tracker.sendEvent('action', data.actionName, actionLabel, actionValue);
    }


    __exports__["default"] = {
      factory: function(settings) {
        function defaultDispatcher(type, data, tracker) {
          switch(type) {
            case 'transition':
              transitionHandler(data, tracker, settings);
              break;
            case 'action':
              actionHandler(data, tracker, settings);
              break;
          }
        }

        return defaultDispatcher;
      },

      transitionHandler: transitionHandler,
      actionHandler: actionHandler
    };
  });
define("matcher", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /* global Ember */

    function groupMatches(group, routeName, eventType, eventValueToMatch) {
      var routeNameNoIndex = routeName.replace('.index', '');

      var allKey = 'ALL_' + eventType.toUpperCase() + 'S';
      var all = group.insights.getWithDefault(allKey, false);

      if ( checkInAll(all, eventType, eventValueToMatch, routeNameNoIndex) ) {
        return allKey;
      }

      var toMatch = getSearchingPaths(eventType, routeName, routeNameNoIndex, eventValueToMatch);

      for (var i = 0, len = toMatch.length; i < len; i++) {
        var path   = toMatch[i][0];
        var entity = toMatch[i][1];
        if (group.insights.getWithDefault(path, []).indexOf(entity) > -1) {
          return path;
        }
      }

      return false;
    }

    function getSearchingPaths(eventType, routeName, routeNameNoIndex, eventValueToMatch) {
      if (eventType === 'transition') {
        return [
          ['TRANSITIONS', routeName       ],
          ['TRANSITIONS', routeNameNoIndex],
          ['MAP.' + routeName        + '.ACTIONS', 'TRANSITION'],
          ['MAP.' + routeNameNoIndex + '.ACTIONS', 'TRANSITION']
        ];
      } else if (eventType === 'action') {
        return [
          ['ACTIONS', eventValueToMatch],
          ['MAP.' + routeName        + '.ACTIONS', eventValueToMatch],
          ['MAP.' + routeNameNoIndex + '.ACTIONS', eventValueToMatch]
        ];
      }
    }

    function getMatchedGroups(groups, routeName, eventType, eventValueToMatch) {
      var result = [];
      for (var i = 0, len = groups.length; i < len; i++) {
        var group = groups[i];
        var keys  = groupMatches(group, routeName, eventType, eventValueToMatch);
        pushToResult(keys, group, result);
      }
      return result;
    }

    function pushToResult(keyMatched, group, holder) {
      if (keyMatched) {
        holder.push({ group: group, keyMatched: keyMatched });
      }
    }

    function checkInAll(matchAllConfig, eventType, eventValueToMatch, routeNameNoIndex) {
      if (matchAllConfig === true) {
        return true;
      }
      else if (typeof matchAllConfig === 'object' && matchAllConfig.except) {
        var listOfExcepted = matchAllConfig.except;
        var valuesToMatch = [ eventValueToMatch ];
        if (eventType === 'transition' && routeNameNoIndex !== eventValueToMatch) {
          valuesToMatch.push(routeNameNoIndex);
        }

        if (Ember.EnumerableUtils.intersection(valuesToMatch, listOfExcepted).length === 0) {
          return true;
        }
      }
      return false;
    }

    function processMatchedGroups(matchedGroups, addonSettings, eventType, eventParams){
        for (var i = 0, len = matchedGroups.length; i < len; i++) {
          var matchedGroup = matchedGroups[i].group;

          if (eventType === 'transition' && addonSettings.updateDocumentLocationOnTransitions) {
            matchedGroup.tracker.set('location', document.URL);
          }
          // dispatches mapped action
          matchedGroup.dispatch(eventType, eventParams, matchedGroup.tracker);
        }
    }

    __exports__.getMatchedGroups = getMatchedGroups;
    __exports__.processMatchedGroups = processMatchedGroups;
    __exports__.pushToResult = pushToResult;
    __exports__.getSearchingPaths = getSearchingPaths;
    __exports__.checkInAll = checkInAll;
  });
define("middleware", 
  ["matcher","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    /* global Ember */
    var getMatchedGroups = __dependency1__.getMatchedGroups;
    var processMatchedGroups = __dependency1__.processMatchedGroups;

    __exports__["default"] = {
      use: function(addon) {
        function _handle(type, data) {
          var eventName, valueToMatch;

          switch (type) {
            case 'transition':
              eventName     = type;
              valueToMatch  = data.routeName;
              break;
            case 'action':
              eventName     = data.actionName;
              valueToMatch  = data.actionName;
              break;
          }

          // look up for all matching insight mappings
          var matchedGroups = getMatchedGroups(addon.settings.mappings, data.routeName, type, valueToMatch);

          // drop a line to the console log
          if (addon.settings.debug) {
            var isMapped = (matchedGroups.length ? ' SEND' : ' TRAP');
            var msg = "Ember-Insights%@: '%@'".fmt(isMapped, eventName);
            if (data.oldRouteName) { msg += " from '%@':'%@'".fmt(data.oldRouteName, data.oldUrl); }
            var prep = (type === 'action') ? 'action from' : 'to';
            if (data.routeName)    { msg += " %@ '%@':'%@'".fmt(prep, data.routeName, data.url); }

            Ember.debug(msg);
          }
          processMatchedGroups(matchedGroups, addon.settings, type, data);
        }


        // middleware for actions
        function actionMiddleware(actionName) {
          // use original implementation if addon is not activated
          if (!addon.isActivated) { this._super.apply(this, arguments); return; }

          var appController = this.container.lookup('controller:application');
          var routeName     = appController.get('currentRouteName');

          _handle('action', {
            actionName:       actionName,
            actionArguments:  [].slice.call(arguments, 1),
            route:            this.container.lookup('route:' + routeName),
            routeName:        this.container.lookup('controller:application').get('currentRouteName'),
            url:              this.container.lookup('router:main').get('url')
          });

          // bubble event back to the Ember engine
          this._super.apply(this, arguments);
        }

        // middleware for transitions
        function transitionMiddleware() {
          // use original implementation if addon is not activated
          if (!addon.isActivated) { this._super.apply(this, arguments); return; }

          var appController = this.container.lookup('controller:application');
          var oldRouteName  = appController.get('currentRouteName');
          var oldUrl        = oldRouteName ? this.get('url') : '';

          this._super.apply(this, arguments); // bubble event back to the Ember engine

          var newRouteName = appController.get('currentRouteName');

          Ember.run.scheduleOnce('routerTransitions', this, function() {
            var newUrl = (this.get('url') || '/');
            _handle('transition', {
              route:        this.container.lookup('route:' + newRouteName),
              routeName:    newRouteName,
              oldRouteName: oldRouteName,
              url:          newUrl,
              oldUrl:       oldUrl
            });
          });
        }

        // start catching actions
        Ember.ActionHandler.reopen({
          send: actionMiddleware
        });
        // start catching transitions
        Ember.Router.reopen({
          didTransition: transitionMiddleware
        });
      }
    };
  });
define("optparse", 
  ["trackers/console","handler","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    /* global Ember */
    var DefaultTracker = __dependency1__["default"];
    var DefaultHandler = __dependency2__["default"];

    __exports__["default"] = {
      trackerOpts: function(opts) {
        return this.mergeTrackerOpts(opts, opts);
      },

      mergeTrackerOpts: function(opts, basicOpts) {
        var assert;

        opts.debug = (opts.debug === undefined ? true : opts.debug);

        opts.trackerFactory = (opts.trackerFactory || basicOpts.trackerFactory || DefaultTracker.factory);
        assert = (typeof opts.trackerFactory === 'function');
        Ember.assert("'trackerFactory' should be a function", assert);

        opts.tracker = opts.trackerFactory(opts);
        assert = (typeof opts.tracker === 'object');
        Ember.assert("Can't build tracker", assert);

        opts.trackTransitionsAs = (opts.trackTransitionsAs || basicOpts.trackTransitionsAs || 'pageview');

        return opts;
      },

      basicOpts: function(opts) {
        if (typeof opts.updateDocumentLocationOnTransitions === 'undefined') {
          opts.updateDocumentLocationOnTransitions = true;
        }

        return opts;
      },

      dispatcherOpts: function(opts) {
        opts.dispatch = (opts.dispatch || DefaultHandler.factory(opts));
        var assert = (typeof opts.dispatch === 'function');
        Ember.assert("'dispatch' should be a function", assert);

        return opts;
      }
    };
  });
define("runtime", 
  ["optparse","trackers","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    /* global Ember */
    var optparse = __dependency1__["default"];
    var ConsoleTracker = __dependency2__.ConsoleTracker;
    var GoogleTracker = __dependency2__.GoogleTracker;


    __exports__["default"] = function(addon) {
      var _settings; // current configuration stage
      var runtime = {
        configure: function(env, settings) {
          env       = (env || 'default');
          settings  = (settings || {});
          _settings = settings;

          // apply defaults
          optparse.basicOpts(settings);
          optparse.trackerOpts(settings);

          settings.mappings  = [];
          addon.configs[env] = settings;

          return this;
        },
        track: function(mapping) {
          Ember.assert("Can't find `insights` property inside", mapping.insights);

          mapping.insights = Ember.Object.create(mapping.insights);

          // apply defaults
          optparse.mergeTrackerOpts(mapping, _settings);
          optparse.dispatcherOpts(mapping);

          // setup tracking mapping
          _settings.mappings.push(mapping);

          return this;
        },
        start: function(env) {
          addon.settings = addon.configs[env];
          Ember.assert("can't find settings for '" + env + "' environment", addon.settings);

          addon.isActivated = true;

          return addon.settings.tracker;
        },
        stop: function() {
          addon.isActivated = false;
        },

        // Custom trackers
        ConsoleTracker: ConsoleTracker,
        GoogleTracker:  GoogleTracker

      };

      return runtime;
    }
  });
define("trackers", 
  ["trackers/console","trackers/google","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var ConsoleTracker = __dependency1__["default"];
    var GoogleTracker = __dependency2__["default"];

    __exports__.ConsoleTracker = ConsoleTracker;
    __exports__.GoogleTracker = GoogleTracker;
  });
define("trackers/abstract-tracker", 
  ["../vendor/inheritance","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    /* global Ember */
    var Class = __dependency1__["default"];

    function notYetImplemented(signature) {
      Ember.warn("function '" + signature + "' is not yet implemented");
    }

    var AbstractTracker = Class.extend({
      isTracker: function() {
        notYetImplemented('isTracker()');
      },
      getTracker: function() {
        notYetImplemented('getTracker()');
      },
      set: function(key, value) { // jshint ignore:line
        notYetImplemented('set(key, value)');
      },
      send: function(fields) { // jshint ignore:line
        notYetImplemented('send(fields)');
      },
      sendEvent: function(category, action, label, value) { // jshint ignore:line
        notYetImplemented('sendEvent(category, action, label, value)');
      },
      trackPageView: function(path, fields) { // jshint ignore:line
        notYetImplemented('trackPageView(path, fields)');
      }
    });

    __exports__["default"] = AbstractTracker;
  });
define("trackers/console", 
  ["trackers/abstract-tracker","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    /* global Ember */
    var AbstractTracker = __dependency1__["default"];

    function logger(label, params) {
      var message = 'LOG: Ember-Insights: ConsoleTracker.%@(%@)'.fmt(label, params);
      Ember.Logger.log(message);
    }

    __exports__["default"] = {
      factory: function() {
        var Tracker = AbstractTracker.extend({
          getTracker: function() {
            return logger;
          },
          set: function(key, value) {
            logger('set', [key, value]);
          },
          send: function(fieldNameObj) {
            logger('send', [fieldNameObj]);
          },
          sendEvent: function(category, action, label, value) {
            logger('sendEvent', [category, action, label, value]);
          },
          trackPageView: function(path, fieldNameObj) {
            logger('trackPageView', ['pageview', path, fieldNameObj]);
          }
        });

        return new Tracker();
      }
    };
  });
define("trackers/google", 
  ["trackers/abstract-tracker","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var AbstractTracker = __dependency1__["default"];

    function trackerFun(trackerFun, global) {
      global = (global || window);
      if (typeof trackerFun === 'string') {
        trackerFun = global[trackerFun];
      }
      return trackerFun;
    }

    function trackingNamespace(name) {
      return function(action) {
        return (name ? name + '.' : '') + action;
      };
    }

    function setFields(tracker, namespace, fields) {
      for (var propName in fields) {
        tracker(namespace('set'), propName, fields[propName]);
      }
    }

    function _buildFactory(trackerOptions) {
      trackerOptions = trackerOptions || {};

      return function(settings) { // jshint ignore:line
        function tracker() { return trackerFun(trackerOptions.trackerFun || 'ga'); }
        var namespace = trackingNamespace(trackerOptions.name || '');

        // Runtime conveniences as a wrapper for tracker function
        var Tracker = AbstractTracker.extend({
          init: function() {
            if (trackerOptions.fields) {
              setFields(tracker(), namespace, trackerOptions.fields);
            }
          },
          isTracker: function() {
            return (tracker() && typeof tracker() === 'function');
          },
          getTracker: function() {
            return tracker();
          },
          set: function(key, value) {
            tracker()(namespace('set'), key, value);
          },
          send: function(fields) {
            fields = fields || {};
            tracker()(namespace('send'), fields);
          },
          sendEvent: function(category, action, label, value) {
            var fields = {
              hitType:      'event',
              eventCategory: category,
              eventAction:   action,
              eventLabel:    label,
              eventValue:    value
            };
            this.send(fields);
          },
          trackPageView: function(path, fields) {
            fields = fields || {};
            if (!path) {
              var loc = window.location;
              path = loc.hash ? loc.hash.substring(1) : (loc.pathname + loc.search);
            }
            tracker()(namespace('send'), 'pageview', path, fields);
          }
        });

        return new Tracker();
      };
    }

    __exports__["default"] = {
      factory: _buildFactory(),

      with: function(trackerOptions) {
        return _buildFactory(trackerOptions);
      },

      trackerFun: trackerFun,
      trackingNamespace: trackingNamespace,
      setFields: setFields
    };
  });
define("vendor/inheritance", 
  ["exports"],
  function(__exports__) {
    "use strict";
    // jshint ignore: start

    /* Simple JavaScript Inheritance
    * By John Resig http://ejohn.org/
    * MIT Licensed.
    */
    // Inspired by base2 and Prototype
    // (function(){
    var MainClass = (function(){
      var initializing = false, fnTest = /xyz/.test(function(){xyz;}) ? /\b_super\b/ : /.*/;

      // The base Class implementation (does nothing)
      // this.Class = function(){};
      var MainClass = function(){};

      // Create a new Class that inherits from this class
      // Class.extend = function(prop) {
      MainClass.extend = function extendFunction(prop) {
        var _super = this.prototype;

        // Instantiate a base class (but only create the instance,
        // don't run the init constructor)
        initializing = true;
        var prototype = new this();
        initializing = false;

        // Copy the properties over onto the new prototype
        for (var name in prop) {
          // Check if we're overwriting an existing function
          prototype[name] = typeof prop[name] == "function" &&
          typeof _super[name] == "function" && fnTest.test(prop[name]) ?
          (function(name, fn){
            return function() {
              var tmp = this._super;

              // Add a new ._super() method that is the same method
              // but on the super-class
              this._super = _super[name];

              // The method only need to be bound temporarily, so we
              // remove it when we're done executing
              var ret = fn.apply(this, arguments);
              this._super = tmp;

              return ret;
            };
          })(name, prop[name]) :
          prop[name];
        }

        // The dummy class constructor
        function Class() {
          // All construction is actually done in the init method
          if ( !initializing && this.init )
          this.init.apply(this, arguments);
        }

        // Populate our constructed prototype object
        Class.prototype = prototype;

        // Enforce the constructor to be what we expect
        Class.prototype.constructor = Class;

        // And make this class extendable
        // Class.extend = arguments.callee;
        Class.extend = extendFunction;

        return Class;
      };

      return MainClass;
    })();

    __exports__["default"] = MainClass;

    // jshint ignore: end
  });