/** Express app: JSON API under /api + static dashboard from /public. */
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import apiRouter from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.use('/api', apiRouter);

  app.use(express.static(join(__dirname, '..', 'public')));

  return app;
}

export default createApp;
