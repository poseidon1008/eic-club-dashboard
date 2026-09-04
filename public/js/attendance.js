/* Attendance scan page — RFID check-in for a meeting.
 *
 * A USB RFID reader behaves as a keyboard: it "types" the card's UID into
 * whatever input is focused, then sends Enter. So the whole "integration"
 * is just: keep a text input focused, and on Enter POST what's in it. The
 * simulate-tap panel exists so the flow can be demoed without a reader.
 */

const $ = (sel) => document.querySelector(sel);
const api = (path, opts) => fetch(`/api${path}`, opts).then(async (r) => {
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
});

let events = [];
let members = [];
let currentEventId = null;

function pickDefaultEvent(list) {
  const today = new Date().toISOString().slice(0, 10);
  const past = list.filter((e) => e.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  if (past.length) return past[0].id;
  const upcoming = [...list].sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0]?.id ?? null;
}

function populateEventSelect() {
  const sel = $('#eventSelect');
  sel.innerHTML = events
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => `<option value="${e.id}">${e.date} — ${e.title}</option>`)
    .join('');
  sel.value = currentEventId;
}

function populateMemberPicker() {
  $('#memberPicker').innerHTML = members
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => `<option value="${m.id}">${m.name} — ${m.branch}</option>`)
    .join('');
}

function focusScanInput() {
  $('#scanInput').focus();
}

function showToast(kind, text) {
  const toast = $('#toast');
  toast.innerHTML = `<div class="toast toast-${kind}">${text}</div>`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.innerHTML = ''; }, 4000);
}

function renderCheckins(data) {
  $('#checkinCount').textContent = data.count;
  $('#checkinList').innerHTML = data.checkins.length
    ? data.checkins.map((c) => `
        <div class="checkin-row">
          <div class="who">
            <span class="name">${c.memberName}</span>
            <span class="muted">${c.branch}</span>
          </div>
          <span class="time">${new Date(c.scannedAt).toLocaleTimeString()}</span>
        </div>`).join('')
    : '<p class="muted">No one checked in for this meeting yet.</p>';
}

async function loadCheckins() {
  const { body } = await api(`/attendance/${currentEventId}`);
  renderCheckins(body);
}

async function handleScanResult(result) {
  const { body } = result;
  if (body.status === 'ok') {
    showToast('ok', `✅ Checked in: <strong>${body.member.name}</strong> (${body.member.branch})`);
  } else if (body.status === 'duplicate') {
    showToast('dup', `⚠️ ${body.member.name} already checked in for this meeting.`);
  } else if (body.status === 'unknown-tag') {
    showToast('err', `❌ Unrecognized card${body.tag ? ` (${body.tag})` : ''}.`);
  } else {
    showToast('err', `❌ ${body.error || 'Scan failed.'}`);
  }
  await loadCheckins();
}

$('#scanInput').addEventListener('keydown', async (ev) => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  const rfidTag = ev.target.value.trim();
  ev.target.value = '';
  if (!rfidTag || !currentEventId) return;
  const result = await api('/attendance/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: currentEventId, rfidTag }),
  });
  await handleScanResult(result);
});

// Keep the scan input focused so a reader's keystrokes always land there,
// even if someone clicks elsewhere on the page (but not while picking from
// the event/member dropdowns, or typing in the search-style scan field).
document.addEventListener('click', (ev) => {
  if (ev.target.closest('select, button')) return;
  focusScanInput();
});

$('#eventSelect').addEventListener('change', async (ev) => {
  currentEventId = Number(ev.target.value);
  await loadCheckins();
  focusScanInput();
});

$('#simulateBtn').addEventListener('click', async () => {
  const memberId = Number($('#memberPicker').value);
  if (!memberId || !currentEventId) return;
  const result = await api('/attendance/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: currentEventId, memberId }),
  });
  await handleScanResult(result);
  focusScanInput();
});

async function init() {
  const [eventsRes, membersRes] = await Promise.all([
    fetch('/api/events').then((r) => r.json()),
    fetch('/api/members').then((r) => r.json()),
  ]);
  events = eventsRes.events;
  members = membersRes.members;
  currentEventId = pickDefaultEvent(events);

  populateEventSelect();
  populateMemberPicker();
  await loadCheckins();
  focusScanInput();

  $('#lastUpdated').textContent = `updated ${new Date().toLocaleTimeString()}`;
}

init().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin',
    `<p style="color:#dc2626;padding:1rem">Failed to load attendance page: ${err.message}</p>`);
});
