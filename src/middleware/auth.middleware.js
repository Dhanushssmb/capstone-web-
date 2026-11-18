const { query } = require('../config/db');
const { url } = require('../../lib/helpers');

// Load user from session on each request
exports.loadUser = async (req, res, next) => {
    res.locals.currentUser = null;
    req.user = null;

    if (req.session && req.session.userId) {
        try {
            const rows = await query(
                'SELECT id, full_name, email, role, approval_status FROM users WHERE id = ?',
                [req.session.userId]
            );
            if (rows && rows.length > 0) {
                req.user = rows[0];
                res.locals.currentUser = rows[0];
            } else {
                delete req.session.userId;
            }
        } catch (err) {
            console.error('Error fetching current user:', err.message);
        }
    }
    next();
};

// Web Guard: Require logged-in user
exports.requireLogin = (req, res, next) => {
    if (!req.user) {
        if (req.session) {
            req.session.flash = { type: 'warning', message: 'Please log in to continue.' };
        }
        return res.redirect(url('login'));
    }
    next();
};

// Web Guard: Require admin user
exports.requireAdmin = (req, res, next) => {
    if (!req.user) {
        if (req.session) {
            req.session.flash = { type: 'warning', message: 'Please log in to continue.' };
        }
        return res.redirect(url('login'));
    }
    if (req.user.role !== 'admin') {
        return res.status(403).send('You do not have permission to access this page.');
    }
    next();
};

// Web Guard: Require approved alumni
exports.requireApprovedAlumni = (req, res, next) => {
    if (!req.user) {
        if (req.session) {
            req.session.flash = { type: 'warning', message: 'Please log in to continue.' };
        }
        return res.redirect(url('login'));
    }
    if (req.user.role !== 'alumni' || req.user.approval_status !== 'approved') {
        if (req.session) {
            req.session.flash = { type: 'warning', message: 'This feature is available after your alumni application is approved.' };
        }
        return res.redirect(url('dashboard'));
    }
    next();
};

// API Guard: Require auth (returns JSON)
exports.apiRequireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    next();
};

// API Guard: Require admin (returns JSON)
exports.apiRequireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Administrator privilege required.' });
    }
    next();
};
