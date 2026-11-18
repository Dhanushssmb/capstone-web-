const { query } = require('../config/db');
const { url, postValue } = require('../../lib/helpers');

// Web Views
exports.showDashboard = async (req, res) => {
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
        res.render('admin/dashboard', { pageTitle: 'Admin dashboard', counts });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).send('Error loading dashboard.');
    }
};

exports.showPending = async (req, res) => {
    try {
        const applicants = await query(`
            SELECT id, full_name, email, phone, college_name, department, graduation_year,
                   current_company, job_role, current_city, linkedin_url, bio, profile_photo, created_at
            FROM users 
            WHERE role = 'alumni' AND approval_status = 'pending'
            ORDER BY created_at ASC
        `);
        res.render('admin/pending', { pageTitle: 'Pending applications', applicants });
    } catch (err) {
        console.error('Admin pending error:', err);
        res.status(500).send('Error loading applications.');
    }
};

exports.handleDecision = async (req, res) => {
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
            if (req.session) {
                req.session.flash = { type: 'warning', message: 'That application is no longer pending. The decision was not changed.' };
            }
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

        if (req.session) {
            req.session.flash = { type: 'success', message: `The application was ${decision}.` };
        }
        return res.redirect(url('admin/pending'));
    } catch (err) {
        console.error('Admin action error:', err);
        return res.status(500).send('Error processing application decision.');
    }
};

exports.showAlumniList = async (req, res) => {
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

        res.render('admin/alumni', { pageTitle: 'Alumni and history', people, history });
    } catch (err) {
        console.error('Admin alumni error:', err);
        res.status(500).send('Error loading alumni history.');
    }
};

// ================= REST API HANDLERS =================
exports.apiMetrics = async (req, res) => {
    try {
        const rows = await query(`
            SELECT 
                COUNT(*) AS total,
                SUM(approval_status = 'approved') AS approved,
                SUM(approval_status = 'pending') AS pending,
                SUM(approval_status = 'rejected') AS rejected
            FROM users WHERE role = 'alumni'
        `);
        res.json({ success: true, metrics: rows[0] || { total: 0, approved: 0, pending: 0, rejected: 0 } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.apiPending = async (req, res) => {
    try {
        const applicants = await query(`
            SELECT id, full_name, email, phone, college_name, department, graduation_year,
                   current_company, job_role, current_city, linkedin_url, bio, created_at
            FROM users 
            WHERE role = 'alumni' AND approval_status = 'pending'
            ORDER BY created_at ASC
        `);
        res.json({ success: true, count: applicants.length, applicants });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.apiDecision = async (req, res) => {
    const { userId, decision, reason } = req.body;
    if (!userId || !['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ success: false, message: 'Invalid decision payload.' });
    }

    try {
        const rows = await query("SELECT id, approval_status FROM users WHERE id = ? AND role = 'alumni'", [userId]);
        const applicant = rows[0];

        if (!applicant || applicant.approval_status !== 'pending') {
            return res.status(409).json({ success: false, message: 'Application is no longer pending.' });
        }

        const rejectionReason = decision === 'rejected' ? (reason || null) : null;
        await query(
            'UPDATE users SET approval_status = ?, rejection_reason = ?, decision_at = CURRENT_TIMESTAMP WHERE id = ?',
            [decision, rejectionReason, userId]
        );

        await query(
            'INSERT INTO approval_logs (user_id, admin_id, decision, reason) VALUES (?, ?, ?, ?)',
            [userId, req.user ? req.user.id : 1, decision, rejectionReason]
        );

        res.json({ success: true, message: `Application ${decision} successfully.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
