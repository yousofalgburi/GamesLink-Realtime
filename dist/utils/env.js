import { z } from 'zod';
const envVariables = z.object({
    JWT_SECRET: z.string(),
});
envVariables.parse(process.env);
