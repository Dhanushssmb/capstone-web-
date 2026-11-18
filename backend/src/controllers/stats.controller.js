const { query } = require('../config/db');

exports.showHome = async (req, res) => {
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
};

exports.apiStats = async (req, res) => {
    try {
        const rows = await query(`
            SELECT 
                COUNT(*) AS alumni,
                COUNT(DISTINCT department) AS departments,
                COUNT(DISTINCT NULLIF(current_company, '')) AS companies
            FROM users 
            WHERE role = 'alumni' AND approval_status = 'approved'
        `);
        res.json({ success: true, stats: rows[0] || { alumni: 0, departments: 0, companies: 0 } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
