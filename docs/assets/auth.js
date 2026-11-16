/* Login (Supabase Auth). Menyediakan window.DashAuth = { sb, ready }.
   `ready` selesai setelah pengguna login; app.js & susut.js menunggunya sebelum memuat data. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const cfg = window.DASH_CONFIG;
  const sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
  let done;
  const ready = new Promise((r) => (done = r));
  window.DashAuth = { sb, ready };

  function enter(session) {
    $('login').hidden = true;
    document.body.classList.add('authed');
    $('userMail').textContent = session.user.email || '';
    done(session);
  }

  function bindForm() {
    $('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('loginBtn'), err = $('loginErr');
      err.textContent = ''; btn.disabled = true; btn.textContent = 'Masuk…';
      const { data, error } = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPass').value });
      btn.disabled = false; btn.textContent = 'Masuk';
      if (error) {
        err.textContent = /invalid login/i.test(error.message) ? 'Email atau kata sandi salah.' : 'Tidak dapat masuk: ' + error.message;
        return;
      }
      enter(data.session);
    };
    $('logoutBtn').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  }

  async function init() {
    bindForm();
    $('loading').classList.add('hide');   // jangan tampilkan "Memuat" di atas formulir login
    const { data } = await sb.auth.getSession();
    if (data.session) { enter(data.session); $('loading').classList.remove('hide'); }
    else { $('login').hidden = false; $('loginEmail').focus(); }
  }
  init();
})();
