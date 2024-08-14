import { startServer } from './webSocketServer.js'
import { onSocketError, onSocketMessage, onSocketClose } from './utils.js'

console.log('Starting WebSocket server...')

const wss = startServer()

console.log('WebSocket server started successfully')

wss.on('connection', (ws) => {
	console.log('New WebSocket connection established')
	ws.on('error', onSocketError)
	ws.on('message', onSocketMessage(ws))
	ws.on('close', onSocketClose(ws))
})
