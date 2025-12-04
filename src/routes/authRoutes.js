const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/signup', authController.signup);
router.post('/verify-otp', authController.verifyOTP);
router.post('/login', authController.login);
router.get('/me', authMiddleware, authController.getMe);

module.exports = router;
