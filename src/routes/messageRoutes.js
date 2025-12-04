const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const authMiddleware = require('../middlewares/authMiddleware');

// Get messages for a channel with pagination
router.get('/:channelId', authMiddleware, async (req, res) => {
    try {
        const { channelId } = req.params;
        const { cursor, limit = 50 } = req.query;

        // Verify user is member of channel
        const isMember = await prisma.channelMember.findUnique({
            where: {
                channelId_userId: { channelId, userId: req.user.userId }
            }
        });

        if (!isMember) {
            return res.status(403).json({ message: 'Not a member of this channel' });
        }

        const messages = await prisma.message.findMany({
            where: {
                channelId,
                deletedAt: null,
                ...(cursor && { createdAt: { lt: new Date(cursor) } })
            },
            take: parseInt(limit),
            orderBy: { createdAt: 'desc' },
            include: {
                sender: { select: { id: true, name: true, avatar: true } },
                replyTo: {
                    include: {
                        sender: { select: { id: true, name: true } }
                    }
                },
                readReceipts: {
                    include: {
                        user: { select: { id: true, name: true } }
                    }
                }
            }
        });

        res.json(messages.reverse());
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Send a message
router.post('/:channelId', authMiddleware, async (req, res) => {
    try {
        const { channelId } = req.params;
        const { content, replyToId } = req.body;

        // Verify user is member of channel
        const isMember = await prisma.channelMember.findUnique({
            where: {
                channelId_userId: { channelId, userId: req.user.userId }
            }
        });

        if (!isMember) {
            return res.status(403).json({ message: 'Not a member of this channel' });
        }

        const message = await prisma.message.create({
            data: {
                channelId,
                senderId: req.user.userId,
                content,
                replyToId
            },
            include: {
                sender: { select: { id: true, name: true, avatar: true } },
                replyTo: {
                    include: {
                        sender: { select: { id: true, name: true } }
                    }
                }
            }
        });

        // Update channel's updatedAt
        await prisma.channel.update({
            where: { id: channelId },
            data: { updatedAt: new Date() }
        });

        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Edit a message
router.put('/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;

        const message = await prisma.message.findUnique({
            where: { id: messageId }
        });

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        if (message.senderId !== req.user.userId) {
            return res.status(403).json({ message: 'Not authorized to edit this message' });
        }

        const updated = await prisma.message.update({
            where: { id: messageId },
            data: { content, isEdited: true },
            include: {
                sender: { select: { id: true, name: true, avatar: true } }
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Soft delete a message
router.delete('/:messageId', authMiddleware, async (req, res) => {
    try {
        const { messageId } = req.params;

        const message = await prisma.message.findUnique({
            where: { id: messageId }
        });

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        if (message.senderId !== req.user.userId) {
            return res.status(403).json({ message: 'Not authorized to delete this message' });
        }

        await prisma.message.update({
            where: { id: messageId },
            data: { deletedAt: new Date() }
        });

        res.json({ message: 'Message deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
