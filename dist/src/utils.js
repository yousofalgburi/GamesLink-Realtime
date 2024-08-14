import { jwtSecret } from './config';
import { addClient, getClient, removeClient } from './clientManager';
import { joinRoom, leaveRoom, joinRoomQueue } from './roomManager';
import { decode } from '@auth/core/jwt';
export const handleUpgrade = (wss) => async (request, socket, head) => {
    try {
        socket.on('error', onSocketPreError);
        // Extract the JWT token from the request headers
        const cookies = request.headers.cookie;
        if (!cookies) {
            console.log('No cookies found');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        const cookieArray = cookies.split(';');
        // Find the cookie that contains the JWT token
        const tokenCookie = cookieArray.find((cookie) => cookie.trim().startsWith('authjs.session-token'));
        if (!tokenCookie) {
            console.log('No token cookie found');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        const token = tokenCookie.split('=')[1];
        // Decode the JWT token
        const decoded = await decode({
            token: token,
            secret: jwtSecret,
            salt: '',
        });
        if (!decoded) {
            console.log('No decoded token found');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        // Token is valid, proceed with the WebSocket upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
            socket.removeListener('error', onSocketPreError);
            wss.emit('connection', ws, request);
        });
    }
    catch (error) {
        console.error('Error during WebSocket upgrade:', error);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
    }
};
function onSocketPreError(error) {
    console.error('WebSocket server error: ', error);
}
export const onSocketError = (error) => {
    console.error('WebSocket post http error', error);
};
export const onSocketMessage = (ws) => (message) => {
    const data = JSON.parse(message.toString());
    const { type, roomId, userId } = data;
    if (type === 'join') {
        addClient(ws, userId, roomId);
        joinRoom(roomId, ws, userId);
    }
    if (type === 'joinQueue') {
        joinRoomQueue(roomId, ws, userId);
    }
};
export const onSocketClose = (ws) => async () => {
    const user = getClient(ws);
    if (user) {
        const userId = removeClient(ws);
        if (!userId) {
            return;
        }
        leaveRoom(user.roomId, ws, userId);
        // if (getRoomSize(user.roomId) === 0) {
        // 	await axios.patch(`http://localhost:3000/api/linkroom/remove?roomId=${user.roomId}`)
        // }
    }
};
