const express = require('express');
const router = express.Router();

const authController = require('../../controllers/auth.controller');
const alumniController = require('../../controllers/alumni.controller');
const adminController = require('../../controllers/admin.controller');
const statsController = require('../../controllers/stats.controller');

const { requireLogin, requireAdmin } = require('../../middleware/auth.middleware');
const { verifyCsrf } = require('../../middleware/csrf.middleware');
const { singlePhoto } = require('../../middleware/upload.middleware');

// Home
router.get(['/', '/index.php'], statsController.showHome);

// Authentication
router.get(['/login', '/login.php'], authController.showLogin);
router.post(['/login', '/login.php'], verifyCsrf, authController.handleLogin);
router.post(['/logout', '/logout.php'], verifyCsrf, authController.handleLogout);

// Registration
router.get(['/register', '/register.php'], authController.showRegister);
router.post(['/register', '/register.php'], singlePhoto('profile_photo'), verifyCsrf, authController.handleRegister);

// Setup Admin
router.get(['/setup-admin', '/setup-admin.php'], authController.showSetupAdmin);
router.post(['/setup-admin', '/setup-admin.php'], verifyCsrf, authController.handleSetupAdmin);

// Alumni Directory & Profiles
router.get(['/directory', '/directory.php'], alumniController.showDirectory);
router.get(['/profile', '/profile.php', '/profile/:id'], alumniController.showProfile);

// Alumni Dashboard & Profile Editing
router.get(['/dashboard', '/dashboard.php'], requireLogin, alumniController.showDashboard);
router.get(['/edit-profile', '/edit-profile.php'], requireLogin, alumniController.showEditProfile);
router.post(['/edit-profile', '/edit-profile.php'], requireLogin, singlePhoto('profile_photo'), verifyCsrf, alumniController.handleEditProfile);

// Administration
router.get(['/admin/dashboard', '/admin/dashboard.php'], requireAdmin, adminController.showDashboard);
router.get(['/admin/pending', '/admin/pending.php'], requireAdmin, adminController.showPending);
router.post(['/admin/action', '/admin/action.php'], requireAdmin, verifyCsrf, adminController.handleDecision);
router.get(['/admin/alumni', '/admin/alumni.php'], requireAdmin, adminController.showAlumniList);

module.exports = router;
