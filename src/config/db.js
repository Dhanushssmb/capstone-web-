const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('./env');

let pool = null;
let useFallback = false;
let fallbackFile = path.join(process.cwd(), 'data', 'db.json');

// Initialize in-memory / file fallback store
function getFallbackData() {
    try {
        if (!fs.existsSync(path.dirname(fallbackFile))) {
            fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
        }
        if (fs.existsSync(fallbackFile)) {
            const raw = fs.readFileSync(fallbackFile, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('Error reading fallback db:', e.message);
    }
    return {
        users: [],
        approval_logs: [],
        login_attempts: []
    };
}

function saveFallbackData(data) {
    try {
        if (!fs.existsSync(path.dirname(fallbackFile))) {
            fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
        }
        fs.writeFileSync(fallbackFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error saving fallback db:', e.message);
    }
}

function getDbConfig() {
    if (env.DB.URL) {
        const config = {
            uri: env.DB.URL,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            charset: 'utf8mb4'
        };
        if (env.DB.SSL || env.DB.URL.includes('ssl=')) {
            config.ssl = { rejectUnauthorized: false };
        }
        return config;
    }

    const config = {
        host: env.DB.HOST,
        port: env.DB.PORT,
        user: env.DB.USER,
        password: env.DB.PASSWORD,
        database: env.DB.NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4'
    };

    if (env.DB.SSL) {
        config.ssl = { rejectUnauthorized: false };
    }

    return config;
}

function getPool() {
    if (!pool && !useFallback) {
        const config = getDbConfig();
        if (config.uri) {
            pool = mysql.createPool(config.uri);
        } else {
            pool = mysql.createPool(config);
        }
    }
    return pool;
}

// Fallback query emulator for standard CRUD operations
async function fallbackQuery(sql, params = []) {
    const data = getFallbackData();
    const cleanSql = sql.trim().replace(/\s+/g, ' ');

    // 1. SELECT COUNT(*) AS alumni, COUNT(DISTINCT department)...
    if (/SELECT COUNT\(\*\) AS alumni/i.test(cleanSql)) {
        const approved = data.users.filter(u => u.role === 'alumni' && u.approval_status === 'approved');
        const depts = new Set(approved.map(u => u.department).filter(Boolean));
        const comps = new Set(approved.map(u => u.current_company).filter(Boolean));
        return [{ alumni: approved.length, departments: depts.size, companies: comps.size }];
    }

    // 2. Admin dashboard counts: SELECT COUNT(*) AS total, SUM(...)
    if (/SUM\(approval_status = 'approved'\)/i.test(cleanSql)) {
        const alumni = data.users.filter(u => u.role === 'alumni');
        const approved = alumni.filter(u => u.approval_status === 'approved').length;
        const pending = alumni.filter(u => u.approval_status === 'pending').length;
        const rejected = alumni.filter(u => u.approval_status === 'rejected').length;
        return [{ total: alumni.length, approved, pending, rejected }];
    }

    // 3. Admin check: SELECT COUNT(*) AS count FROM users WHERE role = 'admin'
    if (/SELECT COUNT\(\*\) AS count FROM users WHERE role = 'admin'/i.test(cleanSql)) {
        const adminCount = data.users.filter(u => u.role === 'admin').length;
        return [{ count: adminCount }];
    }

    // 4. Single user by ID: SELECT ... FROM users WHERE id = ?
    if (/FROM users WHERE id = \?/i.test(cleanSql)) {
        const id = parseInt(params[0], 10);
        const user = data.users.find(u => u.id === id);
        return user ? [user] : [];
    }

    // 5. User by ID for session: SELECT id, full_name, email, role, approval_status FROM users WHERE id = ?
    if (/SELECT id, full_name, email, role, approval_status FROM users WHERE id = \?/i.test(cleanSql)) {
        const id = parseInt(params[0], 10);
        const user = data.users.find(u => u.id === id);
        return user ? [{
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            approval_status: user.approval_status
        }] : [];
    }

    // 6. User by Email: SELECT id, password_hash, role FROM users WHERE email = ?
    if (/SELECT id, password_hash, role FROM users WHERE email = \?/i.test(cleanSql)) {
        const email = String(params[0]).toLowerCase();
        const user = data.users.find(u => u.email.toLowerCase() === email);
        return user ? [{ id: user.id, password_hash: user.password_hash, role: user.role }] : [];
    }

    // 7. Single profile: SELECT ... FROM users WHERE id = ? AND role = 'alumni'
    if (/FROM users WHERE id = \? AND role = 'alumni'/i.test(cleanSql)) {
        const id = parseInt(params[0], 10);
        const user = data.users.find(u => u.id === id && u.role === 'alumni');
        return user ? [user] : [];
    }

    // 8. Pending applicants: SELECT ... FROM users WHERE role = 'alumni' AND approval_status = 'pending'
    if (/FROM users WHERE role = 'alumni' AND approval_status = 'pending'/i.test(cleanSql)) {
        const list = data.users
            .filter(u => u.role === 'alumni' && u.approval_status === 'pending')
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        return list;
    }

    // 9. All alumni list: SELECT ... FROM users WHERE role = 'alumni' ORDER BY created_at DESC
    if (/FROM users WHERE role = 'alumni' ORDER BY created_at DESC/i.test(cleanSql)) {
        const list = data.users
            .filter(u => u.role === 'alumni')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return list;
    }

    // 10. Approval logs: SELECT ... FROM approval_logs l JOIN users ...
    if (/FROM approval_logs/i.test(cleanSql)) {
        const logs = data.approval_logs.map(log => {
            const alumni = data.users.find(u => u.id === log.user_id);
            const admin = data.users.find(u => u.id === log.admin_id);
            return {
                ...log,
                alumni_name: alumni ? alumni.full_name : 'Unknown',
                admin_name: admin ? admin.full_name : 'Admin'
            };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
        return logs;
    }

    // 11. Directory Search: SELECT COUNT(*) AS total FROM users WHERE ...
    if (/SELECT COUNT\(\*\) AS total FROM users/i.test(cleanSql)) {
        let filtered = data.users.filter(u => u.role === 'alumni' && u.approval_status === 'approved');
        return [{ total: filtered.length }];
    }

    // 12. Directory Items: SELECT id, full_name, department... FROM users WHERE ...
    if (/SELECT id, full_name, department/i.test(cleanSql) && /FROM users/i.test(cleanSql)) {
        let list = data.users.filter(u => u.role === 'alumni' && u.approval_status === 'approved');
        list.sort((a, b) => a.full_name.localeCompare(b.full_name));
        return list.slice(0, 12);
    }

    // 13. Login attempts check
    if (/SELECT attempts, last_attempt FROM login_attempts/i.test(cleanSql)) {
        const [emailHash, ipHash] = params;
        const record = data.login_attempts.find(r => r.email_hash === emailHash && r.ip_hash === ipHash);
        return record ? [record] : [];
    }

    // 14. Clear login attempts
    if (/DELETE FROM login_attempts/i.test(cleanSql)) {
        const [emailHash, ipHash] = params;
        data.login_attempts = data.login_attempts.filter(r => !(r.email_hash === emailHash && r.ip_hash === ipHash));
        saveFallbackData(data);
        return { affectedRows: 1 };
    }

    // 15. Update login attempts
    if (/UPDATE login_attempts/i.test(cleanSql)) {
        const [emailHash, ipHash] = params;
        const record = data.login_attempts.find(r => r.email_hash === emailHash && r.ip_hash === ipHash);
        if (record) {
            record.attempts += 1;
            record.last_attempt = new Date().toISOString();
        }
        saveFallbackData(data);
        return { affectedRows: 1 };
    }

    // 16. Insert login attempts
    if (/INSERT INTO login_attempts/i.test(cleanSql)) {
        const [emailHash, ipHash] = params;
        const existing = data.login_attempts.find(r => r.email_hash === emailHash && r.ip_hash === ipHash);
        if (existing) {
            existing.attempts = 1;
            existing.last_attempt = new Date().toISOString();
        } else {
            data.login_attempts.push({ email_hash: emailHash, ip_hash: ipHash, attempts: 1, last_attempt: new Date().toISOString() });
        }
        saveFallbackData(data);
        return { affectedRows: 1 };
    }

    // 17. INSERT INTO users
    if (/INSERT INTO users/i.test(cleanSql)) {
        const newId = data.users.length > 0 ? Math.max(...data.users.map(u => u.id)) + 1 : 1;
        let newUser = {};
        if (params.length === 5) {
            // Admin insert: full_name, email, password_hash, graduation_year
            newUser = {
                id: newId,
                full_name: params[0],
                email: params[1],
                password_hash: params[2],
                role: 'admin',
                approval_status: 'approved',
                college_name: 'Administration',
                department: 'Administration',
                graduation_year: params[3] || new Date().getFullYear(),
                created_at: new Date().toISOString()
            };
        } else {
            // Alumni insert
            newUser = {
                id: newId,
                full_name: params[0],
                email: params[1],
                password_hash: params[2],
                role: 'alumni',
                approval_status: 'pending',
                phone: params[3],
                college_name: params[4],
                department: params[5],
                graduation_year: params[6],
                current_company: params[7],
                job_role: params[8],
                current_city: params[9],
                linkedin_url: params[10],
                bio: params[11],
                profile_photo: params[12],
                created_at: new Date().toISOString()
            };
        }
        // Check duplicate email
        if (data.users.some(u => u.email.toLowerCase() === newUser.email.toLowerCase())) {
            const err = new Error('Duplicate entry');
            err.code = 'ER_DUP_ENTRY';
            throw err;
        }
        data.users.push(newUser);
        saveFallbackData(data);
        return { insertId: newId, affectedRows: 1 };
    }

    // 18. UPDATE users
    if (/UPDATE users SET/i.test(cleanSql)) {
        if (/approval_status = \?/i.test(cleanSql)) {
            // Admin decision: decision, rejectionReason, userId
            const [decision, reason, userId] = params;
            const user = data.users.find(u => u.id === parseInt(userId, 10));
            if (user) {
                user.approval_status = decision;
                user.rejection_reason = reason;
                user.decision_at = new Date().toISOString();
            }
        } else {
            // Profile update
            const userId = parseInt(params[params.length - 1], 10);
            const user = data.users.find(u => u.id === userId);
            if (user) {
                user.full_name = params[0];
                user.email = params[1];
                user.phone = params[2];
                user.college_name = params[3];
                user.department = params[4];
                user.graduation_year = params[5];
                user.current_company = params[6];
                user.job_role = params[7];
                user.current_city = params[8];
                user.linkedin_url = params[9];
                user.bio = params[10];
                user.profile_photo = params[11];
                user.updated_at = new Date().toISOString();
            }
        }
        saveFallbackData(data);
        return { affectedRows: 1 };
    }

    // 19. INSERT INTO approval_logs
    if (/INSERT INTO approval_logs/i.test(cleanSql)) {
        const [userId, adminId, decision, reason] = params;
        const newLog = {
            id: data.approval_logs.length + 1,
            user_id: parseInt(userId, 10),
            admin_id: parseInt(adminId, 10),
            decision,
            reason,
            created_at: new Date().toISOString()
        };
        data.approval_logs.push(newLog);
        saveFallbackData(data);
        return { insertId: newLog.id, affectedRows: 1 };
    }

    return [];
}

async function query(sql, params = []) {
    if (useFallback) {
        return fallbackQuery(sql, params);
    }
    try {
        const p = getPool();
        const [results] = await p.execute(sql, params);
        return results;
    } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ENOTFOUND') {
            console.warn(`[Database] MySQL unavailable (${err.code}). Switching to local fallback storage.`);
            useFallback = true;
            return fallbackQuery(sql, params);
        }
        throw err;
    }
}

async function initDb() {
    try {
        const p = getPool();
        // Test connection
        await p.query('SELECT 1');

        await p.query(`
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                full_name VARCHAR(120) NOT NULL,
                email VARCHAR(190) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('admin', 'alumni') NOT NULL DEFAULT 'alumni',
                approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
                phone VARCHAR(30) NULL,
                college_name VARCHAR(160) NOT NULL,
                department VARCHAR(120) NOT NULL,
                graduation_year SMALLINT UNSIGNED NOT NULL,
                current_company VARCHAR(160) NULL,
                job_role VARCHAR(160) NULL,
                current_city VARCHAR(120) NULL,
                linkedin_url VARCHAR(500) NULL,
                bio TEXT NULL,
                profile_photo MEDIUMTEXT NULL,
                rejection_reason VARCHAR(500) NULL,
                decision_at DATETIME NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_users_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        try {
            await p.query('ALTER TABLE users MODIFY COLUMN profile_photo MEDIUMTEXT NULL;');
        } catch (e) {}

        await p.query(`
            CREATE TABLE IF NOT EXISTS approval_logs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_id BIGINT UNSIGNED NOT NULL,
                admin_id BIGINT UNSIGNED NOT NULL,
                decision ENUM('approved', 'rejected') NOT NULL,
                reason VARCHAR(500) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await p.query(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                email_hash CHAR(64) NOT NULL,
                ip_hash CHAR(64) NOT NULL,
                attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
                last_attempt DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_login_attempt_email_ip (email_hash, ip_hash)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        console.log('[Database] Connected to MySQL and tables verified.');
    } catch (err) {
        console.warn(`[Database] MySQL not connected (${err.message}). Using local embedded storage.`);
        useFallback = true;
    }
}

module.exports = {
    getPool,
    query,
    initDb,
    isFallback: () => useFallback
};
