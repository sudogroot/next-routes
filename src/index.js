import pathToRegexp from 'path-to-regexp';
import React, { Component, Children } from 'react';
import { resolve, format, parse } from 'url';
import NextLink from 'next/link';
import NextRouter, { _rewriteUrlForNextExport } from 'next/router';

import PropTypes from 'prop-types';
import exact from 'prop-types-exact';

import Cookies from 'js-cookie';

const universalCookieFetch = (req = null) => {
  return req ? req.cookies : Cookies.get();
};

function warn(message) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message);
  }
}

function execOnce(fn) {
  let used = false;
  return (...args) => {
    if (!used) {
      used = true;
      fn.apply(this, args);
    }
  };
}

function getLocationOrigin() {
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port ? ':' + port : ''}`;
}

class MyLink extends Component {
  constructor(props, ...rest) {
    super(props, ...rest);
    this.linkClicked = this.linkClicked.bind(this);
    this.formatUrls(props);
  }

  static propTypes = exact({
    href: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
    as: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    prefetch: PropTypes.bool,
    replace: PropTypes.bool,
    shallow: PropTypes.bool,
    passHref: PropTypes.bool,
    gard: PropTypes.func,
    scroll: PropTypes.bool,
    children: PropTypes.oneOfType([
      PropTypes.element,
      (props, propName) => {
        const value = props[propName];

        if (typeof value === 'string') {
          warnLink(
            `Warning: You're using a string directly inside <Link>. This usage has been deprecated. Please add an <a> tag as child of <Link>`
          );
        }

        return null;
      }
    ]).isRequired
  });

  componentWillReceiveProps(nextProps) {
    this.formatUrls(nextProps);
  }

  linkClicked(e) {
    if (
      e.currentTarget.nodeName === 'A' &&
      (e.metaKey || e.ctrlKey || e.shiftKey || (e.nativeEvent && e.nativeEvent.which === 2))
    ) {
      // ignore click for new tab / new window behavior
      return;
    }

    const { shallow } = this.props;
    let { href, as } = this;

    if (!isLocal(href)) {
      // ignore click if it's outside our scope
      return;
    }

    const { gard } = this.props;
    if (gard) {
      try {
        const isValid = gard();
        if (!isValid) {
          console.error('Link  gard is not valid : ', isValid);
          return;
        }
      } catch (err) {
        console.error('err gard cheking ');
      }
    }

    const { pathname } = window.location;
    href = resolve(pathname, href);
    as = as ? resolve(pathname, as) : href;

    e.preventDefault();

    //  avoid scroll for urls with anchor refs
    let { scroll } = this.props;
    if (scroll == null) {
      scroll = as.indexOf('#') < 0;
    }

    // replace state instead of push if prop is present
    const { replace } = this.props;
    const changeMethod = replace ? 'replace' : 'push';

    // straight up redirect
    NextRouter[changeMethod](href, as, { shallow })
      .then(success => {
        if (!success) return;
        if (scroll) {
          window.scrollTo(0, 0);
          document.body.focus();
        }
      })
      .catch(err => {
        if (this.props.onError) this.props.onError(err);
      });
  }

  prefetch() {
    if (!this.props.prefetch) return;
    if (typeof window === 'undefined') return;

    // Prefetch the JSON page if asked (only in the client)
    const { pathname } = window.location;
    const href = resolve(pathname, this.href);
    NextRouter.prefetch(href);
  }

  componentDidMount() {
    this.prefetch();
  }

  componentDidUpdate(prevProps) {
    if (JSON.stringify(this.props.href) !== JSON.stringify(prevProps.href)) {
      this.prefetch();
    }
  }

  // We accept both 'href' and 'as' as objects which we can pass to `url.format`.
  // We'll handle it here.
  formatUrls(props) {
    this.href = props.href && typeof props.href === 'object' ? format(props.href) : props.href;
    this.as = props.as && typeof props.as === 'object' ? format(props.as) : props.as;
  }

  render() {
    let { children } = this.props;
    let { href, as } = this;
    // Deprecated. Warning shown by propType check. If the childen provided is a string (<Link>example</Link>) we wrap it in an <a> tag
    if (typeof children === 'string') {
      children = <a>{children}</a>;
    }

    // This will return the first child, if multiple are provided it will throw an error
    const child = Children.only(children);
    const props = {
      onClick: e => {
        if (child.props && typeof child.props.onClick === 'function') {
          child.props.onClick(e);
        }
        if (!e.defaultPrevented) {
          this.linkClicked(e);
        }
      }
    };

    // If child is an <a> tag and doesn't have a href attribute, or if the 'passHref' property is
    // defined, we specify the current 'href', so that repetition is not needed by the user
    if (this.props.passHref || (child.type === 'a' && !('href' in child.props))) {
      props.href = as || href;
    }

    // Add the ending slash to the paths. So, we can serve the
    // "<page>/index.html" directly.
    if (props.href && typeof __NEXT_DATA__ !== 'undefined' && __NEXT_DATA__.nextExport) {
      props.href = _rewriteUrlForNextExport(props.href);
    }

    return React.cloneElement(child, props);
  }
}

function isLocal(href) {
  const url = parse(href, false, true);
  const origin = parse(getLocationOrigin(), false, true);

  return !url.host || (url.protocol === origin.protocol && url.host === origin.host);
}

const warnLink = execOnce(warn);

module.exports = opts => new Routes(opts);

class Routes {
  constructor({ Link = MyLink, Router = NextRouter } = {}) {
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
        console.error('routte gardien error : ', e);
        throw e;
      }
    }
    console.log('caaaaaaaaaaaaaaaaaaaaaaaaaaaa : ', !canAccess);
    return !canAccess;
  }

  getRequestHandler(app, customHandler) {
    const nextHandler = app.getRequestHandler();

    return (req, res) => {
      const { route, query, parsedUrl } = this.match(req.url);

      try {
        if (route) {
          console.log('****************************');
          console.log({ route, query, parsedUrl });
          console.log('****************************');
          const cookies = universalCookieFetch(req);
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
        console.error('get request handler error', err);
      }
    };
  }

  getLink(Link) {
    const LinkRoutes = props => {
      const { route, params, to, ...newProps } = props;
      const nameOrUrl = route || to;
      // const isActive = this.routeGardien({}, route.canActivate);
      var objFindAndGetUrls = null;
      if (nameOrUrl) {
        objFindAndGetUrls = this.findAndGetUrls(nameOrUrl, params);
        console.log('hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh', objFindAndGetUrls);
        Object.assign(newProps, objFindAndGetUrls.urls);
      }

      return (
        <Link
          gard={() => {
            return this.routeGardien(
              { ...props, ...objFindAndGetUrls },
              objFindAndGetUrls.route.canActivate,
              universalCookieFetch()
            );
          }}
          {...newProps}
        />
      );
    };
    return LinkRoutes;
  }

  getRouter(Router) {
    const wrap = method => (route, params, options) => {
      const objFindAndGetUrls = this.findAndGetUrls(route, params);
      const {
        byName,
        urls: { as, href }
      } = objFindAndGetUrls;
      const isValid = this.routeGardien(
        { route, params, options, ...objFindAndGetUrls },
        objFindAndGetUrls.route.canActivate,
        universalCookieFetch()
      );
      if (isValid) {
        return Router[method](href, as, byName ? options : params);
      }
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
