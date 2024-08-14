import type { IncomingMessage } from 'node:http'
import type WebSocket from 'ws'
import { jwtSecret } from './config'
import { addClient, getClient, removeClient } from './clientManager'
import { joinRoom, leaveRoom, getRoomSize, joinRoomQueue } from './roomManager'
import axios from 'axios'
import type internal from 'node:stream'
import { decode } from '@auth/core/jwt'

export const handleUpgrade = (wss: WebSocket.Server) => async (request: IncomingMessage, socket: internal.Duplex, head: Buffer) => {
	try {
		socket.on('error', onSocketPreError)

		// Extract the JWT token from the request headers
		const cookies = request.headers.cookie
		if (!cookies) {
			console.log('No cookies found')
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
			socket.destroy()
			return
		}

		const cookieArray = cookies.split(';')

		// Find the cookie that contains the JWT token
		const tokenCookie = cookieArray.find((cookie) => cookie.trim().startsWith('authjs.session-token'))
		if (!tokenCookie) {
			console.log('No token cookie found')
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
			socket.destroy()
			return
		}

		// Decode the JWT token
		const token = tokenCookie.split('=')[1]
		const decoded = await decode({
			token: token,
			secret: jwtSecret,
			salt: '',
		})

		if (!decoded) {
			console.log('No decoded token found')
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
			socket.destroy()
			return
		}

		// Token is valid, proceed with the WebSocket upgrade
		wss.handleUpgrade(request, socket, head, (ws) => {
			socket.removeListener('error', onSocketPreError)
			wss.emit('connection', ws, request)
		})
	} catch (error) {
		console.error('Error during WebSocket upgrade:', error)
		socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
		socket.destroy()
	}
}

function onSocketPreError(error: Error) {
	console.error('WebSocket server error: ', error)
}

export const onSocketError = (error: Error) => {
	console.error('WebSocket post http error', error)
}

export const onSocketMessage = (ws: WebSocket) => (message: WebSocket.Data) => {
	const data = JSON.parse(message.toString())
	const { type, roomId, userId } = data

	if (type === 'join') {
		addClient(ws, userId, roomId)
		joinRoom(roomId, ws, userId)
	}

	if (type === 'joinQueue') {
		joinRoomQueue(roomId, ws, userId)
	}
}

export const onSocketClose = (ws: WebSocket) => async () => {
	const user = getClient(ws)
	if (user) {
		const userId = removeClient(ws)

		if (!userId) {
			return
		}

		leaveRoom(user.roomId, ws, userId)

		// if (getRoomSize(user.roomId) === 0) {
		// 	await axios.patch(`http://localhost:3000/api/linkroom/remove?roomId=${user.roomId}`)
		// }
	}
}
