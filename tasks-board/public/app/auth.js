// Sign-in. Only people on the board's list can view it; some of them can also edit.
(async () => {
  const A = window.SCRD_AUTH;
  const btn = document.getElementById('signin-btn');
  const back = document.getElementById('ed');
  const menu = document.getElementById('add-menu');
  const signOutItem = document.getElementById('m-signout');
  if (!A || !back) return;
  const { sb } = A;

  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v); }
    n.append(...kids.filter(Boolean));
    return n;
  };
  const signOut = async () => { await sb.auth.signOut(); location.reload(); };
  if (signOutItem) signOutItem.addEventListener('click', signOut);

  const lock = (card) => {
    back.classList.add('locked');
    back.replaceChildren(card);
    back.hidden = false;
  };

  const { data } = await sb.auth.getSession();
  const session = data.session;

  if (!session) {
    if (btn) btn.hidden = true;
    const email = el('input', { id: 'si-email', type: 'email', autocomplete: 'username', required: '', placeholder: 'name@stelco.com.mv' });
    const pass = el('input', { id: 'si-pass', type: 'password', autocomplete: 'current-password', required: '' });
    const msg = el('p', { class: 'ed-msg', role: 'status' });
    const go = el('button', { type: 'submit', class: 'ed-b primary', text: 'Sign in' });
    const form = el('form', { class: 'ed-card narrowc', novalidate: '', 'aria-labelledby': 'si-title' },
      el('div', { class: 'ed-top' },
        el('div', { class: 'si-brand' }),
        el('h2', { id: 'si-title', text: 'SCRD Operations Board' }),
        el('p', { class: 'ed-sub', text: 'Sign in with the account the board’s owner set up for you. On the office TV, sign in once and it stays signed in.' })),
      el('div', { class: 'ed-grid' },
        el('label', { class: 'ed-f wide', for: 'si-email' }, el('span', { class: 'ed-l', text: 'Email' }), email),
        el('label', { class: 'ed-f wide', for: 'si-pass' }, el('span', { class: 'ed-l', text: 'Password' }), pass)),
      msg,
      el('div', { class: 'ed-actions' }, el('div', { class: 'ed-left' }), el('div', { class: 'ed-right' }, go)));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!email.value.trim() || !pass.value) { msg.textContent = 'Enter your email and password.'; return; }
      go.disabled = true; msg.textContent = 'Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      if (error) {
        go.disabled = false;
        msg.textContent = /invalid/i.test(error.message) ? 'That email and password don’t match an account.'
          : /confirm/i.test(error.message) ? 'This account’s email isn’t confirmed yet. Ask the board’s owner to confirm it.'
          : 'Could not sign in: ' + error.message;
        return;
      }
      location.reload();
    });
    lock(form);
    email.focus();
    return;
  }

  const [member, editor] = await Promise.all([A.isMember(), A.isEditor()]);

  if (!member) {
    if (btn) btn.hidden = true;
    const out = el('button', { type: 'button', class: 'ed-b', text: 'Sign out' });
    out.addEventListener('click', signOut);
    lock(el('div', { class: 'ed-card narrowc', role: 'dialog', 'aria-labelledby': 'si-title' },
      el('div', { class: 'ed-top' }, el('h2', { id: 'si-title', text: 'No access to this board' }),
        el('p', { class: 'ed-sub', text: (session.user.email || 'This account') + ' is signed in but isn’t on the board’s list. Ask the board’s owner to add it, then reload.' })),
      el('div', { class: 'ed-actions' }, el('div', { class: 'ed-left' }), el('div', { class: 'ed-right' }, out))));
    return;
  }

  if (editor) {
    if (btn) btn.hidden = true;
    if (menu && !menu.querySelector('.signed-as')) {
      const who = el('div', { class: 'signed-as', text: 'Signed in as ' + (session.user.email || 'editor') });
      menu.prepend(who);
    }
    return;
  }

  // can view, not edit
  if (btn) {
    btn.hidden = false;
    btn.textContent = 'Sign out';
    btn.title = 'Signed in as ' + (session.user.email || 'viewer') + ' (view only)';
    btn.addEventListener('click', signOut);
  }
})();
