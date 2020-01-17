# Microgateway router plugin  

## Overview
Build on original router plugin that was expanded by adding target HTTP headers capability and some other minor tweaks. Microgateway (MG) exposes proxies deployed on Apigee Edge (that match edgemicro_* proxy name pattern). Microgateway reads the proxyname, basePath and target endpoint from the proxy bundle. Typically proxies have different target endpoints for each environment. In Apigee Edge, the different environments are handled via Target Servers or Route Rules or even some custom code. Since Microgateway does not have access to Target Server or Route Rules, this plugin will help solve this problem. Additionally, you can specify HTTP headers associated with proxy's target, which comes handy when you need to pass some static information to the target (like basic authentication information, API key etc.).

## Scenario
The proxy deployed in Apigee Edge is`edgemicro_sample`. The basePath is `/sample` and the target endpoint for dev is `http://api.sample1.com`, the target endpoint for test is `http://api.sample2.com`. We'll see how the plugin will help in this situation.

## Copy the plugin
Find the MG installation folder. 
`cd <MG_INSTALL>\plugins`
`git clone https://github.com/oxch/router.git`

## Enable the plugin
```
  plugins:
    sequence:
      - oauth
      - router
```

## Configuration Options
* ttl: Set time to live for cache.
* lookupEndpoint: The endpoint where MG can find target points and HTTP headers for a proxy.
* lookupEndpointApiKey: optional API key (passed as apikey HTTP header) that can be used to secure lookupEndpoint.
* lookupDisabled: To enable or disable the plugin.

### Sample Configuration
```
router:
  lookupEndpoint: http://xxxxx/edgemicro-router/endpoint
  lookupEndpointApiKey: ReplaceWithOptionalAPIKeyRequiredToAccesslookupEndpoint
```

## How does it work?
* Step 1: The call comes to MG. If the basePath matches a proxy, then proceed to step 2.
* Step 2: Check if the proxy name and revision exists in local MG worker memory cache. if not, proceed to step 3. If yes, goto step 6.
* Step 3: Invoke the `lookupEndpoint` url using optional apikey (`lookupEndpointApiKey`) security header and pass proxy name and revision as parameters. The JSON response contains an environment specific target endpoint and HTTP headers. If new target endpoint was not returned for some reason (not included in response or due to exception) - original proxy target endpoint will be used instead.
* Step 4: Store the target endpoint and HTTP headers JSON in local cache. 
* Step 5: Route the request to the new endpoint and apply HTTP headers.
* Step 6: Use endpoint and HTTP headers JSON values from the cache to route the request to the target endpoint stored in cache applying HTTP headers.

## Endpoint Lookup Implementation
There are a variety of ways to implement the endpoint lookup. You can use external services like Eureka or Consul. In this example, an Apigee Edge proxy is used as an example that stores endpoint and HTTP headers information in a Apigee Edge KVMs. The format of the KVM (environment scoped) is `proxyname_revision` maps to `targetendpoint` and HTTP headers JSON array respectively. The KVM that stores HTTP headers is recommeded to be encrypted as it could contain sensitive information.  For example, for MG proxy edgemicro_sample, revision 5: 
* in `targets` KVM proxy key `edgemicro_sample_5` maps to `http://sample1.test.com` target
* in `headers` KVM proxy key `edgemicro_sample_5` maps to `{"name":"Authentication", "value":"Basic XXXXXXXXXXXXXXXXXXXX"}`
In this implementation entries in both KVMs are optional as plugin is designed to deafult to proxy original target. Please note that if you only have entry in `headers` KVM but not `targets` - the HTTP headers will be still applied when making a call to default proxy original target. Here is an example of lookup JSON response:
{
  "endpoint":"http://sample1.test.com"
  "httpheaders":
  [
    {"name":"Authentication", "value":"Basic XXXXXXXXXXXXXXXXXXXX"},
    {"name":"CustomHeaderXYZ", "value":"Some Value Meanigful For The Target"}
  ]
}

The API proxy implementation is included in the repo.

### Create KVM
The name of the KVM used by the proxy to store targets is `microgateway-router`. For HTTP headers KVM `microgateway-router-headers` is used. Here is the link to Apigee documentation on how to create KVM: https://docs.apigee.com/management/apis/post/organizations/%7Borg_name%7D/environments/%7Benv_name%7D/keyvaluemaps


