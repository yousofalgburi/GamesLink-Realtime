import { WebSocketServer } from 'ws'
import express from 'express'
import { port } from './config'
import { handleUpgrade } from './utils'
import cors from 'cors'

const app = express()

app.use(
	cors({
		origin: 'http://localhost:3000',
		credentials: true,
	}),
	cors({
		origin: 'https://gameslink.app',
		credentials: true,
	}),
)

const wss = new WebSocketServer({ noServer: true })

export const startServer = () => {
	const server = app.listen(port, () => {
		console.log(`Server is running on port ${port}`)
	})

	server.on('upgrade', handleUpgrade(wss))

	return wss
}
