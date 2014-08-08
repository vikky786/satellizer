/**
 * ngAuth 0.0.1
 * (c) 2014 Sahat Yalkabov <sahat@me.com>
 * License: MIT
 */

(function(window, angular, undefined) {
  'use strict';

  angular.module('Satellizer', [])
    .service('Utils', Utils)
    .factory('OAuth2', Oauth2)
    .factory('OAuth1', Oauth1)
    .factory('Popup', Popup)
    .provider('$auth', $auth)
    .config(httpInterceptor)
    .run(onRun);

  var config = {
    logoutRedirect: '/',
    loginRedirect: '/',
    loginUrl: '/auth/login',
    signupUrl: '/auth/signup',
    signupRedirect: '/login',
    loginRoute: '/login',
    signupRoute: '/signup',
    user: 'currentUser'
  };

  var providers = {
    google: {
      url: '/auth/google',
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/auth',
      redirectUri: window.location.origin,
      scope: 'openid profile email',
      requiredUrlParams: ['scope'],
      optionalUrlParams: ['display'],
      display: 'popup',
      type: 'oauth2',
      popupOptions: {
        width: 452,
        height: 633
      }
    },
    facebook: {
      url: '/auth/facebook',
      authorizationEndpoint: 'https://www.facebook.com/dialog/oauth',
      redirectUri: window.location.origin,
      scope: 'email',
      requiredUrlParams: ['display'],
      display: 'popup',
      type: 'oauth2',
      popupOptions: {
        width: 481,
        height: 269
      }
    },
    linkedin: {
      url: '/auth/linkedin',
      authorizationEndpoint: 'https://www.linkedin.com/uas/oauth2/authorization',
      redirectUri: window.location.origin,
      requiredUrlParams: ['state'],
      state: 'STATE',
      type: 'oauth2'
    },
    twitter: {
      url: '/auth/twitter',
      authorizationEndpoint: 'https://api.twitter.com/oauth/authenticate',
      type: 'oauth1'
    }
  };


  function $auth() {

    this.config = config;

    this.setProvider = function(params) {
      angular.extend(providers[params.name], params);
    };

    this.addProvider = function(params) {
      providers[params.name] = {};
      angular.extend(providers[params.name], params);
    };

    this.$get = function(OAuth1, OAuth2, $http, $location, $rootScope, $q, $window) {

      var $auth = {};

      $auth.authenticate = function(providerName) {
        var deferred = $q.defer();

        var provider = (providers[providerName].type === 'oauth1') ? OAuth1 : OAuth2;

        provider.open().then(function(token) {
          var payload = JSON.parse($window.atob(token.split('.')[1]));
          $window.localStorage.jwtToken = token;
          $rootScope[config.user] = payload.user;
          $location.path(config.loginRedirect);
          deferred.resolve();
        });

        return deferred.promise;
      };

      $auth.login = function(user) {
        if (!user) {
          throw new Error('You must provide a user object.');
        }

        var deferred = $q.defer();

        $http.post(config.loginUrl, user)
          .success(function(data) {
            var payload = JSON.parse($window.atob(data.token.split('.')[1]));
            $rootScope[config.user] = payload.user;
            $location.path(config.loginRedirect);
            $window.localStorage.jwtToken = data.token;
            deferred.resolve(payload.user);
          })
          .error(function(error) {
            deferred.reject(error);
          });

        return deferred.promise;
      };

      $auth.signup = function(user) {
        $http.post(config.signupUrl, user).then(function() {
          $location.path(config.signupRedirect);
        });
      };

      $auth.logout = function() {
        delete $rootScope[config.user];
        delete $window.localStorage.jwtToken;
        $location.path(config.logoutRedirect);
      };

      $auth.isAuthenticated = function() {
        return Boolean($rootScope.currentUser);
      };

      return $auth;
    };

  }


  function Popup($q, $interval, $window) {
    var popupWindow = null;
    var polling = null;

    var popup = {};

    popup.open = function(url, options) {
      var deferred = $q.defer();
      var optionsString = popup.stringifyOptions(popup.prepareOptions(options || {}));

      popupWindow = $window.open(url, 'ngAuth', optionsString);
      popupWindow.focus();

      this.postMessageHandler(deferred);
      this.pollPopup(deferred);

      return deferred.promise;
    };

    popup.pollPopup = function(deferred) {
      polling = $interval(function() {
        if (popupWindow.closed) {
          $interval.cancel(polling);
          deferred.reject('Popup was closed by the user.');
        }
      }.bind(this), 35);
    };

    popup.postMessageHandler = function(deferred) {
      $window.addEventListener('message', function(event) {
        if (event.origin === $window.location.origin) {
          deferred.resolve(event.data);
        }
      }, false);
    };

    popup.prepareOptions = function(options) {
      var width = options.width || 500;
      var height = options.height || 500;
      return angular.extend({
        left: ((window.screen.width / 2) - (width / 2)),
        top: ((window.screen.height / 2) - (height / 2)),
        width: width,
        height: height
      }, options);
    };

    popup.stringifyOptions = function(options) {
      var optionsStrings = [];
      for (var key in options) {
        if (options.hasOwnProperty(key)) {
          var value;
          switch (options[key]) {
            case true:
              value = '1';
              break;
            case false:
              value = '0';
              break;
            default:
              value = options[key];
          }
          optionsStrings.push(
              key + '=' + value
          );
        }
      }
      return optionsStrings.join(',');
    };

    return popup;
  }

  function Oauth1($q, $http, Popup) {
    var OAuth1 = function(config) {
      angular.extend(this, config);
      this.name = config.name;
      this.url = config.url;
      this.authorizationEndpoint = config.authorizationEndpoint;
      this.popupOptions = config.popupOptions;
    };

    OAuth1.prototype.tokenRequest = function() {
      return $http.post(this.url);
    };

    OAuth1.prototype.open = function() {
      var deferred = $q.defer();

      var popup = new Popup();
      popup.open(this.url).then(function(oauthData) {
        this.exchangeForToken(oauthData).then(function(response) {
          deferred.resolve(response.data);
        });
      }.bind(this));

      return deferred.promise;
    };

    OAuth1.prototype.exchangeForToken = function(oauthData) {
      return $http.get(this.url, { params: oauthData });
    };
  }

  function Oauth2($q, $http, Utils, Popup) {
    var name = config.name;
    var url = config.url;
    var clientId = config.clientId;
    var scope = config.scope;
    var authorizationEndpoint = config.authorizationEndpoint;
    var redirectUri = config.redirectUri;
    var responseType = 'code';
    var defaultUrlParams = ['response_type', 'client_id', 'redirect_uri'];
    var requiredUrlParams = config.requiredUrlParams;
    var optionalUrlParams = config.optionalUrlParams;
    var popupOptions = config.popupOptions;

    var oauth2 = {};

    oauth2.open = function() {
      var deferred = $q.defer();
      var url = oauth2.buildUrl();

      Popup.open(url, popupOptions).then(function(oauthData) {
        oauth2.exchangeForToken(oauthData).then(function(response) {
          deferred.resolve(response.data);
        });
      });

      return deferred.promise;
    };

    oauth2.exchangeForToken = function(oauthData) {
      return $http.post(url, {
        code: oauthData.code,
        clientId: clientId,
        redirectUri: redirectUri
      });
    };

    oauth2.buildUrl = function() {
      var baseUrl = authorizationEndpoint;
      var qs = oauth2.buildQueryString();
      return [baseUrl, qs].join('?');
    };

    oauth2.buildQueryString = function() {
      var obj = this;
      var keyValuePairs = [];

      angular.forEach(this.defaultUrlParams, function(paramName) {
        var camelizedName = Utils.camelCase(paramName);
        var paramValue = obj[camelizedName];
        keyValuePairs.push([paramName, encodeURIComponent(paramValue)]);
      });

      angular.forEach(this.requiredUrlParams, function(paramName) {
        var camelizedName = Utils.camelCase(paramName);
        var paramValue = obj[camelizedName];
        keyValuePairs.push([paramName, encodeURIComponent(paramValue)]);
      });

      angular.forEach(this.optionalUrlParams, function(paramName) {
        var camelizedName = Utils.camelCase(paramName);
        var paramValue = obj[camelizedName];
        keyValuePairs.push([paramName, encodeURIComponent(paramValue)]);
      });

      return keyValuePairs.map(function(pair) {
        return pair.join('=');
      }).join('&');
    };

    return oauth2;
  }

  function httpInterceptor($httpProvider) {
    $httpProvider.interceptors.push(function($q, $window, $location) {
      return {
        request: function(config) {
          if ($window.localStorage.jwtToken) {
            config.headers.Authorization = 'Bearer ' + $window.localStorage.jwtToken;
          }
          return config;
        },
        responseError: function(response) {
          if (response.status === 401 || response.status === 403) {
            $location.path('/login');
          }
          return $q.reject(response);
        }
      };
    });
  }

  function onRun($rootScope, $window, $location, Utils) {
    var token = $window.localStorage.jwtToken;
    if (token) {
      var payload = JSON.parse($window.atob(token.split('.')[1]));
      $rootScope.currentUser = payload.user;
    }

    var params = $window.location.search.substring(1);
    var qs = Utils.parseQueryString(params);
    if ($window.opener && $window.opener.location.origin === $window.location.origin) {
      if (qs.oauth_token && qs.oauth_verifier) {
        $window.opener.postMessage({ oauth_token: qs.oauth_token, oauth_verifier: qs.oauth_verifier }, '*');
      } else if (qs.code) {
        $window.opener.postMessage({ code: qs.code }, '*');
      }
      $window.close();
    }

    $rootScope.$on('$routeChangeStart', function(event, current) {
      if ($rootScope[config.user] &&
        (current.originalPath === '/login' || current.originalPath === '/signup')) {
        $location.path('/');
      }
      if (current.authenticated && !$rootScope[config.user]) {
        $location.path('/login');
      }
    });
  }

  function Utils() {
    this.camelCase = function(name) {
      return name.replace(/([\:\-\_]+(.))/g, function(_, separator, letter, offset) {
        return offset ? letter.toUpperCase() : letter;
      });
    };
    this.parseQueryString = function(keyValue) {
      var obj = { }, key, value;
      angular.forEach((keyValue || '').split('&'), function(keyValue) {
        if (keyValue) {
          value = keyValue.split('=');
          key = decodeURIComponent(value[0]);
          obj[key] = angular.isDefined(value[1]) ? decodeURIComponent(value[1]) : true;
        }
      });
      return obj;
    };
  }


})(window, window.angular);
