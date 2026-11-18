const { query } = require('../config/db');
const {
    url,
    postValue,
    readProfileForm,
    validateProfileFields
} = require('../../lib/helpers');

// Web Views
exports.showDashboard = async (req, res) => {
    if (req.user.role === 'admin') {
        return res.redirect(url('admin/dashboard'));
    }
    const rows = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const profile = rows[0];
    if (!profile) {
        return res.redirect(url('logout'));
    }
    res.render('dashboard', { pageTitle: 'Alumni dashboard', profile });
};

exports.showDirectory = async (req, res) => {
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
};

exports.showProfile = async (req, res) => {
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

        res.render('profile', { pageTitle: profile.full_name, profile, isAdmin });
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).send('Error loading profile.');
    }
};

exports.showEditProfile = async (req, res) => {
    if (req.user.role !== 'alumni') {
        return res.status(403).send('Only alumni can edit an alumni profile.');
    }
    const rows = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.render('edit-profile', {
        pageTitle: 'Edit profile',
        profile: rows[0] || {},
        errors: []
    });
};

exports.handleEditProfile = async (req, res) => {
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

        if (req.session) {
            req.session.flash = { type: 'success', message: 'Your profile has been updated. Your approval status has not changed.' };
        }
        return res.redirect(url('dashboard'));
    } catch (err) {
        errors.push('Error updating profile: ' + err.message);
        return res.render('edit-profile', {
            pageTitle: 'Edit profile',
            profile: { ...currentProfile, ...values },
            errors
        });
    }
};

// ================= REST API HANDLERS =================
exports.apiList = async (req, res) => {
    try {
        const { search, department, company, year, page = 1, limit = 12 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;

        const where = ["role = 'alumni'", "approval_status = 'approved'"];
        const params = [];

        if (search) {
            where.push("(full_name LIKE ? OR department LIKE ? OR current_company LIKE ? OR job_role LIKE ?)");
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (department) {
            where.push("department = ?");
            params.push(department);
        }
        if (company) {
            where.push("current_company = ?");
            params.push(company);
        }
        if (year) {
            where.push("graduation_year = ?");
            params.push(parseInt(year, 10));
        }

        const condition = where.join(' AND ');
        const countRows = await query(`SELECT COUNT(*) AS total FROM users WHERE ${condition}`, params);
        const total = countRows[0] ? countRows[0].total : 0;

        const alumni = await query(
            `SELECT id, full_name, email, college_name, department, graduation_year, current_company, job_role, current_city, linkedin_url, bio, profile_photo 
             FROM users 
             WHERE ${condition} 
             ORDER BY full_name ASC 
             LIMIT ${limitNum} OFFSET ${offset}`,
            params
        );

        res.json({
            success: true,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum)
            },
            data: alumni
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.apiGetOne = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const rows = await query('SELECT id, full_name, email, phone, college_name, department, graduation_year, current_company, job_role, current_city, linkedin_url, bio, profile_photo, approval_status FROM users WHERE id = ?', [id]);
        const user = rows[0];

        if (!user) {
            return res.status(404).json({ success: false, message: 'Alumni not found.' });
        }

        const isAdmin = req.user && req.user.role === 'admin';
        if (user.approval_status !== 'approved' && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Profile is not public.' });
        }

        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.apiUpdate = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!req.user || (req.user.id !== id && req.user.role !== 'admin')) {
            return res.status(403).json({ success: false, message: 'Unauthorized to edit this profile.' });
        }

        const values = readProfileForm(req.body);
        await query(`
            UPDATE users SET 
                full_name = ?, email = ?, phone = ?, college_name = ?, department = ?,
                graduation_year = ?, current_company = ?, job_role = ?, current_city = ?,
                linkedin_url = ?, bio = ?
            WHERE id = ?
        `, [
            values.full_name, values.email, values.phone || null, values.college_name,
            values.department, parseInt(values.graduation_year, 10), values.current_company || null,
            values.job_role || null, values.current_city || null, values.linkedin_url || null,
            values.bio || null, id
        ]);

        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
