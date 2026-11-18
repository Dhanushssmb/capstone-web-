const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const env = require('./src/config/env');
const { loadUser } = require('./src/middleware/auth.middleware');
const { initCsrfAndLocals } = require('./src/middleware/csrf.middleware');
const routes = require('./src/routes');

const app = express();

// View engine setup (pointing to frontend/views)
const viewsPath = path.resolve(__dirname, '../frontend/views');
app.set('views', viewsPath);
app.set('view engine', 'ejs');

// Parse incoming request bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Static asset folders (pointing to frontend/assets)
app.use('/assets', express.static(path.resolve(__dirname, '../frontend/assets')));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Cookie session (stateless & Vercel serverless compatible)
app.use(cookieSession({
    name: 'alumni_session',
    keys: [env.APP_KEY],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production'
}));

// Global custom middlewares
app.use(initCsrfAndLocals);
app.use(loadUser);

// Mount application and API routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    }
    res.status(404).send('Page not found.');
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
    res.status(500).send('Internal server error.');
});

module.exports = app;
