// Sign in and out. Anyone can view the board; only accounts on the editors list can change it.
(async () => {
  const A = window.SCRD_AUTH;
  const btn = document.getElementById('signin-btn');
  const back = document.getElementById('ed');
  const menu = document.getElementById('add-menu');
  const signOutItem = document.getElementById('m-signout');
  if (!A || !btn) return;
  const { sb } = A;

  const { data } = await sb.auth.getSession();
  const session = data.session;
  const editor = await A.isEditor();

  const signOut = async () => { await sb.auth.signOut(); location.reload(); };
  if (signOutItem) signOutItem.addEventListener('click', signOut);

  if (session && editor) {
    btn.hidden = true;
    if (menu && !menu.querySelector('.signed-as')) {
      const who = document.createElement('div');
      who.className = 'signed-as';
      who.textContent = 'Signed in as ' + (session.user.email || 'editor');
      menu.prepend(who);
    }
    return;
  }

  btn.hidden = false;
  if (session) {
    // signed in, but this account is not on the editors list
    btn.textContent = 'Sign out';
    btn.title = (session.user.email || 'This account') + ' can view the board but not change it.';
    btn.addEventListener('click', signOut);
    return;
  }

  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
    n.append(...kids.filter(Boolean));
    return n;
  };

  const open = () => {
    const email = el('input', { id: 'si-email', type: 'email', autocomplete: 'username', required: '', placeholder: 'name@stelco.com.mv' });
    const pass = el('input', { id: 'si-pass', type: 'password', autocomplete: 'current-password', required: '' });
    const msg = el('p', { class: 'ed-msg', role: 'status' });
    const go = el('button', { type: 'submit', class: 'ed-b primary', text: 'Sign in' });
    const cancel = el('button', { type: 'button', class: 'ed-b', text: 'Cancel' });
    const close = () => { back.hidden = true; back.replaceChildren(); btn.focus(); };
    cancel.addEventListener('click', close);
    const form = el('form', { class: 'ed-card narrowc', novalidate: '', 'aria-labelledby': 'si-title' },
      el('div', { class: 'ed-top' }, el('h2', { id: 'si-title', text: 'Sign in to edit' }),
        el('p', { class: 'ed-sub', text: 'Viewing needs no sign-in. Editors use the account the board’s owner set up for them.' })),
      el('div', { class: 'ed-grid' },
        el('label', { class: 'ed-f wide', for: 'si-email' }, el('span', { class: 'ed-l', text: 'Email' }), email),
        el('label', { class: 'ed-f wide', for: 'si-pass' }, el('span', { class: 'ed-l', text: 'Password' }), pass)),
      msg,
      el('div', { class: 'ed-actions' }, el('div', { class: 'ed-left' }), el('div', { class: 'ed-right' }, cancel, go)));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!email.value.trim() || !pass.value) { msg.textContent = 'Enter your email and password.'; return; }
      go.disabled = true; msg.textContent = 'Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      if (error) { go.disabled = false; msg.textContent = /invalid/i.test(error.message) ? 'That email and password don’t match an account.' : 'Could not sign in: ' + error.message; return; }
      location.reload();
    });
    back.addEventListener('click', (e) => { if (e.target === back) close(); }, { once: true });
    back.replaceChildren(form);
    back.hidden = false;
    email.focus();
  };
  btn.addEventListener('click', open);
})();
