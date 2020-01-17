'use strict';
const debug = require('debug')('plugin:router');
var cm = require('volos-cache-memory');
const url = require('url');
var request = require('request');

module.exports.init = function (config, logger, stats) {
	
	var cachename = 'router'+Math.floor(Math.random() * 100) + 1; //to ensure there is a unique cache per worker
	var lookupEndpoint = config['lookupEndpoint'];
	var lookupEndpointApiKey = config['lookupEndpointApiKey'];
	var lookupCache = config['lookupCache'] || 60000; //default is 1 min
	var disable = config['lookupDisabled'] || false;
	var cache = cm.create(cachename, { ttl: lookupCache });
	var lookupRequest = (lookupEndpointApiKey) ? request.defaults({headers: {apikey: lookupEndpointApiKey}}) : request;

	cache.setEncoding('utf8');
	
	return {
		onrequest: function(req, res, next) {
			debug ('plugin onrequest');
			var proxyName = res.proxy.name;
			var proxyRev = res.proxy.revision;
			var key = proxyName + '_' + proxyRev;
			var target = res.proxy.url;
			var queryparams = url.parse(req.url).search || '';
			
			debug ('key: ' + key + ' and target ' + target);
			
			if (disable) {
				debug('plugin diabled');
				next();
			} else {
				try {
					cache.get(key, function(err, value) {
						if (value) {
							//change endpoint
							var endpoint = JSON.parse(value);
							debug("found endpoint in cache" + endpoint.endpoint);
							var parts = url.parse(endpoint.endpoint);
							req.targetHostname = parts.host;
							req.targetPort = parts.port;
							req.targetPath = parts.pathname + queryparams;
							//add HTTP headers
							if (endpoint.httpheaders) {
								debug("found " + endpoint.httpheaders.length + " HTTP header(s) in cache");
								for (var i = 0; i < endpoint.httpheaders.length; i++) {
    							var httpheader = endpoint.httpheaders[i];
    							req.headers[httpheader.name] = httpheader.value;
								}
							}
							next();
						} else {
							debug("endpoint not found in cache, invoking lookupEndpoint " + lookupEndpoint);
							lookupRequest(lookupEndpoint+"?proxyName="+proxyName+"&proxyRev="+proxyRev, function(error, response, body){
								if (!err) {
									var endpoint = JSON.parse(body);
									if ((endpoint.endpoint) || (endpoint.httpheaders)) {
										cache.set(key, body);
										if (endpoint.endpoint) {
											var parts = url.parse(endpoint.endpoint, true);
											if (parts.hostname.includes(":")) {
												debug("hostname: " + parts.hostname);
												var result = parts.hostname.split(":");
												req.targetHostname = result[0];
												req.targetPort = result[1];
												debug("target hostname: " + result[0] + " target port: " + result[1]);
											} else {
												req.targetHostname = parts.hostname;
												req.targetPort = parts.port;
												debug("target hostname: " + parts.hostname + " target port: " + parts.port);
											}
											req.targetPath = parts.pathname + queryparams;
										} else {
											debug("endpoint not found, using proxy endpoint");
											endpoint.endpoint = target;
										}
										//add HTTP headers
										if (endpoint.httpheaders) {
											debug("found " + endpoint.httpheaders.length + " HTTP header(s)");
											for (var i = 0; i < endpoint.httpheaders.length; i++) {
											var httpheader = endpoint.httpheaders[i];
											req.headers[httpheader.name] = httpheader.value;
											}
										}
										cache.set(key, JSON.stringify(endpoint));
									}
									else {
										debug("endpoint not found, using proxy endpoint");
										cache.set(key, "{\"endpoint\": \""+target+"\"}");
									}
								} else {
									debug(err);
									debug("endpoint lookup failed, using proxy endpoint");
									cache.set(key, "{\"endpoint\": \""+target+"\"}");
								}
								next();
							});			    	
						}
					});	
				} catch (err) {
					debug(err);
					next();
				}				
			}			
		}
	}	
}
