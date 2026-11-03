const app = require('../app');
const { initDb } = require('../config/db');

let isInitialized = false;

module.exports = async (req, res) => {
    if (!isInitialized) {
        try {
            await initDb();
        } catch (err) {
            console.error('Vercel serverless DB init note:', err.message);
        }
        isInitialized = true;
    }
    return app(req, res);
};

