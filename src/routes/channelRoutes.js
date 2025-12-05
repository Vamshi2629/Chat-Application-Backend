const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const channelController = require('../controllers/channelController');

// Get all channels for current user
router.get('/', authMiddleware, channelController.getChannels);

// Create or get direct channel between two users
router.post('/direct', authMiddleware, channelController.createDirectChannel);

// Create group channel
router.post('/group', authMiddleware, channelController.createGroupChannel);

module.exports = router;
