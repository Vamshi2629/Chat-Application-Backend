const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

// Search users
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.length < 2) {
            return res.json([]);
        }

        const users = await prisma.user.findMany({
            where: {
                AND: [
                    { id: { not: req.user.userId } },
                    { isVerified: true },
                    {
                        OR: [
                            { name: { contains: query, mode: 'insensitive' } },
                            { email: { contains: query, mode: 'insensitive' } }
                        ]
                    }
                ]
            },
            select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                isOnline: true,
                lastSeen: true
            },
            take: 10
        });

        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
                isOnline: true,
                lastSeen: true
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get user by ID (for viewing profiles)
router.get('/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
                isOnline: true,
                lastSeen: true
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { name, avatar, status } = req.body;

        // Only include fields that are provided
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (avatar !== undefined) updateData.avatar = avatar;
        if (status !== undefined) updateData.status = status;

        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true
            }
        });

        res.json(user);
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
