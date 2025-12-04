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
exports.sendRequest = async (req, res) => {
    const senderId = getUserIdFromToken(req);
    const { receiverId } = req.body;
    if (!senderId) return res.status(401).json({ message: 'Unauthorized' });
    if (senderId === receiverId) return res.status(400).json({ message: "Can't send request to yourself" });
    try {
        const existing = await prisma.friendRequest.findUnique({
            where: { senderId_receiverId: { senderId, receiverId } },
        });
        if (existing) return res.status(409).json({ message: 'Request already exists' });
        const request = await prisma.friendRequest.create({
            data: { senderId, receiverId },
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

// Respond to a friend request (accept / reject)
exports.respondRequest = async (req, res) => {
    const userId = getUserIdFromToken(req);
    const { requestId, action } = req.body; // action: 'accept' or 'reject'
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
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
            await prisma.channel.create({
                data: {
                    type: 'direct',
                    members: {
                        create: [
                            { userId: request.senderId },
                            { userId: request.receiverId },
                        ],
                    },
                },
            });
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
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
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
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
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
