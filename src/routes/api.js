/** REST API for the EIC dashboard. Mounted at /api by src/app.js. */
import { Router } from 'express';

import {
  db,
  overview,
  memberGrowth,
  attendanceTrend,
  eventCategories,
  branchBreakdown,
  nextId,
  createMember,
  publicMember,
  scanCheckIn,
  simulateCheckIn,
  eventCheckins,
} from '../data/store.js';

const router = Router();

/* ---------- members ---------- */

router.get('/members', (req, res) => {
  let rows = db.members;
  const { branch, active, role } = req.query;
  if (branch) rows = rows.filter((m) => m.branch === branch.toUpperCase());
  if (role) rows = rows.filter((m) => m.role.toLowerCase() === role.toLowerCase());
  if (active === 'true') rows = rows.filter((m) => m.active);
  if (active === 'false') rows = rows.filter((m) => !m.active);
  res.json({ count: rows.length, members: rows.map(publicMember) });
});

router.post('/members', (req, res) => {
  const { name, branch, year, role } = req.body ?? {};
  if (!name || !branch) {
    return res.status(400).json({ error: 'name and branch are required' });
  }
  const member = createMember({ name, branch, year, role });
  res.status(201).json(publicMember(member));
});

/* ---------- events ---------- */

router.get('/events', (req, res) => {
  let rows = db.events;
  const { category, from, to } = req.query;
  if (category) rows = rows.filter((e) => e.category === category);
  if (from) rows = rows.filter((e) => e.date >= from);
  if (to) rows = rows.filter((e) => e.date <= to);
  res.json({ count: rows.length, events: rows });
});

router.get('/events/:id', (req, res) => {
  const event = db.events.find((e) => e.id === Number(req.params.id));
  if (!event) return res.status(404).json({ error: 'event not found' });
  res.json(event);
});

router.post('/events', (req, res) => {
  const { title, category, date, capacity } = req.body ?? {};
  if (!title || !category || !date) {
    return res.status(400).json({ error: 'title, category and date are required' });
  }
  const cap = Number(capacity) || 60;
  const event = {
    id: nextId(db.events),
    title: String(title),
    category: String(category),
    date: String(date),
    capacity: cap,
    registered: 0,
    attended: 0,
    attendanceRate: 0,
    speaker: req.body.speaker || null,
  };
  db.events.push(event);
  db.events.sort((a, b) => a.date.localeCompare(b.date));
  res.status(201).json(event);
});

/* ---------- attendance (RFID scan) ---------- */

const SCAN_STATUS_HTTP = {
  'event-not-found': 404,
  'unknown-tag': 404,
  'unknown-member': 404,
  duplicate: 200,
  ok: 201,
};

// Never send a member's RFID tag back over the API — not for the general
// directory listing, and not in scan/simulate responses either.
function sanitizeScanResult(result) {
  return result.member ? { ...result, member: publicMember(result.member) } : result;
}

router.get('/attendance/:eventId', (req, res) => {
  const result = eventCheckins(req.params.eventId);
  if (!result) return res.status(404).json({ error: 'event not found' });
  res.json(result);
});

// Real path: a USB RFID reader acts as a keyboard — it types the card's UID
// then Enter — so the front end just posts whatever landed in a text input.
router.post('/attendance/scan', (req, res) => {
  const { eventId, rfidTag } = req.body ?? {};
  if (!eventId || !rfidTag) {
    return res.status(400).json({ error: 'eventId and rfidTag are required' });
  }
  const result = scanCheckIn(eventId, rfidTag);
  res.status(SCAN_STATUS_HTTP[result.status] ?? 400).json(sanitizeScanResult(result));
});

// Demo path: simulate a card tap by member id, for testing without hardware.
router.post('/attendance/simulate', (req, res) => {
  const { eventId, memberId } = req.body ?? {};
  if (!eventId || !memberId) {
    return res.status(400).json({ error: 'eventId and memberId are required' });
  }
  const result = simulateCheckIn(eventId, memberId);
  res.status(SCAN_STATUS_HTTP[result.status] ?? 400).json(sanitizeScanResult(result));
});

/* ---------- analytics ---------- */

router.get('/stats/overview', (req, res) => res.json(overview()));
router.get('/stats/member-growth', (req, res) => res.json(memberGrowth()));
router.get('/stats/attendance-trend', (req, res) => res.json(attendanceTrend()));
router.get('/stats/event-categories', (req, res) => res.json(eventCategories()));
router.get('/stats/branch-breakdown', (req, res) => res.json(branchBreakdown()));

export default router;
