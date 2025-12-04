const jwt = require('jsonwebtoken');

module.exports = (io) => {
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

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.userId}`);

        // Join user's personal room for direct messages
        socket.join(socket.userId);

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

        // Send message
        socket.on('send_message', async (data) => {
            const { channelId, content, replyToId } = data;

            // Broadcast to all users in the room
            io.to(channelId).emit('message_received', {
                channelId,
                senderId: socket.userId,
                content,
                replyToId,
                createdAt: new Date().toISOString(),
            });
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

        // Read receipt
        socket.on('read_message', (data) => {
            const { channelId, messageId } = data;
            socket.to(channelId).emit('read_receipt_update', {
                messageId,
                userId: socket.userId,
                readAt: new Date().toISOString(),
            });
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.userId}`);
        });
    });
};
