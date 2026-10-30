function showErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function hideErr(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

async function redirectIfLoggedIn() {
  try {
    const me = await API.get('/api/auth/me');
    if (me && me.user) window.location.href = '/dashboard';
  } catch (_) {}
}

function initLoginPage() {
  redirectIfLoggedIn();
  const form = document.getElementById('form');
  const btn = document.getElementById('submit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErr('err');
    btn.disabled = true;
    btn.textContent = 'Masuk…';
    try {
      await API.post('/api/auth/login', {
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
      });
      window.location.href = '/dashboard';
    } catch (err) {
      showErr('err', err.message);
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  });
}

function initRegisterPage() {
  redirectIfLoggedIn();
  const form = document.getElementById('form');
  const btn = document.getElementById('submit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErr('err');
    btn.disabled = true;
    btn.textContent = 'Membuat akun…';
    try {
      await API.post('/api/auth/register', {
        email: document.getElementById('email').value.trim(),
        username: document.getElementById('username').value.trim().toLowerCase(),
        password: document.getElementById('password').value
      });
      window.location.href = '/dashboard';
    } catch (err) {
      showErr('err', err.message);
      btn.disabled = false;
      btn.textContent = 'Buat Akun';
    }
  });
}