/** Smoke tests for the EIC dashboard API. Run with `npm test`. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';

let server;
let base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});

test.after(() => server.close());

test('GET /api/health', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'ok');
});

test('GET /api/stats/overview returns consistent totals', async () => {
  const o = await (await fetch(`${base}/api/stats/overview`)).json();
  assert.equal(o.totalMembers, 240);
  assert.ok(o.activeMembers > 0 && o.activeMembers <= o.totalMembers);
  assert.ok(o.avgAttendanceRate > 0 && o.avgAttendanceRate <= 1);
});

test('GET /api/events supports category filter', async () => {
  const all = await (await fetch(`${base}/api/events`)).json();
  assert.ok(all.count > 0);
  const cat = all.events[0].category;
  const filtered = await (await fetch(`${base}/api/events?category=${encodeURIComponent(cat)}`)).json();
  assert.ok(filtered.events.every((e) => e.category === cat));
});

test('POST /api/events creates and validates', async () => {
  const bad = await fetch(`${base}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x' }),
  });
  assert.equal(bad.status, 400);

  const before = (await (await fetch(`${base}/api/events`)).json()).count;
  const ok = await fetch(`${base}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test Demo Day', category: 'Pitch Night', date: '2025-05-01' }),
  });
  assert.equal(ok.status, 201);
  const after = (await (await fetch(`${base}/api/events`)).json()).count;
  assert.equal(after, before + 1);
});

test('GET /api/members supports branch + active filters', async () => {
  const res = await (await fetch(`${base}/api/members?branch=cse&active=true`)).json();
  assert.ok(res.members.every((m) => m.branch === 'CSE' && m.active === true));
});
