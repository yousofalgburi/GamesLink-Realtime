import { z } from 'zod'

const envVariables = z.object({
	JWT_SECRET: z.string(),
	CLIENT_ID_GOOGLE: z.string(),
})

envVariables.parse(process.env)

declare global {
	namespace NodeJS {
		interface ProcessEnv extends z.infer<typeof envVariables> {}
	}
}
