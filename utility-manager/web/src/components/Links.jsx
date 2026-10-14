// Files are kept in Microsoft 365 (OneDrive / SharePoint), not in this
// system: projects, documents and surveys link to them. Clicking one opens
// it in Excel / Word / PowerPoint online, where it is edited (by several
// people at once); who can open it is set by its sharing in Microsoft 365.
import { useState } from 'react';
import { api } from '../api.js';
import { dateTime } from '../format.js';
import { Card, ErrorBox } from './ui.jsx';
import { useSubmit } from '../hooks.js';

const host = (url) => { try { return new URL(url).hostname; } catch { return ''; } };

// links: the item's links; base: its API path (e.g. /projects/12);
// canAdd / canRemove: what this person may do.
export function LinksCard({ title = 'Files', links, base, canAdd, canRemove, reload, empty = 'No files linked yet.' }) {
  const [f, setF] = useState({ url: '', title: '' });
  const add = useSubmit(async () => {
    await api(`${base}/links`, { method: 'POST', body: { url: f.url.trim(), title: f.title.trim() || null } });
    setF({ url: '', title: '' });
    reload();
  });
  const remove = useSubmit(async (l) => {
    if (!window.confirm(`Remove the link to ${l.title}? The file itself stays in Microsoft 365.`)) return;
    await api(`${base}/links/${l.id}`, { method: 'DELETE' });
    reload();
  });
  return <Card title={`${title}${links.length ? ` (${links.length})` : ''}`}>
    <ErrorBox error={add.error || remove.error} />
    {links.length === 0 ? <p className="muted small">{empty}</p> :
      <ul className="people">{links.map((l) => <li key={l.id}>
        <span><a href={l.url} target="_blank" rel="noopener noreferrer"><strong>{l.title}</strong> ↗</a><br />
          <small className="muted">{host(l.url)} · {dateTime(l.added_at)}{l.added_by_name && ` · ${l.added_by_name}`}</small></span>
        {canRemove && <button className="btn ghost small" disabled={remove.busy} onClick={() => remove.submit(l)}>Remove</button>}
      </li>)}</ul>}
    {canAdd && <>
      <form className="inline-add" onSubmit={(e) => { e.preventDefault(); add.submit(); }}>
        <input type="url" required pattern="https://.*" placeholder="Paste the file's link from OneDrive or SharePoint" value={f.url}
          onChange={(e) => setF({ ...f, url: e.target.value })} aria-label="Link" />
        <input placeholder="Name (optional)" maxLength="200" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Name" />
        <button className="btn small" disabled={add.busy}>Add link</button>
      </form>
      <p className="muted small">Files stay in Microsoft 365, where they are opened and edited. In OneDrive or SharePoint: Share → Copy link, then paste it here.
        Share the file with the people who need it there.</p>
    </>}
  </Card>;
}
