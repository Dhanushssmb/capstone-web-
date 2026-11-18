const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const env = require('../config/env');
const {
    url,
    postValue,
    readProfileForm,
    validateProfileFields
} = require('../../lib/helpers');

function getHashes(email, ip) {
    const ipHash = crypto.createHmac('sha256', env.APP_KEY).update(String(ip)).digest('hex');
    const emailHash = crypto.createHmac('sha256', env.APP_KEY).update(email.toLowerCase()).digest('hex');
    return { ipHash, emailHash };
}

async function checkRateLimit(emailHash, ipHash) {
    const attempts = await query(
        'SELECT attempts, last_attempt FROM login_attempts WHERE email_hash = ? AND ip_hash = ?',
        [emailHash, ipHash]
    );
    const record = attempts[0];
    const withinWindow = record && (Date.now() - new Date(record.last_attempt).getTime() < 900000); // 15 mins
    return { record, withinWindow, throttled: Boolean(withinWindow && record.attempts >= 5) };
}

async function recordFailedAttempt(emailHash, ipHash, withinWindow) {
    if (withinWindow) {
        await query(
            'UPDATE login_attempts SET attempts = attempts + 1, last_attempt = CURRENT_TIMESTAMP WHERE email_hash = ? AND ip_hash = ?',
            [emailHash, ipHash]
        );
    } else {
        await query(
            `INSERT INTO login_attempts (email_hash, ip_hash, attempts, last_attempt) 
             VALUES (?, ?, 1, CURRENT_TIMESTAMP)`,
            [emailHash, ipHash]
        );
    }
}

async function clearFailedAttempts(emailHash, ipHash) {
    await query('DELETE FROM login_attempts WHERE email_hash = ? AND ip_hash = ?', [emailHash, ipHash]);
}

// Web Views
exports.showLogin = (req, res) => {
    if (req.user) {
        return res.redirect(url(req.user.role === 'admin' ? 'admin/dashboard' : 'dashboard'));
    }
    res.render('login', { pageTitle: 'Log in', error: null, email: '' });
};

exports.handleLogin = async (req, res) => {
    const email = postValue(req.body, 'email', 190).toLowerCase();
    const password = req.body.password || '';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const { ipHash, emailHash } = getHashes(email, ip);

    try {
        const { withinWindow, throttled } = await checkRateLimit(emailHash, ipHash);
        if (throttled) {
            return res.render('login', {
                pageTitle: 'Log in',
                error: 'Too many unsuccessful attempts. Please wait 15 minutes before trying again.',
                email
            });
        }

        const users = await query('SELECT id, password_hash, role FROM users WHERE email = ?', [email]);
        const account = users[0];

        if (account && typeof password === 'string' && bcrypt.compareSync(password, account.password_hash)) {
            req.session.userId = account.id;
            await clearFailedAttempts(emailHash, ipHash);
            return res.redirect(url(account.role === 'admin' ? 'admin/dashboard' : 'dashboard'));
        }

        await recordFailedAttempt(emailHash, ipHash, withinWindow);
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
};

exports.handleLogout = (req, res) => {
    req.session = null;
    res.redirect(url('/'));
};

exports.showRegister = (req, res) => {
    if (req.user) {
        return res.redirect(url('dashboard'));
    }
    res.render('register', {
        pageTitle: 'Join the network',
        errors: [],
        values: {}
    });
};

exports.handleRegister = async (req, res) => {
    const values = readProfileForm(req.body);
    const errors = validateProfileFields(values);
    const password = req.body.password || '';

    if (!password || password.length < 10 || password.length > 72) {
        errors.push('Choose a password between 10 and 72 characters long.');
    }

    if (errors.length > 0) {
        return res.render('register', { pageTitle: 'Join the network', errors, values });
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

        if (req.session) {
            req.session.flash = { type: 'success', message: 'Your application was submitted. You can log in to check its approval status.' };
        }
        return res.redirect(url('login'));
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' || err.message.includes('Duplicate entry')) {
            errors.push('An account already exists for that email address.');
        } else {
            console.error('Registration error:', err);
            errors.push('An error occurred during submission: ' + err.message);
        }
        return res.render('register', { pageTitle: 'Join the network', errors, values });
    }
};

exports.showSetupAdmin = async (req, res) => {
    try {
        const rows = await query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
        if (rows[0] && rows[0].count > 0) {
            return res.status(404).send('Administrator setup is already complete.');
        }
        res.render('setup-admin', { pageTitle: 'Create administrator', errors: [], values: {} });
    } catch (err) {
        res.status(500).send('Database error: ' + err.message);
    }
};

exports.handleSetupAdmin = async (req, res) => {
    const countRows = await query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    if (countRows[0] && countRows[0].count > 0) {
        return res.status(404).send('Administrator setup is already complete.');
    }

    const name = postValue(req.body, 'full_name', 120);
    const email = postValue(req.body, 'email', 190).toLowerCase();
    const password = req.body.password || '';
    const setupKey = req.body.setup_key || '';

    const errors = [];
    if (setupKey !== env.SETUP_KEY) {
        errors.push('The one-time setup key is incorrect.');
    }
    if (!name || name.length > 120) {
        errors.push('Enter a name up to 120 characters.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Enter a valid email address.');
    }
    if (!password || password.length < 12 || password.length > 72) {
        errors.push('Choose a password between 12 and 72 characters long.');
    }

    if (errors.length > 0) {
        return res.render('setup-admin', { pageTitle: 'Create administrator', errors, values: { full_name: name, email } });
    }

    try {
        const passwordHash = bcrypt.hashSync(password, 10);
        await query(`
            INSERT INTO users (full_name, email, password_hash, role, approval_status, college_name, department, graduation_year)
            VALUES (?, ?, ?, 'admin', 'approved', 'Administration', 'Administration', ?)
        `, [name, email, passwordHash, new Date().getFullYear()]);

        if (req.session) {
            req.session.flash = { type: 'success', message: 'Administrator account created. Sign in with the details you just entered.' };
        }
        return res.redirect(url('login'));
    } catch (err) {
        errors.push('Error creating admin: ' + err.message);
        return res.render('setup-admin', { pageTitle: 'Create administrator', errors, values: { full_name: name, email } });
    }
};

// ================= REST API HANDLERS =================
exports.apiLogin = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const { ipHash, emailHash } = getHashes(email, ip);

    try {
        const { withinWindow, throttled } = await checkRateLimit(emailHash, ipHash);
        if (throttled) {
            return res.status(429).json({ success: false, message: 'Too many attempts. Please wait 15 minutes.' });
        }

        const users = await query('SELECT id, full_name, email, password_hash, role, approval_status FROM users WHERE email = ?', [email.toLowerCase()]);
        const account = users[0];

        if (account && bcrypt.compareSync(password, account.password_hash)) {
            req.session.userId = account.id;
            await clearFailedAttempts(emailHash, ipHash);
            const { password_hash, ...safeUser } = account;
            return res.json({ success: true, user: safeUser });
        }

        await recordFailedAttempt(emailHash, ipHash, withinWindow);
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.apiRegister = async (req, res) => {
    const values = readProfileForm(req.body);
    const errors = validateProfileFields(values);
    const password = req.body.password || '';

    if (!password || password.length < 10) {
        errors.push('Password must be at least 10 characters.');
    }
    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    try {
        const passwordHash = bcrypt.hashSync(password, 10);
        const result = await query(`
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
            values.linkedin_url || null, values.bio || null, null
        ]);

        return res.status(201).json({
            success: true,
            message: 'Application submitted successfully. Awaiting administrator review.',
            userId: result.insertId
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' || err.message.includes('Duplicate entry')) {
            return res.status(409).json({ success: false, message: 'An account already exists for that email address.' });
        }
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.apiLogout = (req, res) => {
    req.session = null;
    res.json({ success: true, message: 'Logged out successfully.' });
};

exports.apiMe = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    res.json({ success: true, user: req.user });
};
