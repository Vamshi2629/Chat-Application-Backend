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
        console.error('Get messages error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Send a message
router.post('/:channelId', authMiddleware, async (req, res) => {
    try {
        const { channelId } = req.params;
        const { content, replyToId, attachmentUrl } = req.body;

        console.log('Sending message to channel:', channelId, 'content:', content);

        if (!content || !content.trim()) {
            return res.status(400).json({ message: 'Message content is required' });
        }

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
                content: content.trim(),
                replyToId: replyToId || null,
                attachmentUrl: attachmentUrl || null
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

        // Emit socket event to all users in the channel
        const io = req.app.get('io');
        if (io) {
            // Fetch all channel members to broadcast to them individually
            const channelMembers = await prisma.channelMember.findMany({
                where: { channelId },
                select: { userId: true }
            });

            channelMembers.forEach(member => {
                io.to(`user:${member.userId}`).emit('new_message', {
                    channelId,
                    message: { ...message, status: 'sent' }
                });
            });

            console.log(`Emitted new_message to ${channelMembers.length} members`);
        } else {
            console.log('Socket.io not available');
        }

        console.log('Message sent successfully:', message.id);
        res.status(201).json(message);
    } catch (error) {
        console.error('Send message error:', error);
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

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(message.channelId).emit('message_deleted', {
                messageId,
                channelId: message.channelId
            });
        }

        res.json({ message: 'Message deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
