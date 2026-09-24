import type { VercelRequest, VercelResponse } from '@vercel/node';
// Explicit import lets Vercel trace Firestore and its protobuf files.
// Firebase Admin also loads it dynamically, which a file tracer cannot see.
import '@google-cloud/firestore';
import { app } from './serverApp';

export { app };

// Vercel Serverless Function Handler
// Permite que a Vercel execute o app Express tanto diretamente como função ou repassando req e res
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
