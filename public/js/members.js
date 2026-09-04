/* Members directory page — list/search/filter + add a member. */

const $ = (sel) => document.querySelector(sel);
const api = (path, opts) => fetch(`/api${path}`, opts).then((r) => {
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
});

let allMembers = [];

function populateFilterOptions() {
  const branches = [...new Set(allMembers.map((m) => m.branch))].sort();
  const roles = [...new Set(allMembers.map((m) => m.role))].sort();
  const branchSel = $('#branchFilter');
  const roleSel = $('#roleFilter');
  const keepBranch = branchSel.value;
  const keepRole = roleSel.value;
  branchSel.length = 1;
  branches.forEach((b) => branchSel.add(new Option(b, b)));
  branchSel.value = keepBranch;
  roleSel.length = 1;
  roles.forEach((r) => roleSel.add(new Option(r, r)));
  roleSel.value = keepRole;
}

function renderTable() {
  const q = $('#searchBox').value.trim().toLowerCase();
  const branch = $('#branchFilter').value;
  const role = $('#roleFilter').value;
  const active = $('#activeFilter').value;

  const rows = allMembers.filter((m) => {
    if (q && !m.name.toLowerCase().includes(q)) return false;
    if (branch && m.branch !== branch) return false;
    if (role && m.role !== role) return false;
    if (active === 'true' && !m.active) return false;
    if (active === 'false' && m.active) return false;
    return true;
  });

  $('#resultCount').textContent = `${rows.length} of ${allMembers.length} members`;
  $('#membersTable tbody').innerHTML = rows.map((m) => `
    <tr>
      <td>${m.name}</td>
      <td>${m.branch}</td>
      <td>${m.year}</td>
      <td>${m.role}</td>
      <td>${m.joinedAt}</td>
      <td>${m.active
        ? '<span class="badge badge-ok">Active</span>'
        : '<span class="badge badge-err">Inactive</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="6">No matching members</td></tr>';
}

async function loadMembers() {
  const { members } = await api('/members');
  allMembers = members;
  populateFilterOptions();
  renderTable();
  $('#lastUpdated').textContent = `updated ${new Date().toLocaleTimeString()}`;
}

['input', 'change'].forEach((evt) => {
  $('#searchBox').addEventListener(evt, renderTable);
  $('#branchFilter').addEventListener('change', renderTable);
  $('#roleFilter').addEventListener('change', renderTable);
  $('#activeFilter').addEventListener('change', renderTable);
});

$('#memberForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const body = Object.fromEntries(new FormData(form));
  try {
    const created = await api('/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    $('#formMsg').textContent = `Added "${created.name}" (id ${created.id}).`;
    form.reset();
    await loadMembers();
  } catch (err) {
    $('#formMsg').textContent = `Error: ${err.message}`;
  }
});

loadMembers().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin',
    `<p style="color:#dc2626;padding:1rem">Failed to load members: ${err.message}</p>`);
});
