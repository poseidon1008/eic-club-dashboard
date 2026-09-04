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
  res.json({ count: rows.length, members: rows });
});

router.post('/members', (req, res) => {
  const { name, branch, year, role } = req.body ?? {};
  if (!name || !branch) {
    return res.status(400).json({ error: 'name and branch are required' });
  }
  const member = {
    id: nextId(db.members),
    name: String(name),
    branch: String(branch).toUpperCase(),
    year: Number(year) || 1,
    role: role || 'Member',
    joinedAt: new Date().toISOString().slice(0, 10),
    active: true,
  };
  db.members.push(member);
  res.status(201).json(member);
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

/* ---------- analytics ---------- */

router.get('/stats/overview', (req, res) => res.json(overview()));
router.get('/stats/member-growth', (req, res) => res.json(memberGrowth()));
router.get('/stats/attendance-trend', (req, res) => res.json(attendanceTrend()));
router.get('/stats/event-categories', (req, res) => res.json(eventCategories()));
router.get('/stats/branch-breakdown', (req, res) => res.json(branchBreakdown()));

export default router;
