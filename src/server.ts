import express from 'express'
import { WebSocketServer, WebSocket, type Data } from 'ws'
import http from 'node:http'
import dotenv from 'dotenv'
import cors from 'cors'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import axios from 'axios'

// Load environment variables
dotenv.config()

// Configuration
const port = 8000
const jwtSecret = process.env.JWT_SECRET

// Express app setup
const app = express()
app.use(
	cors({
		origin: ['http://localhost:3000', 'https://gameslink.app'],
		credentials: true,
	}),
)

// WebSocket server setup
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

// Client management
const connectedClients: Map<string, { ws: WebSocket; roomId: string }> = new Map()
const rooms: Map<string, Set<string>> = new Map()

const addClient = (ws: WebSocket, userId: string, roomId: string) => {
	const existingClient = connectedClients.get(userId)
	if (existingClient) {
		existingClient.ws.close()
	}
	connectedClients.set(userId, { ws, roomId })
}

const removeClient = (userId: string) => {
	const client = connectedClients.get(userId)
	if (client) {
		leaveRoom(client.roomId, userId)
		connectedClients.delete(userId)
	}
}

const joinRoom = (roomId: string, userId: string) => {
	if (!rooms.has(roomId)) {
		rooms.set(roomId, new Set())
	}
	const room = rooms.get(roomId)

	if (!room) {
		return
	}

	if (!room.has(userId)) {
		room.add(userId)
		notifyClients(roomId, 'userJoined', { roomId, userId }, userId)
	}
}

const leaveRoom = (roomId: string, userId: string) => {
	const room = rooms.get(roomId)
	if (room) {
		room.delete(userId)
		notifyClients(roomId, 'userLeft', { roomId, userId }, userId)
		if (room.size === 0) {
			rooms.delete(roomId)
		}
	}
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const joinRoomQueue = async (roomId: string, ws: WebSocket, user: any) => {
	if (!rooms.has(roomId)) {
		return
	}

	try {
		notifyClients(roomId, 'userJoinedQueue', { roomId, user }, user.id)
	} catch (error) {
		console.error('Error joining room queue:', error)
	}
}

const notifyClients = (roomId: string, type: string, data: Record<string, unknown>, excludeUserId?: string) => {
	const room = rooms.get(roomId)
	if (room) {
		const message = JSON.stringify({ type, ...data })
		for (const userId of room) {
			if (userId !== excludeUserId) {
				const client = connectedClients.get(userId)
				if (client && client.ws.readyState === WebSocket.OPEN) {
					client.ws.send(message)
				}
			}
		}
	}
}

// WebSocket handlers
const handleUpgrade = async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
	try {
		socket.on('error', onSocketPreError)

		// NOTE: JWT validation is commented out. Uncomment and implement if needed.
		// const decoded = true; // Replace with actual JWT decoding logic

		// if (!decoded) {
		//   console.log('No decoded token found');
		//   socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
		//   socket.destroy();
		//   return;
		// }

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

const onSocketError = (error: Error) => {
	console.error('WebSocket post http error', error)
}

const onSocketMessage = (ws: WebSocket) => async (message: Data) => {
	const data = JSON.parse(message.toString())
	const { type, roomId, userId, user } = data

	if (type === 'join') {
		addClient(ws, userId, roomId)
		joinRoom(roomId, userId)
		notifyClients(roomId, 'userJoined', { userId }, userId)
	} else if (type === 'leave') {
		removeClient(userId)
		notifyClients(roomId, 'userLeft', { userId }, userId)
	} else if (type === 'requestRoll') {
		notifyClients(roomId, 'newRollAvailable', { rollerId: userId }, userId)
	} else if (type === 'joinQueue') {
		joinRoomQueue(roomId, ws, user)
	}
}

const onSocketClose = (ws: WebSocket) => async () => {
	for (const [userId, client] of connectedClients.entries()) {
		if (client.ws === ws) {
			removeClient(userId)
			break
		}
	}
}

// Server startup
server.on('upgrade', handleUpgrade)

server.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})

console.log('Starting WebSocket server...')

wss.on('connection', (ws) => {
	console.log('New WebSocket connection established')
	ws.on('error', onSocketError)
	ws.on('message', onSocketMessage(ws))
	ws.on('close', (code, reason) => {
		console.log(`WebSocket closed: ${code} ${reason}`)
		onSocketClose(ws)()
	})
})

console.log('WebSocket server started successfully')
