import dotenv from 'dotenv'
import express from 'express'
import { decode } from 'next-auth/jwt'
import { WebSocket, WebSocketServer } from 'ws'

dotenv.config()

const port = 8000
const app = express()

const wss = new WebSocketServer({ noServer: true })
const rooms: Record<string, Set<WebSocket>> = {}

const s = app.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})

// JWT secret key
const jwtSecret = process.env.JWT_SECRET!

function onSocketPreError(error: Error) {
	console.error('WebSocket server error: ', error)
}

function onSocketError(error: Error) {
	console.error('WebSocket post http error', error)
}

s.on('upgrade', async (request, socket, head) => {
	socket.on('error', onSocketPreError)

	// Extract the JWT token from the request headers
	const cookies = request.headers.cookie
	if (!cookies) {
		socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
		socket.destroy()
		return
	}

	const cookieArray = cookies.split(';')

	// Find the cookie that contains the JWT token
	const tokenCookie = cookieArray.find((cookie) => cookie.trim().startsWith('next-auth.session-token'))
	if (!tokenCookie) {
		socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
		socket.destroy()
		return
	}

	const token = tokenCookie.split('=')[1]

	// Decode the JWT token
	const decoded = await decode({
		token: token,
		secret: jwtSecret
	})

	if (!decoded) {
		socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
		socket.destroy()
		return
	}

	// Token is valid, proceed with the WebSocket upgrade
	wss.handleUpgrade(request, socket, head, (ws) => {
		socket.removeListener('error', onSocketPreError)
		wss.emit('connection', ws, request)
	})
})

wss.on('connection', (ws, request) => {
	ws.on('error', onSocketError)

	ws.on('message', (message) => {
		const data = JSON.parse(message.toString())
		const { type, roomId, userId } = data

		if (type === 'join') {
			if (!rooms[roomId]) {
				rooms[roomId] = new Set()
			}
			rooms[roomId].add(ws)

			// Notify other users in the room that a new user has joined
			rooms[roomId].forEach((client) => {
				if (client !== ws && client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify({ type: 'userJoined' }))
				}
			})

			ws.send(JSON.stringify({ type: 'userJoined', roomId, userId }))
		}
	})

	ws.on('close', (message) => {
		const data = JSON.parse(message.toString())
		const { userId } = data

		// Remove the WebSocket connection from the room when it's closed
		Object.values(rooms).forEach((room) => {
			room.delete(ws)
		})

		ws.send(JSON.stringify({ type: 'userLeft', userId }))
	})
})
