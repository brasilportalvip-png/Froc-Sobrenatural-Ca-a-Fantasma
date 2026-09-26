import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { app } from './src/serverApp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.APP_PORT || (process.env.PORT === '8080' ? '3000' : (process.env.PORT || '3000')), 10);
const isProd = process.env.NODE_ENV === 'production';

async function setupApp() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Froc Sobrenatural] Servidor rodando em http://localhost:${PORT} (Modo: ${isProd ? 'produção' : 'desenvolvimento'})`);
  });
}

setupApp();
