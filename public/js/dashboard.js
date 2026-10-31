let state = { user: null, sites: [], limits: { max: 3, used: 0 } };
let selectedFiles = [];
let ghConnected = false;
let ghUsername = null;
let ghRepos = [];
let ghSelectedRepo = null;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function hideErr(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

async function initDashboard() {
  try {
    const me = await API.get('/api/auth/me');
    state.user = me.user;
    document.getElementById('username-display').textContent = me.user.username;
  } catch (_) {
    window.location.href = '/login';
    return;
  }
  bindEvents();
  await loadSites();
  handleGithubRedirect();
}

function handleGithubRedirect() {
  const params = new URLSearchParams(window.location.search);
  const gh = params.get('github');
  if (!gh) return;
  if (gh === 'connected') toast('GitHub berhasil terhubung', 'success');
  else if (gh === 'error') toast('Gagal menghubungkan GitHub', 'error');
  params.delete('github');
  const clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  window.history.replaceState({}, '', clean);
}

async function checkGitHubStatus() {
  try {
    const data = await API.get('/api/github/status');
    ghConnected = !!data.connected;
    ghUsername = data.github_user || null;
  } catch (_) {
    ghConnected = false;
    ghUsername = null;
  }
}

function bindEvents() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await API.post('/api/auth/logout');
    window.location.href = '/';
  });

  document.getElementById('new-site-btn').addEventListener('click', () => {
    openModal('modal-create');
    document.getElementById('create-name').value = '';
    document.getElementById('create-sub').value = '';
    hideErr('create-err');
    setTimeout(() => document.getElementById('create-name').focus(), 50);
  });

  document.getElementById('create-cancel').addEventListener('click', () => closeModal('modal-create'));
  document.getElementById('create-form').addEventListener('submit', onCreateSite);

  document.getElementById('deploy-cancel').addEventListener('click', () => {
    closeModal('modal-deploy');
    selectedFiles = [];
    renderFileList();
  });
  document.getElementById('deploy-form').addEventListener('submit', onDeploy);

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('hidden', p.getAttribute('data-panel') !== target);
      });
      hideErr('deploy-err');
      if (target === 'repos') refreshReposPanel();
    });
  });

  document.getElementById('github-form').addEventListener('submit', onGitHubImport);
  document.getElementById('github-cancel').addEventListener('click', () => closeModal('modal-deploy'));

  const reposCancel = document.getElementById('repos-cancel');
  if (reposCancel) reposCancel.addEventListener('click', () => closeModal('modal-deploy'));
  const reposCancelDisc = document.getElementById('repos-cancel-disconnected');
  if (reposCancelDisc) reposCancelDisc.addEventListener('click', () => closeModal('modal-deploy'));
  const reposDeploy = document.getElementById('repos-deploy');
  if (reposDeploy) reposDeploy.addEventListener('click', onDeployFromRepos);
  const reposSearch = document.getElementById('repos-search');
  if (reposSearch) reposSearch.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = q ? ghRepos.filter((r) => r.full_name.toLowerCase().includes(q)) : ghRepos;
    renderReposList(filtered);
  });
  const ghDisconnect = document.getElementById('gh-disconnect');
  if (ghDisconnect) ghDisconnect.addEventListener('click', onDisconnectGithub);

  const dz = document.getElementById('dropzone');
  const fi = document.getElementById('file-input');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag');
    selectedFiles = Array.from(e.dataTransfer.files);
    renderFileList();
  });
  fi.addEventListener('change', () => {
    selectedFiles = Array.from(fi.files);
    renderFileList();
  });

  document.getElementById('create-sub').addEventListener('input', (e) => {
    e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  });
}

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

async function loadSites() {
  try {
    const data = await API.get('/api/sites');
    state.sites = data.sites;
    state.limits = data.limits;
    renderSites();
    renderStats();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderStats() {
  document.getElementById('stat-sites').textContent = state.sites.length;
  document.getElementById('stat-plan').textContent = (state.user.plan || 'free').toUpperCase();
  document.getElementById('stat-slots').textContent = Math.max(0, state.limits.max - state.limits.used);
  const maintEl = document.getElementById('stat-maint');
  if (maintEl) maintEl.textContent = state.sites.filter((s) => s.maintenance).length;
}

function renderSites() {
  const c = document.getElementById('site-list-container');
  if (!state.sites.length) {
    c.innerHTML = `
      <div class="empty">
        <h3>Belum ada situs</h3>
        <p>Buat situs pertamamu untuk mulai deploy.</p>
        <button class="btn btn-primary" onclick="document.getElementById('new-site-btn').click()">+ Situs Baru</button>
      </div>`;
    return;
  }
  const list = document.createElement('div');
  list.className = 'site-list';
  for (const s of state.sites) {
    const item = document.createElement('div');
    item.className = 'site-item';
    const statusClass = s.status === 'active' ? 'badge-active' : 'badge-paused';
    const lastDeploy = s.last_deploy_at
      ? new Date(Number(s.last_deploy_at)).toLocaleString('id-ID')
      : 'Belum ada';
    const maintBadge = s.maintenance ? '<span class="badge badge-maintenance">maintenance</span>' : '';
    const originBadge = s.custom_origin ? '<span class="badge badge-active">origin</span>' : '';
    const dnsBadge = s.dns_target ? '<span class="badge badge-active">dns</span>' : '';
    item.innerHTML = `
      <div class="site-info">
        <div class="site-name">
          ${esc(s.name)}
          <span class="badge ${statusClass}">${esc(s.status)}</span>
          ${maintBadge}
          ${originBadge}
          ${dnsBadge}
        </div>
        <a class="site-url" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>
        <div class="site-meta">${s.deploy_count} deploy · Terakhir: ${esc(lastDeploy)}</div>
      </div>
      <div class="site-actions">
        <button class="btn btn-secondary btn-sm" data-action="deploy" data-id="${s.id}">Deploy</button>
        <button class="btn btn-secondary btn-sm" data-action="maintenance" data-id="${s.id}" data-maint="${s.maintenance ? '1' : '0'}">${s.maintenance ? 'Maint OFF' : 'Maint ON'}</button>
        <button class="btn btn-secondary btn-sm" data-action="origin" data-id="${s.id}">Origin</button>
        <button class="btn btn-secondary btn-sm" data-action="dns" data-id="${s.id}">DNS</button>
        <button class="btn btn-secondary btn-sm" data-action="toggle" data-id="${s.id}" data-status="${s.status}">${s.status === 'active' ? 'Pause' : 'Aktifkan'}</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${s.id}">Hapus</button>
      </div>`;
    list.appendChild(item);
  }
  c.innerHTML = '';
  c.appendChild(list);

  list.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      const id = parseInt(btn.getAttribute('data-id'), 10);
      if (action === 'deploy') openDeploy(id);
      else if (action === 'maintenance') toggleMaintenance(id, btn.getAttribute('data-maint'));
      else if (action === 'origin') openOriginModal(id);
      else if (action === 'dns') openDnsModal(id);
      else if (action === 'toggle') toggleSite(id, btn.getAttribute('data-status'));
      else if (action === 'delete') deleteSite(id);
    });
  });
}

function openOriginModal(siteId) {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site) return;
  const current = site.custom_origin || '';
  const url = prompt(
    'Masukkan URL project Vercel kamu (contoh: https://myproject.vercel.app).\nKosongkan untuk hapus origin.',
    current
  );
  if (url === null) return;
  const trimmed = url.trim();
  API.patch(`/api/sites/${siteId}`, { custom_origin: trimmed || null })
    .then(() => {
      toast(trimmed ? 'Origin terhubung' : 'Origin dihapus', 'success');
      loadSites();
    })
    .catch((err) => toast(err.message, 'error'));
}

function openDnsModal(siteId) {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site) return;

  const currentTarget = site.dns_target || '';

  const target = prompt(
    'CNAME Target dari Vercel.\n' +
    'Contoh: abc123.vercel-dns-017.com\n' +
    'Kosongkan untuk hapus semua record.',
    currentTarget
  );
  if (target === null) return;
  const trimmedTarget = target.trim();

  if (!trimmedTarget) {
    if (!confirm('Hapus semua record DNS untuk ' + site.subdomain + '.fastdev.my.id?')) return;
    API.del(`/api/sites/${siteId}/dns`)
      .then(() => { toast('Record DNS dihapus', 'success'); loadSites(); })
      .catch((err) => toast(err.message, 'error'));
    return;
  }

  const txtInput = prompt(
    'TXT Value dari Vercel (untuk verifikasi ownership).\n' +
    'Kalau Vercel gak minta TXT, kosongkan aja.\n' +
    'Contoh: vc-domain-verify=' + site.subdomain + '.fastdev.my.id,5700fc845b49e61ac2bf',
    ''
  );
  if (txtInput === null) return;
  const trimmedTxt = txtInput.trim();

  API.post(`/api/sites/${siteId}/dns`, { target: trimmedTarget, txt_value: trimmedTxt || null })
    .then(() => {
      toast(trimmedTxt ? 'CNAME + TXT berhasil dibuat. Klik Verify di Vercel.' : 'CNAME berhasil dibuat.', 'success');
      loadSites();
    })
    .catch((err) => toast(err.message, 'error'));
}

async function onCreateSite(e) {
  e.preventDefault();
  hideErr('create-err');
  const name = document.getElementById('create-name').value.trim();
  const sub = document.getElementById('create-sub').value.trim().toLowerCase();
  const btn = document.getElementById('create-submit');
  btn.disabled = true;
  btn.textContent = 'Membuat…';
  try {
    await API.post('/api/sites', { name, subdomain: sub });
    closeModal('modal-create');
    toast('Situs berhasil dibuat', 'success');
    await loadSites();
  } catch (err) {
    showErr('create-err', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Buat';
  }
}

function openDeploy(siteId) {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site) return;
  document.getElementById('deploy-site-id').value = siteId;
  document.getElementById('deploy-sub').textContent = `Deploy ke ${site.url}`;
  document.getElementById('file-input').value = '';
  document.getElementById('github-repo').value = '';
  document.getElementById('github-branch').value = '';
  selectedFiles = [];
  ghSelectedRepo = null;
  renderFileList();
  hideErr('deploy-err');
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.getAttribute('data-tab') === 'upload'));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.getAttribute('data-panel') !== 'upload'));
  openModal('modal-deploy');
}

function renderFileList() {
  const el = document.getElementById('file-list');
  if (!selectedFiles.length) { el.innerHTML = ''; return; }
  el.innerHTML = selectedFiles
    .map((f) => `• ${esc(f.name)} <span style="color:var(--text-faint)">(${fmtBytes(f.size)})</span>`)
    .join('<br>');
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const b64 = String(result).split(',')[1] || '';
      resolve(b64);
    };
    reader.onerror = () => reject(new Error('Gagal baca file'));
    reader.readAsDataURL(file);
  });
}

async function onDeploy(e) {
  e.preventDefault();
  hideErr('deploy-err');
  const siteId = document.getElementById('deploy-site-id').value;
  if (!selectedFiles.length) {
    showErr('deploy-err', 'Pilih file terlebih dahulu');
    return;
  }
  const btn = document.getElementById('deploy-submit');
  btn.disabled = true;
  btn.textContent = 'Deploying…';

  try {
    const payload = [];
    for (const f of selectedFiles) {
      const content = await readFileAsBase64(f);
      payload.push({ path: f.webkitRelativePath || f.name, content });
    }
    const res = await API.post(`/api/sites/${siteId}/deploy`, { files: payload });
    closeModal('modal-deploy');
    toast(`Deploy v${res.deployment.version} sukses`, 'success');
    await loadSites();
  } catch (err) {
    showErr('deploy-err', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Deploy';
  }
}

async function onGitHubImport(e) {
  e.preventDefault();
  hideErr('deploy-err');
  const siteId = document.getElementById('deploy-site-id').value;
  const repo = document.getElementById('github-repo').value.trim();
  const branch = document.getElementById('github-branch').value.trim();

  if (!repo) {
    showErr('deploy-err', 'URL repo wajib diisi');
    return;
  }

  const btn = document.getElementById('github-submit');
  btn.disabled = true;
  btn.textContent = 'Mengambil…';

  try {
    const res = await API.post(`/api/sites/${siteId}/import-github`, { repo, branch });
    closeModal('modal-deploy');
    toast(`Deploy v${res.deployment.version} dari GitHub sukses`, 'success');
    await loadSites();
  } catch (err) {
    showErr('deploy-err', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import & Deploy';
  }
}

async function refreshReposPanel() {
  await checkGitHubStatus();
  const notConn = document.getElementById('gh-not-connected');
  const conn = document.getElementById('gh-connected');
  if (!notConn || !conn) return;
  if (!ghConnected) {
    notConn.classList.remove('hidden');
    conn.classList.add('hidden');
    return;
  }
  notConn.classList.add('hidden');
  conn.classList.remove('hidden');
  document.getElementById('gh-username').textContent = '@' + ghUsername;
  await loadReposList();
}

async function loadReposList() {
  const listEl = document.getElementById('repos-list');
  listEl.innerHTML = '<div style="padding:24px;text-align:center"><p style="font-size:12px;color:var(--text-faint)">Memuat...</p></div>';
  document.getElementById('repos-deploy').disabled = true;
  ghSelectedRepo = null;

  try {
    const data = await API.get('/api/github/repos');
    ghRepos = data.repos || [];
    document.getElementById('repos-search').value = '';
    renderReposList(ghRepos);
  } catch (err) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center"><p style="font-size:12px;color:#ff8888">${esc(err.message)}</p></div>`;
  }
}

function renderReposList(repos) {
  const listEl = document.getElementById('repos-list');
  if (!repos.length) {
    listEl.innerHTML = '<div style="padding:24px;text-align:center"><p style="font-size:12px;color:var(--text-faint)">Tidak ada repo</p></div>';
    return;
  }
  listEl.innerHTML = repos.map((r) => {
    const isSelected = ghSelectedRepo && ghSelectedRepo.full_name === r.full_name;
    return `
      <div class="repo-item ${isSelected ? 'selected' : ''}" data-repo="${esc(r.full_name)}">
        <div class="repo-name">${esc(r.full_name)}</div>
        <div class="repo-meta">
          ${r.private ? '<span class="repo-private">Private</span>' : '<span>Public</span>'}
          <span>·</span>
          <span>${esc(r.default_branch)}</span>
          ${r.language ? `<span>·</span><span>${esc(r.language)}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.repo-item').forEach((el) => {
    el.addEventListener('click', () => {
      const name = el.getAttribute('data-repo');
      ghSelectedRepo = repos.find((r) => r.full_name === name) || null;
      listEl.querySelectorAll('.repo-item').forEach((x) => x.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('repos-deploy').disabled = !ghSelectedRepo;
    });
  });
}

async function onDeployFromRepos() {
  if (!ghSelectedRepo) return;
  hideErr('deploy-err');
  const siteId = document.getElementById('deploy-site-id').value;
  const btn = document.getElementById('repos-deploy');
  btn.disabled = true;
  btn.textContent = 'Deploying…';

  try {
    const res = await API.post(`/api/sites/${siteId}/import-github-oauth`, {
      repo: ghSelectedRepo.full_name,
      branch: ghSelectedRepo.default_branch
    });
    closeModal('modal-deploy');
    toast(`Deploy v${res.deployment.version} dari ${ghSelectedRepo.full_name} sukses`, 'success');
    await loadSites();
  } catch (err) {
    showErr('deploy-err', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Deploy';
  }
}

async function onDisconnectGithub() {
  if (!confirm('Disconnect GitHub? Kamu harus authorize lagi untuk deploy dari repo.')) return;
  try {
    await API.post('/api/github/disconnect');
    toast('GitHub disconnected', 'success');
    ghConnected = false;
    ghUsername = null;
    ghRepos = [];
    ghSelectedRepo = null;
    refreshReposPanel();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function toggleMaintenance(id, currentMaint) {
  const isOn = currentMaint === '1';
  try {
    await API.patch(`/api/sites/${id}`, { maintenance: !isOn });
    toast(!isOn ? 'Maintenance mode AKTIF' : 'Maintenance mode NONAKTIF', 'success');
    await loadSites();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function toggleSite(id, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'paused' : 'active';
  try {
    await API.patch(`/api/sites/${id}`, { status: newStatus });
    toast(newStatus === 'active' ? 'Situs diaktifkan' : 'Situs dijeda', 'success');
    await loadSites();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteSite(id) {
  if (!confirm('Yakin hapus situs ini? Semua file akan hilang permanen.')) return;
  try {
    await API.del(`/api/sites/${id}`);
    toast('Situs dihapus', 'success');
    await loadSites();
  } catch (err) {
    toast(err.message, 'error');
  }
}