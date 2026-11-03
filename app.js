const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const multer = require('multer');
const { getPool, query, initDb } = require('./config/db');
const {
    url,
    getBaseUrl,
    profileImageUrl,
    postValue,
    readProfileForm,
    validateProfileFields
} = require('./lib/helpers');

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Parse request bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Static files
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Cookie session (stateless & Vercel serverless compatible)
const appKey = process.env.APP_KEY || 'alumni-connect-super-secure-key-32-chars-min';
app.use(cookieSession({
    name: 'alumni_session',
    keys: [appKey],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
}));

// Multer in-memory storage for profile photo uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Upload a valid JPEG, PNG, GIF, or WebP image.'));
        }
    }
});

// Flash message helper
function setFlash(req, type, message) {
    if (req.session) {
        req.session.flash = { type, message };
    }
}

// Global template variables & CSRF middleware
app.use(async (req, res, next) => {
    // Session CSRF token
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

    // Load current user from session
    res.locals.currentUser = null;
    req.user = null;

    if (req.session.userId) {
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
});

// CSRF verification middleware for state-changing methods
function requireValidCsrf(req, res, next) {
    const submitted = (req.body && (req.body._csrf || req.body.csrf_token)) || req.query._csrf;
    const sessionToken = req.session && req.session.csrfToken;

    if (!submitted || !sessionToken || submitted !== sessionToken) {
        return res.status(403).send('The form expired or could not be verified. Please go back, refresh, and try again.');
    }
    next();
}

// Route guards
function requireLogin(req, res, next) {
    if (!req.user) {
        setFlash(req, 'warning', 'Please log in to continue.');
        return res.redirect(url('login'));
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user) {
        setFlash(req, 'warning', 'Please log in to continue.');
        return res.redirect(url('login'));
    }
    if (req.user.role !== 'admin') {
        return res.status(403).send('You do not have permission to access this page.');
    }
    next();
}

function requireApprovedAlumni(req, res, next) {
    if (!req.user) {
        setFlash(req, 'warning', 'Please log in to continue.');
        return res.redirect(url('login'));
    }
    if (req.user.role !== 'alumni' || req.user.approval_status !== 'approved') {
        setFlash(req, 'warning', 'This feature is available after your alumni application is approved.');
        return res.redirect(url('dashboard'));
    }
    next();
}

// ================= ROUTES =================

// Home / Landing Page
app.get(['/', '/index.php'], async (req, res, next) => {
    try {
        const rows = await query(`
            SELECT 
                COUNT(*) AS alumni,
                COUNT(DISTINCT department) AS departments,
                COUNT(DISTINCT NULLIF(current_company, '')) AS companies
            FROM users 
            WHERE role = 'alumni' AND approval_status = 'approved'
        `);
        const stats = rows[0] || { alumni: 0, departments: 0, companies: 0 };
        res.render('index', { pageTitle: 'Alumni Network', stats });
    } catch (err) {
        console.error('Home query error:', err.message);
        res.render('index', { pageTitle: 'Alumni Network', stats: { alumni: 0, departments: 0, companies: 0 } });
    }
});

// Login Page
app.get(['/login', '/login.php'], (req, res) => {
    if (req.user) {
        return res.redirect(url(req.user.role === 'admin' ? 'admin/dashboard' : 'dashboard'));
    }
    res.render('login', { pageTitle: 'Log in', error: null, email: '' });
});

app.post(['/login', '/login.php'], requireValidCsrf, async (req, res) => {
    const email = postValue(req.body, 'email', 190).toLowerCase();
    const password = req.body.password || '';

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ipHash = crypto.createHmac('sha256', appKey).update(String(ip)).digest('hex');
    const emailHash = crypto.createHmac('sha256', appKey).update(email).digest('hex');

    try {
        const attempts = await query(
            'SELECT attempts, last_attempt FROM login_attempts WHERE email_hash = ? AND ip_hash = ?',
            [emailHash, ipHash]
        );
        const record = attempts[0];
        const withinWindow = record && (Date.now() - new Date(record.last_attempt).getTime() < 900000);

        if (withinWindow && record.attempts >= 5) {
            return res.render('login', {
                pageTitle: 'Log in',
                error: 'Too many unsuccessful attempts. Please wait 15 minutes before trying again.',
                email
            });
        }

        const users = await query(
            'SELECT id, password_hash, role FROM users WHERE email = ? LIMIT 1',
            [email]
        );
        const account = users[0];

        if (account && typeof password === 'string' && bcrypt.compareSync(password, account.password_hash)) {
            req.session.userId = account.id;
            // Clear login attempts
            await query('DELETE FROM login_attempts WHERE email_hash = ? AND ip_hash = ?', [emailHash, ipHash]);
            return res.redirect(url(account.role === 'admin' ? 'admin/dashboard' : 'dashboard'));
        }

        // Record failed attempt
        if (withinWindow) {
            await query(
                'UPDATE login_attempts SET attempts = attempts + 1, last_attempt = CURRENT_TIMESTAMP WHERE email_hash = ? AND ip_hash = ?',
                [emailHash, ipHash]
            );
        } else {
            await query(
                `INSERT INTO login_attempts (email_hash, ip_hash, attempts, last_attempt) 
                 VALUES (?, ?, 1, CURRENT_TIMESTAMP) 
                 ON DUPLICATE KEY UPDATE attempts = 1, last_attempt = CURRENT_TIMESTAMP`,
                [emailHash, ipHash]
            );
        }

        return res.render('login', {
            pageTitle: 'Log in',
            error: 'Email or password is incorrect.',
            email
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.render('login', {
            pageTitle: 'Log in',
            error: 'An error occurred during log in. Please try again.',
            email
        });
    }
});

// Logout
app.post(['/logout', '/logout.php'], requireValidCsrf, (req, res) => {
    req.session = null;
    res.redirect(url('/'));
});

// Register Page
app.get(['/register', '/register.php'], (req, res) => {
    if (req.user) {
        return res.redirect(url('dashboard'));
    }
    res.render('register', {
        pageTitle: 'Join the network',
        errors: [],
        values: {}
    });
});

app.post(['/register', '/register.php'], (req, res, next) => {
    upload.single('profile_photo')(req, res, (err) => {
        if (err) {
            const values = readProfileForm(req.body);
            return res.render('register', {
                pageTitle: 'Join the network',
                errors: [err.message],
                values
            });
        }
        next();
    });
}, requireValidCsrf, async (req, res) => {
    const values = readProfileForm(req.body);
    const errors = validateProfileFields(values);
    const password = req.body.password || '';

    if (!password || password.length < 10 || password.length > 72) {
        errors.push('Choose a password between 10 and 72 characters long.');
    }

    if (errors.length > 0) {
        return res.render('register', {
            pageTitle: 'Join the network',
            errors,
            values
        });
    }

    let photoData = null;
    if (req.file) {
        photoData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    try {
        const passwordHash = bcrypt.hashSync(password, 10);
        await query(`
            INSERT INTO users (
                full_name, email, password_hash, role, approval_status,
                phone, college_name, department, graduation_year,
                current_company, job_role, current_city, linkedin_url,
                bio, profile_photo
            ) VALUES (?, ?, ?, 'alumni', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            values.full_name, values.email, passwordHash,
            values.phone || null, values.college_name, values.department,
            parseInt(values.graduation_year, 10), values.current_company || null,
            values.job_role || null, values.current_city || null,
            values.linkedin_url || null, values.bio || null, photoData
        ]);

        setFlash(req, 'success', 'Your application was submitted. You can log in to check its approval status.');
        return res.redirect(url('login'));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' || err.message.includes('Duplicate entry')) {
            errors.push('An account already exists for that email address.');
        } else {
            console.error('Registration error:', err);
            errors.push('An error occurred during submission: ' + err.message);
        }
        return res.render('register', {
            pageTitle: 'Join the network',
            errors,
            values
        });
    }
});

// Alumni Dashboard
app.get(['/dashboard', '/dashboard.php'], requireLogin, async (req, res) => {
    if (req.user.role === 'admin') {
        return res.redirect(url('admin/dashboard'));
    }
    const rows = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const profile = rows[0];
    if (!profile) {
        return res.redirect(url('logout'));
    }
    res.render('dashboard', {
        pageTitle: 'Alumni dashboard',
        profile
    });
});

// Alumni Directory
app.get(['/directory', '/directory.php'], async (req, res) => {
    const filters = {
        name: postValue(req.query, 'name', 100),
        department: postValue(req.query, 'department', 120),
        company: postValue(req.query, 'company', 160),
        job_role: postValue(req.query, 'job_role', 160),
        location: postValue(req.query, 'location', 120),
        year: req.query.year ? parseInt(req.query.year, 10) : 0
    };

    const currentYear = new Date().getFullYear();
    const yearInput = req.query.year ? String(req.query.year).trim() : '';
    const yearError = yearInput !== '' && (isNaN(filters.year) || filters.year < 1950 || filters.year > currentYear);

    const where = ["role = 'alumni'", "approval_status = 'approved'"];
    const params = [];

    const fieldMap = {
        name: 'full_name',
        department: 'department',
        company: 'current_company',
        job_role: 'job_role',
        location: 'current_city'
    };

    for (const [key, col] of Object.entries(fieldMap)) {
        if (filters[key]) {
            where.push(`${col} LIKE ?`);
            params.push(`%${filters[key]}%`);
        }
    }

    if (!isNaN(filters.year) && filters.year >= 1950 && filters.year <= currentYear) {
        where.push('graduation_year = ?');
        params.push(filters.year);
    }

    const condition = where.join(' AND ');

    try {
        const countRows = await query(`SELECT COUNT(*) AS total FROM users WHERE ${condition}`, params);
        const total = countRows[0] ? countRows[0].total : 0;
        const perPage = 12;
        const pages = Math.max(1, Math.ceil(total / perPage));
        let page = parseInt(req.query.page, 10);
        page = !isNaN(page) && page > 0 ? Math.min(page, pages) : 1;
        const offset = (page - 1) * perPage;

        const alumniRows = await query(
            `SELECT id, full_name, department, graduation_year, current_company, job_role, current_city, profile_photo 
             FROM users 
             WHERE ${condition} 
             ORDER BY full_name ASC 
             LIMIT ${perPage} OFFSET ${offset}`,
            params
        );

        res.render('directory', {
            pageTitle: 'Alumni directory',
            filters,
            yearError,
            total,
            pages,
            page,
            alumni: alumniRows
        });
    } catch (err) {
        console.error('Directory error:', err);
        res.render('directory', {
            pageTitle: 'Alumni directory',
            filters,
            yearError: false,
            total: 0,
            pages: 1,
            page: 1,
            alumni: []
        });
    }
});

// Single Profile View
app.get(['/profile', '/profile.php', '/profile/:id'], async (req, res) => {
    const id = parseInt(req.params.id || req.query.id, 10);
    if (!id || isNaN(id) || id < 1) {
        return res.status(404).send('Profile not found.');
    }

    try {
        const rows = await query(`
            SELECT id, full_name, email, phone, college_name, department, graduation_year,
                   current_company, job_role, current_city, linkedin_url, bio, profile_photo,
                   approval_status, role
            FROM users 
            WHERE id = ? AND role = 'alumni'
        `, [id]);
        const profile = rows[0];

        const isAdmin = req.user && req.user.role === 'admin';
        if (!profile || (profile.approval_status !== 'approved' && !isAdmin)) {
            return res.status(404).send('Profile not found.');
        }

        res.render('profile', {
            pageTitle: profile.full_name,
            profile,
            isAdmin
        });
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).send('Error loading profile.');
    }
});

// Edit Profile Page
app.get(['/edit-profile', '/edit-profile.php'], requireLogin, async (req, res) => {
    if (req.user.role !== 'alumni') {
        return res.status(403).send('Only alumni can edit an alumni profile.');
    }

    const rows = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const profile = rows[0];
    res.render('edit-profile', {
        pageTitle: 'Edit profile',
        profile: profile || {},
        errors: []
    });
});

app.post(['/edit-profile', '/edit-profile.php'], requireLogin, (req, res, next) => {
    if (req.user.role !== 'alumni') {
        return res.status(403).send('Only alumni can edit an alumni profile.');
    }
    upload.single('profile_photo')(req, res, (err) => {
        if (err) {
            return res.render('edit-profile', {
                pageTitle: 'Edit profile',
                profile: req.body,
                errors: [err.message]
            });
        }
        next();
    });
}, requireValidCsrf, async (req, res) => {
    const values = readProfileForm(req.body);
    const errors = validateProfileFields(values);

    const rows = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const currentProfile = rows[0];

    if (errors.length > 0) {
        return res.render('edit-profile', {
            pageTitle: 'Edit profile',
            profile: { ...currentProfile, ...values },
            errors
        });
    }

    let photoData = currentProfile.profile_photo;
    if (req.file) {
        photoData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    try {
        await query(`
            UPDATE users SET 
                full_name = ?, email = ?, phone = ?, college_name = ?, department = ?,
                graduation_year = ?, current_company = ?, job_role = ?, current_city = ?,
                linkedin_url = ?, bio = ?, profile_photo = ?
            WHERE id = ? AND role = 'alumni'
        `, [
            values.full_name, values.email, values.phone || null, values.college_name,
            values.department, parseInt(values.graduation_year, 10), values.current_company || null,
            values.job_role || null, values.current_city || null, values.linkedin_url || null,
            values.bio || null, photoData, req.user.id
        ]);

        setFlash(req, 'success', 'Your profile has been updated. Your approval status has not changed.');
        return res.redirect(url('dashboard'));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' || err.message.includes('Duplicate entry')) {
            errors.push('That email address is already associated with another account.');
        } else {
            console.error('Update profile error:', err);
            errors.push('Error updating profile: ' + err.message);
        }
        return res.render('edit-profile', {
            pageTitle: 'Edit profile',
            profile: { ...currentProfile, ...values },
            errors
        });
    }
});

// Setup Initial Admin
app.get(['/setup-admin', '/setup-admin.php'], async (req, res) => {
    try {
        const rows = await query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
        if (rows[0] && rows[0].count > 0) {
            return res.status(404).send('Administrator setup is already complete.');
        }
        res.render('setup-admin', {
            pageTitle: 'Create administrator',
            errors: [],
            values: {}
        });
    } catch (err) {
        res.status(500).send('Database error: ' + err.message);
    }
});

app.post(['/setup-admin', '/setup-admin.php'], requireValidCsrf, async (req, res) => {
    const countRows = await query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    if (countRows[0] && countRows[0].count > 0) {
        return res.status(404).send('Administrator setup is already complete.');
    }

    const name = postValue(req.body, 'full_name', 120);
    const email = postValue(req.body, 'email', 190).toLowerCase();
    const password = req.body.password || '';
    const setupKey = req.body.setup_key || '';
    const expectedSetupKey = process.env.SETUP_KEY || 'c961636875b541f02aad7cc48845ea52e9245e5965769d495b0dde26b6020a2c';

    const errors = [];
    if (setupKey !== expectedSetupKey) {
        errors.push('The one-time setup key is incorrect.');
    }
    if (!name || name.length > 120) {
        errors.push('Enter a name up to 120 characters.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email) || email.length > 190) {
        errors.push('Enter a valid email address.');
    }
    if (!password || password.length < 12 || password.length > 72) {
        errors.push('Choose a password between 12 and 72 characters long.');
    }

    if (errors.length > 0) {
        return res.render('setup-admin', {
            pageTitle: 'Create administrator',
            errors,
            values: { full_name: name, email }
        });
    }

    try {
        const passwordHash = bcrypt.hashSync(password, 10);
        await query(`
            INSERT INTO users (full_name, email, password_hash, role, approval_status, college_name, department, graduation_year)
            VALUES (?, ?, ?, 'admin', 'approved', 'Administration', 'Administration', ?)
        `, [name, email, passwordHash, new Date().getFullYear()]);

        setFlash(req, 'success', 'Administrator account created. Sign in with the details you just entered.');
        return res.redirect(url('login'));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' || err.message.includes('Duplicate entry')) {
            errors.push('That email address is already in use.');
        } else {
            errors.push('Error creating admin: ' + err.message);
        }
        return res.render('setup-admin', {
            pageTitle: 'Create administrator',
            errors,
            values: { full_name: name, email }
        });
    }
});

// Admin Dashboard
app.get(['/admin/dashboard', '/admin/dashboard.php'], requireAdmin, async (req, res) => {
    try {
        const rows = await query(`
            SELECT 
                COUNT(*) AS total,
                SUM(approval_status = 'approved') AS approved,
                SUM(approval_status = 'pending') AS pending,
                SUM(approval_status = 'rejected') AS rejected
            FROM users WHERE role = 'alumni'
        `);
        const counts = rows[0] || { total: 0, approved: 0, pending: 0, rejected: 0 };
        res.render('admin/dashboard', {
            pageTitle: 'Admin dashboard',
            counts
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).send('Error loading dashboard.');
    }
});

// Admin Pending Applications
app.get(['/admin/pending', '/admin/pending.php'], requireAdmin, async (req, res) => {
    try {
        const applicants = await query(`
            SELECT id, full_name, email, phone, college_name, department, graduation_year,
                   current_company, job_role, current_city, linkedin_url, bio, profile_photo, created_at
            FROM users 
            WHERE role = 'alumni' AND approval_status = 'pending'
            ORDER BY created_at ASC
        `);
        res.render('admin/pending', {
            pageTitle: 'Pending applications',
            applicants
        });
    } catch (err) {
        console.error('Admin pending error:', err);
        res.status(500).send('Error loading applications.');
    }
});

// Admin Action (Approve / Reject)
app.post(['/admin/action', '/admin/action.php'], requireAdmin, requireValidCsrf, async (req, res) => {
    const userId = parseInt(req.body.user_id, 10);
    const decision = postValue(req.body, 'decision', 10);
    const reason = postValue(req.body, 'rejection_reason', 500);

    if (!userId || !['approved', 'rejected'].includes(decision)) {
        return res.status(400).send('Invalid application decision.');
    }

    try {
        const rows = await query("SELECT id, approval_status FROM users WHERE id = ? AND role = 'alumni'", [userId]);
        const applicant = rows[0];

        if (!applicant || applicant.approval_status !== 'pending') {
            setFlash(req, 'warning', 'That application is no longer pending. The decision was not changed.');
            return res.redirect(url('admin/pending'));
        }

        const rejectionReason = decision === 'rejected' ? (reason || null) : null;
        await query(
            'UPDATE users SET approval_status = ?, rejection_reason = ?, decision_at = CURRENT_TIMESTAMP WHERE id = ?',
            [decision, rejectionReason, userId]
        );

        await query(
            'INSERT INTO approval_logs (user_id, admin_id, decision, reason) VALUES (?, ?, ?, ?)',
            [userId, req.user.id, decision, rejectionReason]
        );

        setFlash(req, 'success', `The application was ${decision}.`);
        return res.redirect(url('admin/pending'));
    } catch (err) {
        console.error('Admin action error:', err);
        return res.status(500).send('Error processing application decision.');
    }
});

// Admin Alumni and History
app.get(['/admin/alumni', '/admin/alumni.php'], requireAdmin, async (req, res) => {
    try {
        const people = await query(`
            SELECT id, full_name, email, department, graduation_year, approval_status, created_at, decision_at
            FROM users 
            WHERE role = 'alumni'
            ORDER BY created_at DESC
        `);

        const history = await query(`
            SELECT l.decision, l.reason, l.created_at, u.full_name AS alumni_name, a.full_name AS admin_name
            FROM approval_logs l
            JOIN users u ON u.id = l.user_id
            JOIN users a ON a.id = l.admin_id
            ORDER BY l.created_at DESC
            LIMIT 100
        `);

        res.render('admin/alumni', {
            pageTitle: 'Alumni and history',
            people,
            history
        });
    } catch (err) {
        console.error('Admin alumni error:', err);
        res.status(500).send('Error loading alumni history.');
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found.');
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send('Internal server error.');
});

module.exports = app;

