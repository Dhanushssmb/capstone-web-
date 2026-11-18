const crypto = require('crypto');
const { url, profileImageUrl, getBaseUrl } = require('../../lib/helpers');

exports.initCsrfAndLocals = (req, res, next) => {
    if (!req.session) {
        return next();
    }
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    res.locals.csrfToken = req.session.csrfToken;
    res.locals.url = url;
    res.locals.profileImageUrl = profileImageUrl;
    res.locals.baseUrl = getBaseUrl();

    // Consume flash message
    res.locals.flashMessage = req.session.flash || null;
    delete req.session.flash;

    next();
};

exports.verifyCsrf = (req, res, next) => {
    // Skip CSRF verification for REST API endpoints
    if (req.path.startsWith('/api/')) {
        return next();
    }

    const submitted = (req.body && (req.body._csrf || req.body.csrf_token)) || req.query._csrf;
    const sessionToken = req.session && req.session.csrfToken;

    if (!submitted || !sessionToken || submitted !== sessionToken) {
        return res.status(403).send('The form expired or could not be verified. Please go back, refresh, and try again.');
    }
    next();
};
