const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

// Middleware to extract userId from JWT (reuse existing auth middleware if available)
const getUserIdFromToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded.id;
    } catch (err) {
        return null;
    }
};

// Get all channels for current user
exports.getChannels = async (req, res) => {
    const userId = req.user.userId; // Assuming authMiddleware populates req.user
    try {
        const channels = await prisma.channel.findMany({
            where: {
                members: {
                    some: { userId }
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
                },
                _count: {
                    select: {
                        messages: {
                            where: {
                                senderId: { not: userId },
                                status: { not: 'read' }
                            }
                        }
                    }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        res.json(channels);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Create or get direct channel between two users
exports.createDirectChannel = async (req, res) => {
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
};

// Create group channel
exports.createGroupChannel = async (req, res) => {
    try {
        const { name, memberIds } = req.body;
        const currentUserId = req.user.userId;

        if (!name || !memberIds || memberIds.length === 0) {
            console.log('Create group failed: missing data', { name, memberIds });
            return res.status(400).json({ message: 'Group name and members are required' });
        }

        console.log('Creating group:', name, 'with members:', memberIds);

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

        // Emit socket event to all members
        const io = req.app.get('io');
        if (io) {
            channel.members.forEach(member => {
                io.to(`user:${member.userId}`).emit('channel_created', channel);
            });
        }

        res.status(201).json(channel);
    } catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
