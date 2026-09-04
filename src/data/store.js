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

export const db = { members, events };

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

export { monthKey };
