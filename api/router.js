// NUTbits Management API - Lightweight router
// Maps method + path to handler functions

export class Router {
    #routes = [];

    get(path, handler)    { this.#routes.push({ method: 'GET', path, handler }); return this; }
    post(path, handler)   { this.#routes.push({ method: 'POST', path, handler }); return this; }
    patch(path, handler)  { this.#routes.push({ method: 'PATCH', path, handler }); return this; }
    delete(path, handler) { this.#routes.push({ method: 'DELETE', path, handler }); return this; }

    match(method, url) {
        var pathname = url.split('?')[0];
        var query = Object.fromEntries(new URLSearchParams(url.split('?')[1] || ''));

        for (var route of this.#routes) {
            if (route.method !== method) continue;

            // Simple param matching: /connections/:id -> { id: 'abc' }
            var params = matchPath(route.path, pathname);
            if (params !== null) {
                return { handler: route.handler, params, query };
            }
        }
        return null;
    }
}

function matchPath(pattern, pathname) {
    var patternParts = pattern.split('/').filter(Boolean);
    var pathParts = pathname.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) return null;

    var params = {};
    for (var i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
        } else if (patternParts[i] !== pathParts[i]) {
            return null;
        }
    }
    return params;
}
