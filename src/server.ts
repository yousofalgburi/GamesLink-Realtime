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
const connectedClients: Map<WebSocket, { userId: string; roomId: string }> = new Map()

const addClient = (ws: WebSocket, userId: string, roomId: string) => {
	connectedClients.set(ws, { userId, roomId })
}

const removeClient = (ws: WebSocket) => {
	const user = connectedClients.get(ws)
	connectedClients.delete(ws)
	return user?.userId
}

const getClient = (ws: WebSocket) => {
	return connectedClients.get(ws)
}

// Room management
const rooms: Record<string, Set<WebSocket>> = {}

const joinRoom = (roomId: string, ws: WebSocket, userId: string) => {
	if (!rooms[roomId]) {
		rooms[roomId] = new Set()
	}
	if (!rooms[roomId].has(ws)) {
		rooms[roomId].add(ws)
		notifyClients(roomId, 'userJoined', { roomId, userId: userId })
	}
}

const joinRoomQueue = (roomId: string, ws: WebSocket, userId: string) => {
	if (!rooms[roomId]) {
		return
	}
	if (!rooms[roomId].has(ws)) {
		notifyClients(roomId, 'userJoinedQueue', { roomId, userId: userId })
	}
}

const leaveRoom = (roomId: string, ws: WebSocket, userId: string) => {
	if (rooms[roomId]) {
		rooms[roomId].delete(ws)
		notifyClients(roomId, 'userLeft', { userId: userId })
	}
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const broadcastRollResults = (roomId: string, rollResults: any) => {
	if (rooms[roomId]) {
		for (const client of rooms[roomId]) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(
					JSON.stringify({
						type: 'newRoll',
						roomId,
						rollResults,
					}),
				)
			}
		}
	}
}

const notifyClients = (roomId: string, type: string, data: Record<string, unknown>) => {
	if (rooms[roomId]) {
		for (const client of rooms[roomId]) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify({ type, ...data }))
			}
		}
	}
}

const getRoomSize = (roomId: string) => {
	return rooms[roomId] ? rooms[roomId].size : 0
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
	const { type, roomId, userId } = data

	if (type === 'join') {
		addClient(ws, userId, roomId)
		joinRoom(roomId, ws, userId)
	}

	if (type === 'joinQueue') {
		joinRoomQueue(roomId, ws, userId)
	}

	if (type === 'requestRoll') {
		try {
			const response = await axios.post('http://localhost:3000/api/linkroom/roll', { roomId, previousRolls: data.previousRolls })
			broadcastRollResults(roomId, response.data)
		} catch (error) {
			console.error('Error processing roll request:', error)
			ws.send(JSON.stringify({ type: 'rollError', error: 'Failed to process roll request' }))
		}
	}
}

const onSocketClose = (ws: WebSocket) => async () => {
	const user = getClient(ws)
	if (user) {
		const userId = removeClient(ws)

		if (!userId) {
			return
		}

		leaveRoom(user.roomId, ws, userId)
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
	ws.on('close', onSocketClose(ws))
})

console.log('WebSocket server started successfully')
