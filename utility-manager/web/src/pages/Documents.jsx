// Documents sent for signature: the register that replaced the "E-sign
// status" list. One row per document, its recipients in signing order (✓ when
// signed), and status that follows the signatures.
import { Link } from 'react-router-dom';
import { csvUrl, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Async, Card, Empty, PageHead, Pager, Select } from '../components/ui.jsx';
import { date, dateTime } from '../format.js';
import { useApi, useFilters } from '../hooks.js';

export const DOC_STATUS = { pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_PILL = { pending: 'work-awaiting_parts', completed: 'work-completed', cancelled: 'work-cancelled' };
export const DocStatus = ({ value }) => <span className={`pill ${STATUS_PILL[value]}`}>{DOC_STATUS[value]}</span>;
export const DocType = ({ value }) => <span className="pill doc-type">{value}</span>;

export function Signers({ signers, compact }) {
  return <div className={`signers ${compact ? 'compact' : ''}`}>{signers.map((s) => (
    <span key={s.id} className={`chip ${s.signed_on ? 'signed' : ''}`} title={s.signed_on ? `Signed ${date(s.signed_on)}` : 'Not signed yet'}>
      {s.signed_on ? '✓ ' : ''}{s.name}
    </span>
  ))}</div>;
}

const VIEWS = [['all', 'All documents'], ['waiting', 'Waiting for me'], ['sent', 'Sent by me']];

export default function Documents() {
  const { can } = useAuth();
  const [filters, setFilter] = useFilters({ view: 'all', status: 'all' });
  const types = useApi('/documents/types');
  const params = { view: filters.view, status: filters.status, type: filters.type, q: filters.q, offset: filters.offset };
  const state = useApi(`/documents${qs(params)}`);

  return <>
    <PageHead title="Documents" icon="document" subtitle="Documents sent for signature: who has signed, and what is still waiting"
      actions={<>
        <a className="btn ghost" href={csvUrl('/documents', { ...params, offset: undefined })}>Export CSV</a>
        {can('manager') && <Link className="btn primary" to="/documents/new">New document</Link>}
      </>} />
    <nav className="tabs glass" aria-label="Views">
      {VIEWS.map(([k, label]) => <button key={k} className={`tab ${filters.view === k ? 'active' : ''}`} onClick={() => setFilter({ view: k, offset: undefined })}>{label}</button>)}
    </nav>
    <div className="filters">
      <Select value={filters.status} onChange={(v) => setFilter('status', v)} options={{ all: 'Any status', ...DOC_STATUS }} aria-label="Status" />
      <Select value={filters.type} onChange={(v) => setFilter('type', v)} placeholder="All types" options={(types.data || []).map((t) => [t, t])} aria-label="Document type" />
      <input type="search" placeholder="Search ID, subject or person…" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)} aria-label="Search" />
    </div>
    <Async state={state}>{(page) => (
      <Card>
        {page.items.length === 0 ? <Empty>{filters.view === 'waiting' ? 'Nothing is waiting for your signature.' : 'No documents match.'}</Empty> :
          <div className="table-scroll"><table>
            <thead><tr><th>Agreement ID</th><th>Type</th><th className="hide-sm">Sent by</th><th className="hide-sm">Sent</th>
              <th>Recipients</th><th>Status</th><th className="hide-sm">Last approval</th><th className="hide-sm">Updated</th></tr></thead>
            <tbody>{page.items.map((d) => <tr key={d.id}>
              <td className="wrap"><Link to={`/documents/${d.id}`}><strong>{d.ref}</strong></Link>{d.title && <><br /><small className="muted">{d.title}</small></>}</td>
              <td><DocType value={d.doc_type} /></td>
              <td className="hide-sm small">{d.sent_by_label || '—'}</td>
              <td className="hide-sm small nowrap">{date(d.sent_on)}</td>
              <td className="wrap"><Signers signers={d.signers} compact /><small className="muted">{d.signed_count} of {d.signer_count} signed</small></td>
              <td><DocStatus value={d.status} /></td>
              <td className="hide-sm small nowrap">{date(d.last_approval_on)}</td>
              <td className="hide-sm small nowrap muted">{dateTime(d.updated_at)}</td>
            </tr>)}</tbody>
          </table></div>}
        <Pager page={page} onOffset={(o) => setFilter('offset', o)} />
      </Card>
    )}</Async>
  </>;
}
