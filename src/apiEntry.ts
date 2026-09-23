import type { VercelRequest, VercelResponse } from '@vercel/node';
import { app } from './serverApp';

export { app };

// Vercel Serverless Function Handler
// Permite que a Vercel execute o app Express tanto diretamente como função ou repassando req e res
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
