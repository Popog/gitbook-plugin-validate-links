var fetch = require('node-fetch');
var url = require('url');

var externals = [];
var internals = [];

var hasErrors;

function processLink(ctx, link) {
    // If it's external with no scheme, use the default
    if (link.startsWith('//'))
        link = ctx.config.defaultScheme + link;

    // Parse the link
    link = url.parse(url.resolve(ctx.pagePath, link));

    // Deal with external links
    if (link.protocol !== null) {
        if (ctx.config.remote === 'disabled')
            return;

        var logger = ctx.log[ctx.config.remote];
        externals.push(fetch(link.href).catch(
            function(err) {
                logger.ln('link to "' + link.href +'" on page "' + ctx.pagePath + '" could not be resolved (' + err.message + ')');
                hasErrors = hasErrors || ctx.config.remote === 'error';
            }
        ));
        return;
    }

    if (ctx.config.local === 'disabled')
        return;

    // Internal links only need a path for validation
    link = link.pathname;

    // Strip leading slash
    if (link.startsWith('/'))
        link = link.substring(1);

    // Resolve local page links
    if (ctx.book.getPageByPath(link) !== undefined)
        return;

    // Resolve local file links
    var logger = ctx.log[ctx.config.local];
    internals.push(function(output) {
        Promise.resolve(output.hasFile(link)).then(function(v) {
            if (v) return;
            logger.ln('link to "' + link + '" on page "' + ctx.pagePath + '" could not be resolved');
            hasErrors = hasErrors || ctx.config.local === 'error';
        })
    });
}

module.exports = {
    hooks: {
        'page': function(page) {
            var findLinks = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"/g;

            for (var link; (link = findLinks.exec(page.content)) !== null;) {
                processLink({
                    pagePath: page.path,
                    config: this.config.values.pluginsConfig['validate-links'],
                    book: this.book,
                    log: this.log,
                }, link[1]);
            }

            return page;
        },
        'finish': function() {
            var output = this.output;

            return Promise.all([
              Promise.all(externals),
              Promise.all(internals.map(function(f) { return f(output); }))
            ]).then(function(errors) {
              if (hasErrors) throw 'Link resolution contained errors';
            });
        }
    },
};
