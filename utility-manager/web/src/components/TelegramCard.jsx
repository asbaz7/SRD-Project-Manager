// Account page: link the user's Telegram to their login; administrators also
// connect the bot and manage which chats get alerts.
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, useSubmit } from '../hooks.js';
import { dateTime } from '../format.js';
import { Card, ErrorBox } from './ui.jsx';
import { Icon } from './icons.jsx';

export default function TelegramCard() {
  const { can } = useAuth();
  const state = useApi('/telegram');
  const [code, setCode] = useState(null);
  const t = state.data;

  const getCode = useSubmit(async () => setCode(await api('/telegram/link-code', { method: 'POST' })));
  const unlink = useSubmit(async () => { await api('/telegram/link', { method: 'DELETE' }); setCode(null); state.reload(); });
  const connect = useSubmit(async () => { await api('/telegram/connect', { method: 'POST' }); state.reload(); });
  const testAlert = useSubmit(async () => { await api('/telegram/test', { method: 'POST' }); });
  const setAlerts = useSubmit(async (chatId, change) => { await api(`/telegram/chats/${chatId}`, { method: 'PATCH', body: change }); state.reload(); });
  const remove = useSubmit(async (chatId) => { await api(`/telegram/chats/${chatId}`, { method: 'DELETE' }); state.reload(); });

  if (!t) return null;
  if (!t.enabled) return can('admin') ? <Card title="Telegram"><p className="muted">The Telegram bot isn't set up yet: the TELEGRAM_BOT_TOKEN secret is missing.</p></Card> : null;

  return <>
    <Card title={<span className="title-with-icon"><Icon name="telegram" /> Telegram</span>}>
      <ErrorBox error={getCode.error || unlink.error} />
      {t.linked ? <>
        <p>Linked to <strong>{t.telegram_name}</strong>. You can report from Telegram with <a href={`https://t.me/${t.bot}`} target="_blank" rel="noopener noreferrer">@{t.bot}</a>. Send it <code>/help</code> to see how.</p>
        <button className="btn ghost" disabled={unlink.busy} onClick={unlink.submit}>Unlink</button>
      </> : code ? <>
        <p>Open the bot in Telegram and press <strong>Start</strong>. The link works once, for 15 minutes.</p>
        <p><a className="btn primary" href={code.url} target="_blank" rel="noopener noreferrer"><Icon name="telegram" /> Open @{code.bot} in Telegram</a></p>
        <p className="muted small">Or send it this message yourself: <code>/start {code.code}</code></p>
        <button className="btn ghost small" onClick={() => { setCode(null); state.reload(); }}>I've linked it</button>
      </> : <>
        <p>Link your Telegram account to report gensets going down, incidents and work updates from your phone, and to look up any island's status.</p>
        <button className="btn primary" disabled={getCode.busy} onClick={getCode.submit}>Link Telegram</button>
      </>}
    </Card>

    {can('admin') && t.status && <Card title="Telegram bot (administrators)">
      <ErrorBox error={connect.error || testAlert.error || setAlerts.error || remove.error} />
      <dl className="facts">
        <dt>Bot</dt><dd>{t.bot ? `@${t.bot}` : <span className="bad">Can't reach Telegram{t.status.error ? `: ${t.status.error}` : ''}. Check the token.</span>}</dd>
        <dt>Connection</dt><dd>{t.status.connected ? <span className="good">✓ Receiving messages</span> : <span className="warn">Not connected</span>}
          {t.status.last_error && <><br /><span className="muted small">Last error: {t.status.last_error}</span></>}</dd>
      </dl>
      <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={connect.busy} onClick={connect.submit}>{t.status.connected ? 'Reconnect' : 'Connect bot'}</button>
        <button className="btn ghost" disabled={testAlert.busy || !t.chats?.some((c) => c.alerts)} onClick={testAlert.submit}>Send test alert</button>
      </div>
      <h4>Chats receiving alerts</h4>
      {t.chats?.length ? <table>
        <thead><tr><th>Chat</th><th>Alerts</th><th>Technical alerts</th><th className="hide-sm">Added</th><th /></tr></thead>
        <tbody>{t.chats.map((c) => <tr key={c.chat_id}>
          <td>{c.title || c.chat_id}</td>
          <td><label className="check"><input type="checkbox" checked={c.alerts} onChange={(e) => setAlerts.submit(c.chat_id, { alerts: e.target.checked })} /> {c.alerts ? 'On' : 'Off'}</label></td>
          <td><label className="check" title="Gensets and assets going down or back up, and engine figures in the morning summary"><input type="checkbox" checked={c.technical} onChange={(e) => setAlerts.submit(c.chat_id, { technical: e.target.checked })} /> {c.technical ? 'Included' : 'Not included'}</label></td>
          <td className="hide-sm small muted">{dateTime(c.created_at)}{c.added_by_name && ` · ${c.added_by_name}`}</td>
          <td><button className="btn ghost small" onClick={() => remove.submit(c.chat_id)}>Remove</button></td>
        </tr>)}</tbody>
      </table> : <p className="muted">None yet. Add @{t.bot} to your group, then send <code>/alerts on</code> in the group (as a linked manager or administrator).</p>}
    </Card>}
  </>;
}
