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
  const link = window.SCRD_LINK || {};
  const cleanUrl = () => { try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ } };

  // Arrived from an invite or password-reset email: choose a password first
  if (session && /^(invite|recovery|signup|magiclink)$/.test(link.type)) {
    if (btn) btn.hidden = true;
    const p1 = el('input', { id: 'np-1', type: 'password', autocomplete: 'new-password', required: '', minlength: '8' });
    const p2 = el('input', { id: 'np-2', type: 'password', autocomplete: 'new-password', required: '', minlength: '8' });
    const msg = el('p', { class: 'ed-msg', role: 'status' });
    const go = el('button', { type: 'submit', class: 'ed-b primary', text: 'Save password' });
    const form = el('form', { class: 'ed-card narrowc', novalidate: '', 'aria-labelledby': 'np-title' },
      el('div', { class: 'ed-top' }, el('div', { class: 'si-brand' }),
        el('h2', { id: 'np-title', text: link.type === 'recovery' ? 'Choose a new password' : 'Welcome to the SCRD board' }),
        el('p', { class: 'ed-sub', text: 'Set a password for ' + (session.user.email || 'your account') + '. You’ll use it to sign in from now on.' })),
      el('div', { class: 'ed-grid' },
        el('label', { class: 'ed-f wide', for: 'np-1' }, el('span', { class: 'ed-l', text: 'New password' }), p1, el('span', { class: 'ed-h', text: 'At least 8 characters' })),
        el('label', { class: 'ed-f wide', for: 'np-2' }, el('span', { class: 'ed-l', text: 'Type it again' }), p2)),
      msg,
      el('div', { class: 'ed-actions' }, el('div', { class: 'ed-left' }), el('div', { class: 'ed-right' }, go)));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (p1.value.length < 8) { msg.textContent = 'Use at least 8 characters.'; return; }
      if (p1.value !== p2.value) { msg.textContent = 'The two passwords don’t match.'; return; }
      go.disabled = true; msg.textContent = 'Saving…';
      const { error } = await sb.auth.updateUser({ password: p1.value });
      if (error) { go.disabled = false; msg.textContent = 'Could not save the password: ' + error.message; return; }
      cleanUrl(); location.reload();
    });
    lock(form); p1.focus();
    return;
  }

  if (!session) {
    if (btn) btn.hidden = true;
    const email = el('input', { id: 'si-email', type: 'email', autocomplete: 'username', required: '', placeholder: 'name@stelco.com.mv' });
    const pass = el('input', { id: 'si-pass', type: 'password', autocomplete: 'current-password', required: '' });
    const msg = el('p', { class: 'ed-msg', role: 'status' });
    if (link.error) { msg.textContent = /expired|invalid/i.test(link.error) ? 'That email link has expired or was already used. Ask the board’s owner to send a new one, or use “Forgot password?”.' : link.error; cleanUrl(); }
    const go = el('button', { type: 'submit', class: 'ed-b primary', text: 'Sign in' });
    const forgot = el('button', { type: 'button', class: 'ed-b', text: 'Forgot password?' });
    forgot.addEventListener('click', async () => {
      if (!email.value.trim()) { msg.textContent = 'Enter your email first, then tap Forgot password.'; email.focus(); return; }
      forgot.disabled = true; msg.textContent = 'Sending…';
      const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + '/' });
      forgot.disabled = false;
      msg.textContent = error && /rate/i.test(error.message) ? 'Too many emails were sent in the last hour. Try again later, or ask the board’s owner to set your password.'
        : error ? 'Could not send the email: ' + error.message : 'If that email has an account, a link to set a new password is on its way.';
    });
    const form = el('form', { class: 'ed-card narrowc', novalidate: '', 'aria-labelledby': 'si-title' },
      el('div', { class: 'ed-top' },
        el('div', { class: 'si-brand' }),
        el('h2', { id: 'si-title', text: 'SCRD Operations Board' }),
        el('p', { class: 'ed-sub', text: 'Sign in with the account the board’s owner set up for you. On the office TV, sign in once and it stays signed in.' })),
      el('div', { class: 'ed-grid' },
        el('label', { class: 'ed-f wide', for: 'si-email' }, el('span', { class: 'ed-l', text: 'Email' }), email),
        el('label', { class: 'ed-f wide', for: 'si-pass' }, el('span', { class: 'ed-l', text: 'Password' }), pass)),
      msg,
      el('div', { class: 'ed-actions' }, el('div', { class: 'ed-left' }, forgot), el('div', { class: 'ed-right' }, go)));
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
