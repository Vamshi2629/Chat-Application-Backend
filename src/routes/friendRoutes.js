const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const friendController = require('../controllers/friendController');

// All routes require authentication
router.use(authMiddleware);

router.post('/request', friendController.sendRequest);
router.post('/respond', friendController.respondRequest);
router.get('/pending', friendController.getPending);
router.get('/', friendController.getFriends);
router.delete('/:friendId', friendController.removeFriend);
router.post('/block', friendController.blockUser);
router.delete('/block/:userId', friendController.unblockUser);
router.get('/blocked', friendController.getBlockedUsers);

module.exports = router;
