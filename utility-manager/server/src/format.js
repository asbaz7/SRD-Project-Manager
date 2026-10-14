// Text formatting shared by the API, the Telegram bot and the assistant.
import { ASSET_LABELS } from './domain.js';

// Telegram HTML: escape what Telegram treats as markup.
export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// References people see: WO-0042, PRJ-0013.
export const workRef = (id) => `WO-${String(id).padStart(4, '0')}`;
export const projectRef = (id) => `PRJ-${String(id).padStart(4, '0')}`;
// The same in SQL, for a column or expression: refSql('WO', 'w.id').
export const refSql = (prefix, column) => `'${prefix}-' || lpad(${column}::text, 4, '0')`;

// "Genset 3", "RO unit RO-01"; an asset of kind 'other' by its tag alone.
export const assetName = (a) => `${ASSET_LABELS[a.kind] ?? ''} ${a.tag}`.trim();
// With its place: "K. Maafushi Genset 3".
export const assetLabel = (a) => `${a.atoll_code}. ${a.island_name} ${assetName(a)}`;
