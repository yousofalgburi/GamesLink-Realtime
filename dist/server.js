"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ws_1 = require("ws");
dotenv_1.default.config();
const port = 8000;
const app = (0, express_1.default)();
const wss = new ws_1.WebSocketServer({ noServer: true });
const rooms = {};
const s = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
// JWT secret key
const jwtSecret = process.env.JWT_SECRET;
function onSocketPreError(error) {
    console.error('WebSocket server error: ', error);
}
function onSocketError(error) {
    console.error('WebSocket post http error', error);
}
s.on('upgrade', (request, socket, head) => {
    socket.on('error', onSocketPreError);
    // Extract the JWT token from the request headers
    const cookies = request.headers.cookie;
    if (!cookies) {
        console.log('rejected');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }
    const cookieArray = cookies.split(';');
    console.log(cookieArray);
    // Find the cookie that contains the JWT token
    const tokenCookie = cookieArray.find((cookie) => cookie.trim().startsWith('__session='));
    if (!tokenCookie) {
        console.log('rejected');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }
    const token = tokenCookie.split('=')[1];
    console.log('you shall pass');
    console.log(jwtSecret);
    // Verify the JWT token
    jsonwebtoken_1.default.verify(token, jwtSecret, { algorithms: ['RS256'] }, (err, decoded) => {
        if (err) {
            console.log(err);
            console.log('jk bad jwt');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        // Token is valid, proceed with the WebSocket upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
            socket.removeListener('error', onSocketPreError);
            wss.emit('connection', ws, request);
        });
    });
});
wss.on('connection', (ws, request) => {
    ws.on('error', onSocketError);
    ws.on('message', (message) => {
        const data = JSON.parse(message.toString());
        const { type, roomId } = data;
        if (type === 'join') {
            if (!rooms[roomId]) {
                rooms[roomId] = new Set();
            }
            rooms[roomId].add(ws);
            // Notify other users in the room that a new user has joined
            rooms[roomId].forEach((client) => {
                if (client !== ws && client.readyState === ws_1.WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'userJoined' }));
                }
            });
        }
        // Handle other message types as needed
    });
    ws.on('close', () => {
        // Remove the WebSocket connection from the room when it's closed
        Object.values(rooms).forEach((room) => {
            room.delete(ws);
        });
        console.log('WebSocket was closed');
    });
});
