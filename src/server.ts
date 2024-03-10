import express from 'express'
import { WebSocket, WebSocketServer } from 'ws'
const port = 8000

const app = express()

const s = app.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})

const wss = new WebSocketServer({ noServer: true })

function onSockerPreError(error: Error) {
	console.error('WebSocket server error: ', error)
}

function onSockerError(error: Error) {
	console.error('WebSocket post http error', error)
}

s.on('upgrade', (request, socket, head) => {
	socket.on('error', onSockerPreError)

	// perform authentication
	if (!!request.headers['BadAuth']) {
		socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
		socket.destroy()
		return
	}

	wss.handleUpgrade(request, socket, head, (ws) => {
		socket.removeListener('error', onSockerPreError)
		wss.emit('connection', ws, request)
	})
})

wss.on('connection', (ws, request) => {
	ws.on('error', onSockerError)

	ws.on('message', (message, isBinary) => {
		wss.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(message, { binary: isBinary })
			}
		})
	})

	ws.on('close', () => {
		console.log('WebSocket was closed')
	})
})
