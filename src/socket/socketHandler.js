const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

module.exports = (io) => {
    // Store user socket mappings
    const userSockets = new Map();

    // Middleware: Authenticate socket connections with JWT
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId;
            next();
        } catch (error) {
            return next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`User connected: ${socket.userId}`);

        // Store socket reference
        userSockets.set(socket.userId, socket.id);

        // Update user online status
        try {
            await prisma.user.update({
                where: { id: socket.userId },
                data: { isOnline: true, lastSeen: new Date() }
            });
        } catch (err) {
            console.error('Error updating online status:', err);
        }

        // Join user's personal room for direct notifications
        socket.join(`user:${socket.userId}`);

        // Broadcast online status to all connected users
        io.emit('user_status_changed', { userId: socket.userId, isOnline: true });

        // Join a chat room
        socket.on('join_room', (channelId) => {
            socket.join(channelId);
            console.log(`User ${socket.userId} joined room ${channelId}`);
        });

        // Leave a chat room
        socket.on('leave_room', (channelId) => {
            socket.leave(channelId);
            console.log(`User ${socket.userId} left room ${channelId}`);
        });

        // Message delivered confirmation - when receiver gets the message
        socket.on('message_delivered', async (data) => {
            const { channelId, messageId, senderId } = data;
            console.log(`Message ${messageId} delivered to ${socket.userId}`);

            try {
                // Update message status in DB
                await prisma.message.update({
                    where: { id: messageId },
                    data: { status: 'delivered' }
                });

                // Notify the sender that message was delivered
                io.to(senderId).emit('message_status_update', {
                    messageId,
                    status: 'delivered'
                });
            } catch (error) {
                console.error('Error updating message delivery status:', error);
            }
        });

        // Message read - when receiver reads/views the message
        socket.on('message_read', async (data) => {
            const { channelId, messageId, senderId } = data;
            console.log(`Message ${messageId} read by ${socket.userId}`);

            try {
                // Create read receipt in database
                await prisma.readReceipt.upsert({
                    where: {
                        messageId_userId: {
                            messageId,
                            userId: socket.userId
                        }
                    },
                    update: { readAt: new Date() },
                    create: {
                        messageId,
                        userId: socket.userId
                    }
                });

                // Update message status in DB
                await prisma.message.update({
                    where: { id: messageId },
                    data: { status: 'read' }
                });

                // Notify the sender that message was read
                io.to(senderId).emit('message_status_update', {
                    messageId,
                    status: 'read',
                    readBy: socket.userId
                });
            } catch (error) {
                console.error('Error creating read receipt:', error);
            }
        });

        // New message from API - broadcast to other users in room
        socket.on('new_message', (data) => {
            const { channelId, message } = data;
            // Broadcast to others in the room (not the sender)
            socket.to(channelId).emit('new_message', { channelId, message });
        });

        // Typing indicators
        socket.on('typing_start', (channelId) => {
            socket.to(channelId).emit('user_typing', {
                userId: socket.userId,
                channelId,
                isTyping: true,
            });
        });

        socket.on('typing_stop', (channelId) => {
            socket.to(channelId).emit('user_typing', {
                userId: socket.userId,
                channelId,
                isTyping: false,
            });
        });

        // Handle disconnect
        socket.on('disconnect', async () => {
            console.log(`User disconnected: ${socket.userId}`);

            userSockets.delete(socket.userId);

            try {
                await prisma.user.update({
                    where: { id: socket.userId },
                    data: { isOnline: false, lastSeen: new Date() }
                });
            } catch (err) {
                console.error('Error updating offline status:', err);
            }

            io.emit('user_status_changed', { userId: socket.userId, isOnline: false });
        });
    });
};
