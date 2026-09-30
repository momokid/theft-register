import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
config({ path: new URL('../.env.test', import.meta.url) });
const { app } = await import('../server/index.js');
const { pool } = await import('../server/db.js');

after(() => pool.end());

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('unauthenticated request is rejected', async () => {
  const server = await listen();
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/auth/me`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  } finally {
    server.close();
  }
});

test('login with unknown email returns generic 401', async () => {
  const server = await listen();
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrongpassword' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Invalid email or password');
  } finally {
    server.close();
  }
});

test('POST without matching Origin is rejected', async () => {
  const server = await listen();
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrongpassword' }),
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('login with unknown field is rejected', async () => {
  const server = await listen();
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: process.env.APP_ORIGIN },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'x', extra: 1 }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
