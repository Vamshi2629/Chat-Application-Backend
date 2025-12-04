const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const friendController = require('../controllers/friendController');

// All routes require authentication
router.use(authMiddleware);

router.post('/request', friendController.sendRequest);
router.post('/respond', friendController.respondRequest);
router.get('/pending', friendController.getPending);
router.get('/friends', friendController.getFriends);

module.exports = router;
