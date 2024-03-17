"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const jwt_1 = require("next-auth/jwt");
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
s.on('upgrade', (request, socket, head) => __awaiter(void 0, void 0, void 0, function* () {
    socket.on('error', onSocketPreError);
    // Extract the JWT token from the request headers
    const cookies = request.headers.cookie;
    if (!cookies) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }
    const cookieArray = cookies.split(';');
    // Find the cookie that contains the JWT token
    const tokenCookie = cookieArray.find((cookie) => cookie.trim().startsWith('next-auth.session-token'));
    if (!tokenCookie) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }
    const token = tokenCookie.split('=')[1];
    // Decode the JWT token
    const decoded = yield (0, jwt_1.decode)({
        token: token,
        secret: jwtSecret
    });
    if (!decoded) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }
    // Token is valid, proceed with the WebSocket upgrade
    wss.handleUpgrade(request, socket, head, (ws) => {
        socket.removeListener('error', onSocketPreError);
        wss.emit('connection', ws, request);
    });
}));
wss.on('connection', (ws, request) => {
    ws.on('error', onSocketError);
    ws.on('message', (message) => {
        const data = JSON.parse(message.toString());
        const { type, roomId, userId } = data;
        if (type === 'join') {
            if (!rooms[roomId]) {
                rooms[roomId] = new Set();
            }
            if (!rooms[roomId].has(ws)) {
                console.log('adding client');
                rooms[roomId].add(ws);
                rooms[roomId].forEach((client) => {
                    if (client.readyState === ws_1.WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'userJoined', roomId, userId }));
                    }
                });
            }
        }
    });
    ws.on('close', (message) => {
        const data = JSON.parse(message.toString());
        const { userId } = data;
        // Remove the WebSocket connection from the room when it's closed
        Object.values(rooms).forEach((room) => {
            room.delete(ws);
        });
        console.log('client disconnected', userId);
        ws.send(JSON.stringify({ type: 'userLeft', userId }));
    });
});
