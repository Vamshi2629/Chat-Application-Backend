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

// Send a friend request
// Send a friend request
exports.sendRequest = async (req, res) => {
    const senderId = req.user.userId;
    const { receiverId } = req.body;

    if (senderId === receiverId) return res.status(400).json({ message: "Can't send request to yourself" });
    try {
        // Check for blocks
        const blocked = await prisma.block.findFirst({
            where: {
                OR: [
                    { blockerId: senderId, blockedId: receiverId },
                    { blockerId: receiverId, blockedId: senderId }
                ]
            }
        });

        if (blocked) {
            return res.status(403).json({ message: 'Unable to send request' });
        }

        const existing = await prisma.friendRequest.findUnique({
            where: { senderId_receiverId: { senderId, receiverId } },
        });
        if (existing) return res.status(409).json({ message: 'Request already exists' });
        const request = await prisma.friendRequest.create({
            data: { senderId, receiverId },
            include: { sender: true }
        });
        // Emit real‑time notification
        const io = req.app.get('io');
        if (io) io.to(`user:${receiverId}`).emit('friendRequest:received', request);
        res.status(201).json(request);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ... (keep existing functions)

// Block a user
// Block a user
exports.blockUser = async (req, res) => {
    const userId = req.user.userId;
    const { userId: blockedId } = req.body;

    if (userId === blockedId) return res.status(400).json({ message: "Can't block yourself" });

    try {
        // Create block record
        await prisma.block.create({
            data: {
                blockerId: userId,
                blockedId: blockedId
            }
        });

        // Remove any existing friend connection or request
        const friendRequest = await prisma.friendRequest.findFirst({
            where: {
                OR: [
                    { senderId: userId, receiverId: blockedId },
                    { senderId: blockedId, receiverId: userId }
                ]
            }
        });

        if (friendRequest) {
            await prisma.friendRequest.delete({
                where: { id: friendRequest.id }
            });
        }

        // Notify via socket to remove from friend lists
        const io = req.app.get('io');
        if (io) {
            io.to(userId).emit('friend:removed', { friendId: blockedId });
            io.to(blockedId).emit('friend:removed', { friendId: userId });
        }

        res.json({ message: 'User blocked successfully' });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ message: 'User already blocked' });
        }
        console.error('Block user error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Unblock a user
exports.unblockUser = async (req, res) => {
    const userId = req.user.userId;
    const { userId: blockedId } = req.params;

    try {
        await prisma.block.deleteMany({
            where: {
                blockerId: userId,
                blockedId: blockedId
            }
        });

        res.json({ message: 'User unblocked successfully' });
    } catch (err) {
        console.error('Unblock user error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get blocked users
exports.getBlockedUsers = async (req, res) => {
    const userId = req.user.userId;

    try {
        const blocks = await prisma.block.findMany({
            where: { blockerId: userId },
            include: { blocked: true }
        });

        const blockedUsers = blocks.map(b => ({
            id: b.blocked.id,
            name: b.blocked.name,
            email: b.blocked.email,
            avatar: b.blocked.avatar
        }));

        res.json(blockedUsers);
    } catch (err) {
        console.error('Get blocked users error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Respond to a friend request (accept / reject)
exports.respondRequest = async (req, res) => {
    const userId = req.user.userId;
    const { requestId, action } = req.body; // action: 'accept' or 'reject'
    if (!['accept', 'reject'].includes(action))
        return res.status(400).json({ message: 'Invalid action' });
    try {
        const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
        if (!request) return res.status(404).json({ message: 'Request not found' });
        if (request.receiverId !== userId) return res.status(403).json({ message: 'Not allowed' });
        const updated = await prisma.friendRequest.update({
            where: { id: requestId },
            data: { status: action === 'accept' ? 'accepted' : 'rejected' },
        });
        // If accepted, create a direct channel for the two users
        if (action === 'accept') {
            const newChannel = await prisma.channel.create({
                data: {
                    type: 'direct',
                    members: {
                        create: [
                            { userId: request.senderId },
                            { userId: request.receiverId },
                        ],
                    },
                },
                include: {
                    members: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    avatar: true,
                                    isOnline: true
                                }
                            }
                        }
                    },
                    messages: {
                        take: 1,
                        orderBy: { createdAt: 'desc' }
                    },
                    _count: {
                        select: { messages: true }
                    }
                }
            });

            // Emit channel_created to both users so it appears in their list immediately
            const io = req.app.get('io');
            if (io) {
                io.to(`user:${request.senderId}`).emit('channel_created', newChannel);
                io.to(`user:${request.receiverId}`).emit('channel_created', newChannel);
            }
        }
        // Emit update to both parties
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${request.senderId}`).emit('friendRequest:updated', updated);
            io.to(`user:${request.receiverId}`).emit('friendRequest:updated', updated);
        }
        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get pending incoming requests for the logged‑in user
exports.getPending = async (req, res) => {
    const userId = req.user.userId;
    try {
        const pending = await prisma.friendRequest.findMany({
            where: { receiverId: userId, status: 'pending' },
            include: { sender: true },
        });
        res.json(pending);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get accepted friends (both sides where status = 'accepted')
exports.getFriends = async (req, res) => {
    const userId = req.user.userId;
    try {
        const accepted = await prisma.friendRequest.findMany({
            where: {
                OR: [{ senderId: userId }, { receiverId: userId }],
                status: 'accepted',
            },
            include: { sender: true, receiver: true },
        });
        // Map to friend user objects
        const friends = accepted.map((fr) => {
            const friend = fr.senderId === userId ? fr.receiver : fr.sender;
            return { id: friend.id, name: friend.name, avatar: friend.avatar };
        });
        res.json(friends);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Remove a friend
exports.removeFriend = async (req, res) => {
    const userId = req.user.userId;
    const { friendId } = req.params;

    try {
        // Find the friend request record
        const friendRequest = await prisma.friendRequest.findFirst({
            where: {
                OR: [
                    { senderId: userId, receiverId: friendId },
                    { senderId: friendId, receiverId: userId }
                ],
                status: 'accepted'
            }
        });

        if (!friendRequest) {
            return res.status(404).json({ message: 'Friend connection not found' });
        }

        // Delete the record
        await prisma.friendRequest.delete({
            where: { id: friendRequest.id }
        });

        // Notify both users via socket
        const io = req.app.get('io');
        if (io) {
            io.to(userId).emit('friend:removed', { friendId });
            io.to(friendId).emit('friend:removed', { friendId: userId });
        }

        res.json({ message: 'Friend removed successfully' });
    } catch (err) {
        console.error('Remove friend error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
