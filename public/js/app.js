/* EIC dashboard front end — vanilla JS, talks to the /api REST endpoints. */

const $ = (sel) => document.querySelector(sel);
const api = (path, opts) => fetch(`/api${path}`, opts).then((r) => {
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
});

const BRAND = '#2563eb';
const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];
const charts = {};

function renderKpis(o) {
  const cards = [
    { label: 'Total members', value: o.totalMembers, sub: `${o.activeMembers} active` },
    { label: 'Active rate', value: `${Math.round(o.activeRate * 100)}%` },
    { label: 'Events run', value: o.totalEvents, sub: `${o.eventsThisSemester} this semester` },
    { label: 'Avg attendance', value: `${Math.round(o.avgAttendanceRate * 100)}%` },
    { label: 'Total attendance', value: o.totalAttendance.toLocaleString() },
  ];
  $('#kpis').innerHTML = cards.map((c) => `
    <div class="kpi">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      ${c.sub ? `<div class="sub">${c.sub}</div>` : ''}
    </div>`).join('');
}

function lineChart(id, labels, datasets) {
  charts[id]?.destroy();
  charts[id] = new Chart($(`#${id}`), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { display: datasets.length > 1 } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function doughnut(id, labels, values) {
  charts[id]?.destroy();
  charts[id] = new Chart($(`#${id}`), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: PALETTE }] },
    options: { responsive: true, plugins: { legend: { position: 'right' } } },
  });
}

function barChart(id, labels, values) {
  charts[id]?.destroy();
  charts[id] = new Chart($(`#${id}`), {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: BRAND }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
}

function renderEventsTable(events) {
  const rows = events.map((e) => {
    const rate = Math.round(e.rate * 100);
    const cls = rate >= 75 ? 'rate-good' : 'rate-warn';
    return `<tr>
      <td>${e.date}</td><td>${e.title}</td><td>${e.category}</td>
      <td>${e.registered}</td><td>${e.attended}</td>
      <td class="${cls}">${e.rate ? rate + '%' : '—'}</td>
    </tr>`;
  }).join('');
  $('#eventsTable tbody').innerHTML = rows || '<tr><td colspan="6">No events</td></tr>';
}

async function loadEvents() {
  const category = $('#categoryFilter').value;
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  const list = await api(`/events${q}`);
  renderEventsTable(list.events.map((e) => ({ ...e, rate: e.attendanceRate })));
}

async function init() {
  const [overview, growth, trend, cats, branches, eventList] = await Promise.all([
    api('/stats/overview'),
    api('/stats/member-growth'),
    api('/stats/attendance-trend'),
    api('/stats/event-categories'),
    api('/stats/branch-breakdown'),
    api('/events'),
  ]);

  renderKpis(overview);

  lineChart('growthChart', growth.map((g) => g.month), [{
    label: 'Total members', data: growth.map((g) => g.total),
    borderColor: BRAND, backgroundColor: 'rgba(37,99,235,.12)', fill: true, tension: .3,
  }]);

  lineChart('attendanceChart', trend.map((t) => t.date), [{
    label: 'Attendance rate', data: trend.map((t) => Math.round(t.rate * 100)),
    borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.12)', fill: true, tension: .3,
  }]);

  doughnut('categoryChart', cats.map((c) => c.category), cats.map((c) => c.events));
  barChart('branchChart', branches.map((b) => b.branch), branches.map((b) => b.count));

  const filter = $('#categoryFilter');
  const selected = filter.value;
  filter.length = 1; // keep the "All categories" option, drop the rest
  [...new Set(eventList.events.map((e) => e.category))].sort().forEach((c) => {
    filter.add(new Option(c, c));
  });
  filter.value = selected;
  filter.removeEventListener('change', loadEvents);
  filter.addEventListener('change', loadEvents);
  renderEventsTable(eventList.events.map((e) => ({ ...e, rate: e.attendanceRate })));

  $('#lastUpdated').textContent = `updated ${new Date().toLocaleTimeString()}`;
}

$('#eventForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const body = Object.fromEntries(new FormData(form));
  try {
    const created = await api('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    $('#formMsg').textContent = `Created "${created.title}" (id ${created.id}). Reloading…`;
    form.reset();
    await init();
  } catch (err) {
    $('#formMsg').textContent = `Error: ${err.message}`;
  }
});

init().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin',
    `<p style="color:#dc2626;padding:1rem">Failed to load dashboard: ${err.message}</p>`);
});
