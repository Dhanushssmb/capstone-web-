const express = require('express');
const router = express.Router();

const apiAuthRoutes = require('./api/auth.routes');
const apiAlumniRoutes = require('./api/alumni.routes');
const apiAdminRoutes = require('./api/admin.routes');
const statsController = require('../controllers/stats.controller');
const webRoutes = require('./web/index.routes');

// REST API routes
router.use('/api/auth', apiAuthRoutes);
router.use('/api/alumni', apiAlumniRoutes);
router.use('/api/admin', apiAdminRoutes);
router.get('/api/stats', statsController.apiStats);

// Web application routes
router.use('/', webRoutes);

module.exports = router;
