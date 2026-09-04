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

test('POST /api/attendance/simulate checks a member in, then GET reflects it', async () => {
  const { events } = await (await fetch(`${base}/api/events`)).json();
  const eventId = events[0].id;
  const { members } = await (await fetch(`${base}/api/members`)).json();
  const memberId = members[0].id;

  const scan = await fetch(`${base}/api/attendance/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, memberId }),
  });
  assert.equal(scan.status, 201);
  const body = await scan.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.member.id, memberId);

  const log = await (await fetch(`${base}/api/attendance/${eventId}`)).json();
  assert.equal(log.count, 1);
  assert.equal(log.checkins[0].memberId, memberId);
});

test('POST /api/attendance/simulate reports a duplicate scan instead of double-counting', async () => {
  const { events } = await (await fetch(`${base}/api/events`)).json();
  const eventId = events[1].id;
  const { members } = await (await fetch(`${base}/api/members`)).json();
  const memberId = members[1].id;
  const body = { eventId, memberId };
  const headers = { 'Content-Type': 'application/json' };

  const first = await fetch(`${base}/api/attendance/simulate`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(first.status, 201);
  const second = await fetch(`${base}/api/attendance/simulate`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).status, 'duplicate');

  const log = await (await fetch(`${base}/api/attendance/${eventId}`)).json();
  assert.equal(log.count, 1);
});

test('POST /api/attendance/scan rejects an unknown tag and a missing event', async () => {
  const { events } = await (await fetch(`${base}/api/events`)).json();
  const headers = { 'Content-Type': 'application/json' };

  const badTag = await fetch(`${base}/api/attendance/scan`, {
    method: 'POST', headers, body: JSON.stringify({ eventId: events[0].id, rfidTag: 'NOPE1234' }),
  });
  assert.equal(badTag.status, 404);

  const badEvent = await fetch(`${base}/api/attendance/scan`, {
    method: 'POST', headers, body: JSON.stringify({ eventId: 999999, rfidTag: 'AAAAAAAA' }),
  });
  assert.equal(badEvent.status, 404);
});
