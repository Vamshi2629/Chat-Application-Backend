require('dotenv').config();
const http = require('http');
const app = require('./app');
const { Server } = require('socket.io');
const socketHandler = require('./socket/socketHandler');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Initialize socket handler with JWT auth
app.set('io', io);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
