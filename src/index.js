import pathToRegexp from 'path-to-regexp';
import React from 'react';
import { parse } from 'url';
import NextLink from 'next/link';
import NextRouter from 'next/router';

module.exports = opts => new Routes(opts);

class Routes {
  constructor({ Link = NextLink, Router = NextRouter } = {}) {
    this.routes = [];
    this.Link = this.getLink(Link);
    this.Router = this.getRouter(Router);
  }

  add(name, pattern, page, canActivate) {
    let options;
    if (name instanceof Object) {
      options = name;
      name = options.name;
    } else {
      if (name[0] === '/') {
        page = pattern;
        pattern = name;
        name = null;
      }
      options = { name, pattern, page, canActivate };
    }

    if (this.findByName(name)) {
      throw new Error(`Route "${name}" already exists`);
    }

    this.routes.push(new Route(options));
    return this;
  }

  findByName(name) {
    if (name) {
      return this.routes.filter(route => route.name === name)[0];
    }
  }

  match(url) {
    const parsedUrl = parse(url, true);
    const { pathname, query } = parsedUrl;

    return this.routes.reduce(
      (result, route) => {
        if (result.route) return result;
        const params = route.match(pathname);
        if (!params) return result;
        return { ...result, route, params, query: { ...query, ...params } };
      },
      { query, parsedUrl }
    );
  }

  findAndGetUrls(nameOrUrl, params) {
    const route = this.findByName(nameOrUrl);

    if (route) {
      return { route, urls: route.getUrls(params), byName: true };
    } else {
      const { route, query } = this.match(nameOrUrl);
      const href = route ? route.getHref(query) : nameOrUrl;
      const urls = { href, as: nameOrUrl };
      return { route, urls };
    }
  }
  routeGardien(ctx, routeGards, cookies = null) {
    let canAccess = false;
    // let { req, res, route, query } = ctx;
    console.log('------------');
    console.log('routtt , ', ctx.route);
    console.log('quesryy', ctx.query);
    console.log('ccc', cookies);
    console.log('gards', routeGards);
    console.log('------------');

    if (routeGards) {
      try {
        canAccess = routeGards.some(fn => {
          return !fn({ ...ctx, cookies });
        });
      } catch (e) {
        throw e;
      }
    }
    console.log('caaaaaaaaaaaaaaaaaaaaaaaaaaaa : ', !canAccess);
    return !canAccess;
  }

  getRequestHandler(app, customHandler, cookiesFetch = null) {
    const nextHandler = app.getRequestHandler();
    return (req, res) => {
      const { route, query, parsedUrl } = this.match(req.url);

      try {
        if (route) {
          console.log('****************************');
          console.log({ route, query, parsedUrl });
          console.log('****************************');
          const cookies = cookiesFetch(req);
          const isActive = this.routeGardien(
            { req, res, route, query },
            route.canActivate,
            cookies
          );
          if (isActive) {
            if (customHandler) {
              customHandler({ req, res, route, query });
            } else {
              app.render(req, res, route.page, query);
            }
          }
        } else {
          nextHandler(req, res, parsedUrl);
        }
      } catch (err) {
        console.log('get request handler error', err);
      }
    };
  }

  getLink(Link) {
    const LinkRoutes = props => {
      const { route, params, to, ...newProps } = props;
      const nameOrUrl = route || to;

      if (nameOrUrl) {
        Object.assign(newProps, this.findAndGetUrls(nameOrUrl, params).urls);
      }

      return <Link {...newProps} />;
    };
    return LinkRoutes;
  }

  getRouter(Router) {
    const wrap = method => (route, params, options) => {
      const {
        byName,
        urls: { as, href }
      } = this.findAndGetUrls(route, params);
      return Router[method](href, as, byName ? options : params);
    };

    Router.pushRoute = wrap('push');
    Router.replaceRoute = wrap('replace');
    Router.prefetchRoute = wrap('prefetch');
    return Router;
  }
}

class Route {
  constructor({ name, pattern, page = name, canActivate }) {
    if (!name && !page) {
      throw new Error(`Missing page to render for route "${pattern}"`);
    }

    this.name = name;
    this.pattern = pattern || `/${name}`;
    this.page = page.replace(/(^|\/)index$/, '').replace(/^\/?/, '/');
    this.regex = pathToRegexp(this.pattern, (this.keys = []));
    this.keyNames = this.keys.map(key => key.name);
    this.toPath = pathToRegexp.compile(this.pattern);
    this.canActivate = canActivate;
  }

  match(path) {
    const values = this.regex.exec(path);
    if (values) {
      return this.valuesToParams(values.slice(1));
    }
  }

  valuesToParams(values) {
    return values.reduce((params, val, i) => {
      if (val === undefined) return params;
      return Object.assign(params, {
        [this.keys[i].name]: decodeURIComponent(val)
      });
    }, {});
  }

  getHref(params = {}) {
    return `${this.page}?${toQuerystring(params)}`;
  }

  getAs(params = {}) {
    const as = this.toPath(params) || '/';
    const keys = Object.keys(params);
    const qsKeys = keys.filter(key => this.keyNames.indexOf(key) === -1);

    if (!qsKeys.length) return as;

    const qsParams = qsKeys.reduce(
      (qs, key) =>
        Object.assign(qs, {
          [key]: params[key]
        }),
      {}
    );

    return `${as}?${toQuerystring(qsParams)}`;
  }

  getUrls(params) {
    const as = this.getAs(params);
    const href = this.getHref(params);
    return { as, href };
  }
}

const toQuerystring = obj =>
  Object.keys(obj)
    .filter(key => obj[key] !== null && obj[key] !== undefined)
    .map(key => {
      let value = obj[key];

      if (Array.isArray(value)) {
        value = value.join('/');
      }
      return [encodeURIComponent(key), encodeURIComponent(value)].join('=');
    })
    .join('&');
