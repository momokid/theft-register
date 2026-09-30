import { Router } from 'express';
import { login, logout, requireAuth, loginRateLimit } from '../auth.js';
import { validateLogin, ValidationError } from '../validate.js';

export const router = Router();

router.post('/login', loginRateLimit, (req, res, next) => {
  try {
    req.validated = validateLogin(req.body);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    return next(err);
  }
  login(req, res).catch(next);
});

router.post('/logout', requireAuth, (req, res, next) => logout(req, res).catch(next));

router.get('/me', requireAuth, (req, res) => res.json(req.user));
