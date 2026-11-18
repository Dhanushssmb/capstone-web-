require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    BASE_URL: (process.env.BASE_URL || '').replace(/\/+$/, ''),
    APP_KEY: process.env.APP_KEY || '245f354545e328ade35994678103241d8f8cccd994b719cf2bdad89b040e8e78',
    SETUP_KEY: process.env.SETUP_KEY || 'c961636875b541f02aad7cc48845ea52e9245e5965769d495b0dde26b6020a2c',
    DB: {
        URL: process.env.DATABASE_URL || process.env.MYSQL_URL || null,
        HOST: process.env.DB_HOST || '127.0.0.1',
        PORT: parseInt(process.env.DB_PORT || '3306', 10),
        USER: process.env.DB_USER || 'root',
        PASSWORD: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
        NAME: process.env.DB_NAME || 'alumni_tracking',
        SSL: process.env.DB_SSL === 'true'
    }
};
