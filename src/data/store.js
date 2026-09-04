/**
 * In-memory data store for the EIC dashboard.
 *
 * Generates a deterministic set of members, events and attendance records so
 * the analytics endpoints return stable numbers between restarts. POSTs to the
 * API mutate this store for the lifetime of the process (no database).
 */

const FIRST = ['Aarav', 'Diya', 'Vivaan', 'Ananya', 'Aditya', 'Ishaan', 'Saanvi',
  'Kabir', 'Myra', 'Reyansh', 'Anika', 'Arjun', 'Kiara', 'Vihaan', 'Riya',
  'Advik', 'Sara', 'Dhruv', 'Aisha', 'Rohan', 'Nisha', 'Karan', 'Tara', 'Neel'];
const LAST = ['Sharma', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Rao', 'Menon', 'Das',
  'Patel', 'Kumar', 'Bose', 'Chowdhury', 'Verma', 'Pillai', 'Joshi'];
const BRANCHES = ['CSE', 'ECE', 'MECH', 'CIVIL', 'MBA', 'DESIGN'];
const ROLES = ['Member', 'Member', 'Member', 'Core', 'Core', 'Lead'];
const EVENT_CATEGORIES = ['Workshop', 'Speaker Session', 'Pitch Night',
  'Hackathon', 'Networking', 'Bootcamp'];
const EVENT_TITLES = {
  Workshop: ['No-Code MVP Workshop', 'Financial Modelling 101', 'UX for Founders',
    'Growth Marketing Lab'],
  'Speaker Session': ['Fireside: Scaling a D2C Brand', 'From Campus to Series A',
    'Building in Public'],
  'Pitch Night': ['Semester Pitch Night', 'Investor Mock Pitch', 'Demo Day'],
  Hackathon: ['48-Hour Build Sprint', 'FinTech Hack', 'Social Impact Hack'],
  Networking: ['Founder Mixer', 'Alumni Connect', 'Mentor Speed-Dating'],
  Bootcamp: ['Pre-Incubation Bootcamp', 'Design Thinking Bootcamp'],
};

// Small seeded PRNG (mulberry32) for reproducible mock data.
function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20240828);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const intBetween = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// Separate PRNG stream for RFID tags so adding this feature doesn't shift
// the member/event generation that other stats already depend on.
const rfidRand = rng(20240902);
function genRfidTag() {
  let hex = '';
  for (let i = 0; i < 8; i++) hex += Math.floor(rfidRand() * 16).toString(16);
  return hex.toUpperCase();
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Anchor all generated dates on "today" so the dashboard always looks current.
const TODAY = new Date();
const MONTHS_HISTORY = 24;

function buildMembers(n) {
  const members = [];
  const start = new Date(TODAY);
  start.setMonth(start.getMonth() - MONTHS_HISTORY);
  for (let i = 0; i < n; i++) {
    const monthsOffset = intBetween(0, MONTHS_HISTORY);
    const joined = new Date(start);
    joined.setMonth(joined.getMonth() + monthsOffset);
    members.push({
      id: i + 1,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      branch: pick(BRANCHES),
      year: intBetween(1, 4),
      role: pick(ROLES),
      joinedAt: joined.toISOString().slice(0, 10),
      active: rand() > 0.22,
      rfid: genRfidTag(),
    });
  }
  return members;
}

function buildEvents(n, memberCount) {
  const events = [];
  // Spread events from ~22 months ago to ~1 month in the future.
  const start = new Date(TODAY);
  start.setMonth(start.getMonth() - (MONTHS_HISTORY - 2));
  const spanDays = (MONTHS_HISTORY - 1) * 30;
  for (let i = 0; i < n; i++) {
    const category = pick(EVENT_CATEGORIES);
    const date = new Date(start);
    date.setDate(date.getDate() + Math.round((i / n) * spanDays) + intBetween(-6, 6));
    const capacity = intBetween(30, 120);
    const registered = intBetween(Math.round(capacity * 0.5), capacity);
    const attended = intBetween(Math.round(registered * 0.55), registered);
    events.push({
      id: i + 1,
      title: pick(EVENT_TITLES[category]),
      category,
      date: date.toISOString().slice(0, 10),
      capacity,
      registered,
      attended,
      attendanceRate: +(attended / registered).toFixed(3),
      speaker: rand() > 0.5 ? `${pick(FIRST)} ${pick(LAST)}` : null,
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

const members = buildMembers(240);
const events = buildEvents(28, members.length);

// RFID check-ins for the "live meeting" scan feature — kept separate from
// each event's seeded registered/attended/attendanceRate (those describe
// historical attendance; check-ins are today's actual door-scan log).
const checkins = [];

export const db = { members, events, checkins };

/* ---------- analytics helpers ---------- */

export function overview() {
  const active = members.filter((m) => m.active).length;
  const now = new Date();
  const semesterAgo = new Date(now);
  semesterAgo.setMonth(now.getMonth() - 6);
  const recentEvents = events.filter((e) => new Date(e.date) >= semesterAgo);
  const avgAttendance =
    events.reduce((s, e) => s + e.attendanceRate, 0) / events.length;
  return {
    totalMembers: members.length,
    activeMembers: active,
    activeRate: +(active / members.length).toFixed(3),
    totalEvents: events.length,
    eventsThisSemester: recentEvents.length,
    avgAttendanceRate: +avgAttendance.toFixed(3),
    totalAttendance: events.reduce((s, e) => s + e.attended, 0),
  };
}

export function memberGrowth() {
  const byMonth = {};
  for (const m of members) {
    const k = m.joinedAt.slice(0, 7);
    byMonth[k] = (byMonth[k] || 0) + 1;
  }
  const months = Object.keys(byMonth).sort();
  let cumulative = 0;
  return months.map((month) => {
    cumulative += byMonth[month];
    return { month, joined: byMonth[month], total: cumulative };
  });
}

export function attendanceTrend() {
  return events.map((e) => ({
    date: e.date,
    title: e.title,
    attended: e.attended,
    registered: e.registered,
    rate: e.attendanceRate,
  }));
}

export function eventCategories() {
  const counts = {};
  for (const e of events) {
    counts[e.category] = counts[e.category] || { events: 0, attendance: 0 };
    counts[e.category].events += 1;
    counts[e.category].attendance += e.attended;
  }
  return Object.entries(counts).map(([category, v]) => ({ category, ...v }));
}

export function branchBreakdown() {
  const counts = {};
  for (const m of members) counts[m.branch] = (counts[m.branch] || 0) + 1;
  return Object.entries(counts)
    .map(([branch, count]) => ({ branch, count }))
    .sort((a, b) => b.count - a.count);
}

export function nextId(collection) {
  return collection.reduce((max, x) => Math.max(max, x.id), 0) + 1;
}

/** Add a member, assigning an RFID tag the same way seeded members get one. */
export function createMember({ name, branch, year, role }) {
  const member = {
    id: nextId(members),
    name: String(name),
    branch: String(branch).toUpperCase(),
    year: Number(year) || 1,
    role: role || 'Member',
    joinedAt: new Date().toISOString().slice(0, 10),
    active: true,
    rfid: genRfidTag(),
  };
  members.push(member);
  return member;
}

/** Strip the RFID tag before a member is sent over the public API. */
export function publicMember({ rfid, ...rest }) {
  return rest;
}

/* ---------- RFID attendance scanning ---------- */

/**
 * Record a door scan for a meeting/event.
 * `rfidTag` is whatever a USB RFID reader typed (it behaves as a keyboard —
 * types the card's UID then Enter), so it's matched case-insensitively.
 * Returns one of:
 *   { status: 'event-not-found' }
 *   { status: 'unknown-tag', tag }
 *   { status: 'duplicate', member, checkin }   — already scanned for this event
 *   { status: 'ok', member, checkin }
 */
export function scanCheckIn(eventId, rfidTag) {
  const event = events.find((e) => e.id === Number(eventId));
  if (!event) return { status: 'event-not-found' };

  const tag = String(rfidTag || '').trim().toUpperCase();
  const member = members.find((m) => m.rfid === tag);
  if (!tag || !member) return { status: 'unknown-tag', tag };

  const existing = checkins.find((c) => c.eventId === event.id && c.memberId === member.id);
  if (existing) return { status: 'duplicate', member, checkin: existing };

  const checkin = {
    id: nextId(checkins),
    eventId: event.id,
    memberId: member.id,
    memberName: member.name,
    branch: member.branch,
    scannedAt: new Date().toISOString(),
  };
  checkins.push(checkin);
  return { status: 'ok', member, checkin };
}

/**
 * Demo helper: check a member in by id instead of by scanned tag, so the
 * dashboard can simulate a card tap without physical RFID hardware. Looks
 * the member's own tag up server-side and reuses the normal scan path.
 */
export function simulateCheckIn(eventId, memberId) {
  const member = members.find((m) => m.id === Number(memberId));
  if (!member) return { status: 'unknown-member' };
  return scanCheckIn(eventId, member.rfid);
}

export function eventCheckins(eventId) {
  const id = Number(eventId);
  const event = events.find((e) => e.id === id);
  if (!event) return null;
  const rows = checkins
    .filter((c) => c.eventId === id)
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  return { event, count: rows.length, checkins: rows };
}

export { monthKey };
