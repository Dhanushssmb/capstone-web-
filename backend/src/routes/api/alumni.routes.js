const express = require('express');
const router = express.Router();
const alumniController = require('../../controllers/alumni.controller');
const { apiRequireAuth } = require('../../middleware/auth.middleware');

router.get('/', alumniController.apiList);
router.get('/:id', alumniController.apiGetOne);
router.put('/:id', apiRequireAuth, alumniController.apiUpdate);

module.exports = router;
