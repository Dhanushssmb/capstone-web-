const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/admin.controller');
const { apiRequireAdmin } = require('../../middleware/auth.middleware');

router.get('/metrics', apiRequireAdmin, adminController.apiMetrics);
router.get('/pending', apiRequireAdmin, adminController.apiPending);
router.post('/decision', apiRequireAdmin, adminController.apiDecision);

module.exports = router;
