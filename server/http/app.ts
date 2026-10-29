import express, { type Express } from 'express';
import * as repo from '../db/repo.ts';
import type { AppContext } from '../engine/context.ts';
import { apiRouter, errorHandler } from './api.ts';
import { clearSessionCookie, isAuthenticated, loginLimiter, passwordMatches, requireAuth, setSessionCookie } from './auth.ts';

/** Builds the HTTP app. Static/Vite serving is added by server/index.ts. */
export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', express.json({ limit: '200kb' }));

  app.get('/api/session', (req, res) => {
    res.json({ authenticated: isAuthenticated(ctx.config, req), required: Boolean(ctx.config.demoPassword) });
  });

  app.post('/api/auth/login', loginLimiter(), (req, res) => {
    if (!ctx.config.demoPassword) return res.json({ ok: true });
    if (!passwordMatches(ctx.config, req.body?.password)) return res.status(401).json({ error: 'Incorrect password' });
    setSessionCookie(ctx.config, req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Demo role switching: the dashboard says who it's acting as with x-user. A
  // production system would take this from the signed-in account instead.
  app.use('/api', requireAuth(ctx.config), (req, res, next) => {
    const id = req.header('x-user') || 'dana';
    const actor = repo.getPerson(ctx.db, id);
    if (!actor) return res.status(400).json({ error: `Unknown user "${id}"` });
    res.locals.actor = actor;
    next();
  });

  app.use('/api', apiRouter(ctx));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
