const app = require('./app');
const { initDb } = require('./config/db');

const PORT = process.env.PORT || 3000;

async function start() {
    try {
        await initDb();
    } catch (err) {
        console.warn('Note: DB connection during startup failed or pending. Ensure MySQL is running.');
    }
    app.listen(PORT, () => {
        console.log(`AlumniConnect server is running at http://localhost:${PORT}`);
    });
}

start();

