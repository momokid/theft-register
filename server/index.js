import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOrigin } from './auth.js';
import { router as authRouter } from './routes/auth.js';
import { router as metaRouter } from './routes/meta.js';
import { router as theftsRouter, summaryRouter } from './routes/thefts.js';
import { priceRouter, applyRouter } from './routes/prices.js';
import { router as exportRouter } from './routes/export.js';
import { router as importRouter } from './routes/import.js';
import { router as accountsRouter } from './routes/accounts.js';
import { router as auditRouter } from './routes/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', 'client', 'dist');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters');
}

export const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
      },
    },
  })
);
app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(checkOrigin);

app.use('/api/auth', authRouter);
app.use('/api/meta', metaRouter);
app.use('/api/thefts', theftsRouter);
app.use('/api/thefts', priceRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/prices', applyRouter);
app.use('/api/export.xlsx', exportRouter);
app.use('/api/import', importRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/audit', auditRouter);

app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File too large (max 10 MB)' });
    // Oversized body: don't wait on keep-alive/drain to release the connection, just close it once sent.
    res.on('finish', () => req.destroy());
    return;
  }
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});
