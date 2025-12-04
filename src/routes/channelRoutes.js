const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

// Get all channels for current user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const channels = await prisma.channel.findMany({
            where: {
                members: {
                    some: { userId: req.user.userId }
                }
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: { id: true, name: true, avatar: true, isOnline: true }
                        }
                    }
                },
                messages: {
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        sender: { select: { id: true, name: true } }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        res.json(channels);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Create or get direct channel between two users
router.post('/direct', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.body;
        const currentUserId = req.user.userId;

        if (userId === currentUserId) {
            return res.status(400).json({ message: 'Cannot create channel with yourself' });
        }

        // Check if direct channel already exists
        const existingChannel = await prisma.channel.findFirst({
            where: {
                type: 'direct',
                AND: [
                    { members: { some: { userId: currentUserId } } },
                    { members: { some: { userId } } }
                ]
            },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, name: true, avatar: true, isOnline: true } }
                    }
                }
            }
        });

        if (existingChannel) {
            return res.json(existingChannel);
        }

        // Check if users are friends
        const areFriends = await prisma.friendRequest.findFirst({
            where: {
                status: 'accepted',
                OR: [
                    { senderId: currentUserId, receiverId: userId },
                    { senderId: userId, receiverId: currentUserId }
                ]
            }
        });

        if (!areFriends) {
            return res.status(403).json({ message: 'You must be friends to start a chat' });
        }

        // Create new direct channel
        const channel = await prisma.channel.create({
            data: {
                type: 'direct',
                members: {
                    create: [
                        { userId: currentUserId },
                        { userId }
                    ]
                }
            },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, name: true, avatar: true, isOnline: true } }
                    }
                }
            }
        });

        res.status(201).json(channel);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Create group channel
router.post('/group', authMiddleware, async (req, res) => {
    try {
        const { name, memberIds } = req.body;
        const currentUserId = req.user.userId;

        const channel = await prisma.channel.create({
            data: {
                name,
                type: 'group',
                members: {
                    create: [
                        { userId: currentUserId, role: 'admin' },
                        ...memberIds.map(id => ({ userId: id }))
                    ]
                }
            },
            include: {
                members: {
                    include: {
                        user: { select: { id: true, name: true, avatar: true, isOnline: true } }
                    }
                }
            }
        });

        res.status(201).json(channel);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
