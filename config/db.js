const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;

function getDbConfig() {
    if (process.env.DATABASE_URL || process.env.MYSQL_URL) {
        const connectionUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
        const config = {
            uri: connectionUrl,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            charset: 'utf8mb4'
        };
        if (process.env.DB_SSL === 'true' || connectionUrl.includes('ssl=')) {
            config.ssl = { rejectUnauthorized: false };
        }
        return config;
    }

    const host = process.env.DB_HOST || '127.0.0.1';
    const port = parseInt(process.env.DB_PORT || '3306', 10);
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
    const database = process.env.DB_NAME || 'alumni_tracking';

    const config = {
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4'
    };

    if (process.env.DB_SSL === 'true') {
        config.ssl = { rejectUnauthorized: false };
    }

    return config;
}

function getPool() {
    if (!pool) {
        const config = getDbConfig();
        if (config.uri) {
            pool = mysql.createPool(config.uri);
        } else {
            pool = mysql.createPool(config);
        }
    }
    return pool;
}

async function query(sql, params = []) {
    const p = getPool();
    const [results] = await p.execute(sql, params);
    return results;
}

async function initDb() {
    try {
        const p = getPool();

        // 1. users table
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
                UNIQUE KEY uq_users_email (email),
                KEY idx_users_directory (role, approval_status, full_name),
                KEY idx_users_graduation_year (graduation_year),
                KEY idx_users_department (department),
                KEY idx_users_company (current_company),
                KEY idx_users_job_role (job_role),
                KEY idx_users_city (current_city)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Upgrade profile_photo to MEDIUMTEXT if already created with VARCHAR(80)
        try {
            await p.query(`ALTER TABLE users MODIFY COLUMN profile_photo MEDIUMTEXT NULL;`);
        } catch (e) {
            // Already modified or fine
        }

        // 2. approval_logs table
        await p.query(`
            CREATE TABLE IF NOT EXISTS approval_logs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_id BIGINT UNSIGNED NOT NULL,
                admin_id BIGINT UNSIGNED NOT NULL,
                decision ENUM('approved', 'rejected') NOT NULL,
                reason VARCHAR(500) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_approval_logs_user_created (user_id, created_at),
                KEY idx_approval_logs_admin_created (admin_id, created_at),
                CONSTRAINT fk_approval_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                CONSTRAINT fk_approval_logs_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 3. login_attempts table
        await p.query(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                email_hash CHAR(64) NOT NULL,
                ip_hash CHAR(64) NOT NULL,
                attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
                last_attempt DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_login_attempt_email_ip (email_hash, ip_hash),
                KEY idx_login_attempt_last_attempt (last_attempt)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        console.log('Database tables verified / initialized successfully.');
    } catch (err) {
        console.error('Database initialization note:', err.message);
    }
}

module.exports = {
    getPool,
    query,
    initDb
};

