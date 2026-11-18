const express = require('express');
const router = express.Router();
const authController = require('../../controllers/auth.controller');
const { apiRequireAuth } = require('../../middleware/auth.middleware');

router.post('/login', authController.apiLogin);
router.post('/register', authController.apiRegister);
router.post('/logout', authController.apiLogout);
router.get('/me', apiRequireAuth, authController.apiMe);

module.exports = router;
