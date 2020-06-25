'use strict';

const BbPromise = require('bluebird');

module.exports = {
  deployRoute(route) {
    return this.provider.client().then(ow => {
      if (this.options.verbose) {
        this.serverless.cli.log(`Deploying API Gateway Route: ${JSON.stringify(route)}`);
      }
      return async function() {
        var i = 0;
        var error = null;
        for(i = 0; i < 10; i++) {
          try {
            await ow.routes.create(route)
            if (this.options.verbose) {
              this.serverless.cli.log(`Deployed API Gateway Route: ${JSON.stringify(route)}`);
            }
            break;
          } catch(err) {
            this.serverless.cli.log(`Failed to deploy API Gateway Route: ${JSON.stringify(route)}. Retry ${i}...`);
            error = new this.serverless.classes.Error(`Failed to deploy API Gateway route (${route.relpath}) due to error: ${err.message}`);
          }
        }
        if (error != null) {
          throw error;
        }
      }
    });
  },

  // should only do this if config exists....
  updateRoutesConfig (basepath, config) {
    return this.provider.client().then(ow => {
      if (this.options.verbose) {
        this.serverless.cli.log(`Retrieving API Gateway Route Config: ${basepath} ${JSON.stringify(config)}`);
      }
      return ow.routes.get({basepath: basepath })
        .then(response => {
          const route = response.apis[0]
          if (!route) return BbPromise.resolve()

          const swagger = route.value.apidoc
          if (this.options.verbose) {
            this.serverless.cli.log(`Retrieved API Gateway Route Config: ${JSON.stringify(swagger)}`);
          }
          const updated_swagger = this.configRouteSwagger(swagger, config)

          if (this.options.verbose) {
            this.serverless.cli.log(`Updating API Gateway Route Config: ${JSON.stringify(updated_swagger)}`);
          }
          return ow.routes.create({swagger: updated_swagger})
        }).catch(err => {
          throw new this.serverless.classes.Error(
            `Failed to update API Gateway route config (${basepath}) due to error: ${err.message}`
          );
        })
    });
  },

  unbindAllRoutes() {
    return new Promise((resolve) => {
      this.provider.client()
        .then(ow => ow.routes.delete({basepath:`/${this.serverless.service.service}`}))
        .then(resolve)
        .catch(resolve)
    })
  },

  configRouteSwagger(swagger, options) {
    const merged = Object.assign({}, swagger)

    if (!merged.hasOwnProperty('x-ibm-configuration')) {
      merged['x-ibm-configuration'] = {}
    }

    if (options.hasOwnProperty('cors')) {
      merged['x-ibm-configuration'].cors = { enabled: options.cors }
    }

    return merged
  },

  deployOptionalRoutesConfig() {
    const resources = this.serverless.service.resources || {}
    if (resources.hasOwnProperty('apigw')) {
      this.serverless.cli.log('Configuring API Gateway options...');
      const basepath = `/${this.serverless.service.service}`
      return this.updateRoutesConfig(basepath, resources.apigw)
    }

    return BbPromise.resolve();
  },

  deploySequentialRoutes(routes) {
      return BbPromise.mapSeries(routes, r => this.deployRoute(r))
  },

  deployRoutes() {
    const apigw = this.serverless.service.apigw;

    if (!apigw.length) {
      return BbPromise.resolve();
    }

    this.serverless.cli.log('Deploying API Gateway definitions...');
    return this.unbindAllRoutes()
      .then(() => this.deploySequentialRoutes(apigw))
      .then(() => this.deployOptionalRoutesConfig(apigw))
  }
};
