// Surveys: forms of several kinds (templates in src/surveyTemplates.js).
// Technical templates are for technical staff only. Managers and staff with
// the 'surveys' permission carry them out; whoever started a survey, managers
// and administrators can edit it.
import { z } from 'zod';
import { allowed, hasRole, requireAllowed } from '../auth.js';
import { sendCsv } from '../csv.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { Where, date, id, one, optText, pageOf, paging, parse, serialParam } from '../http.js';
import { TEMPLATES, answerRows, cleanAnswers, templateByKey } from '../surveyTemplates.js';
import { linkRoutes, loadLinks } from '../links.js';

const visibleTemplates = (user) => TEMPLATES.filter((t) => !t.technical || user.technical).map((t) => t.key);

const SELECT = `
  select v.*, 'SRV-' || lpad(v.id::text, 4, '0') as ref, i.name as island_name, a.code as atoll_code,
         cu.full_name as created_by_name, uu.full_name as updated_by_name,
         (select count(*)::int from survey_links l where l.survey_id = v.id) as file_count,
         count(*) over () as total_count
    from surveys v
    left join islands i on i.id = v.island_id
    left join atolls a on a.id = i.atoll_id
    left join users cu on cu.id = v.created_by
    left join users uu on uu.id = v.updated_by`;

const createBody = z.object({
  template: z.string().max(60),
  title: optText(200),
  island_id: id.nullish(),
  location_name: optText(200),
  surveyed_on: date.nullish(),
  answers: z.record(z.string(), z.unknown()).optional(),
});

export default async function surveyRoutes(app) {
  const { db } = app;
  const surveyor = { preHandler: requireAllowed('surveys', 'You are not allowed to carry out surveys. Ask an administrator.') };

  async function load(user, surveyId) {
    const s = one((await db.query(`${SELECT} where v.id = $1`, [surveyId])).rows, 'Survey');
    const t = templateByKey(s.template);
    if (!t || (t.technical && !user.technical)) throw notFound('Survey');
    delete s.total_count;
    s.can_edit = user.role === 'admin' || s.created_by === user.id || (hasRole(user, 'manager') && allowed(user, 'surveys'));
    return { s, t };
  }

  app.get('/survey-templates', async (req) => TEMPLATES.filter((t) => visibleTemplates(req.user).includes(t.key)));

  app.get('/surveys', async (req) => {
    const q = parse(paging.extend({
      template: z.string().max(60).optional(),
      status: z.enum(['draft', 'completed']).optional(),
      island_id: id.optional(),
      q: z.string().max(100).optional(),
    }), req.query);
    const w = new Where([visibleTemplates(req.user)]).raw('v.template = any($1::text[])')
      .add('v.template = ?', q.template).add('v.status = ?', q.status).add('v.island_id = ?', q.island_id)
      .add('(v.title ilike ? or v.location_name ilike ? or i.name ilike ?)', q.q && `%${q.q}%`);
    const { rows } = await db.query(`${SELECT} ${w.sql}
      order by (v.status = 'draft') desc, coalesce(v.surveyed_on, v.created_at::date) desc, v.id desc
      limit ${q.limit} offset ${q.offset}`, w.values);
    for (const r of rows) delete r.answers;   // the list doesn't need them
    return pageOf(rows, q);
  });

  app.get('/surveys/:id', async (req) => {
    const { id: surveyId } = parse(serialParam, req.params);
    const { s } = await load(req.user, surveyId);
    s.links = await loadLinks(db, 'survey', surveyId);
    return s;
  });

  app.post('/surveys', surveyor, async (req, reply) => {
    const b = parse(createBody, req.body);
    const t = templateByKey(b.template);
    if (!t || (t.technical && !req.user.technical)) throw badRequest('Unknown survey type');
    if (!b.island_id && !b.location_name) throw badRequest('Choose the island, or type the place');
    let place = b.location_name;
    if (b.island_id) {
      const { rows: [i] } = await db.query('select i.name, a.code from islands i join atolls a on a.id = i.atoll_id where i.id = $1', [b.island_id]);
      if (!i) throw badRequest('Unknown island');
      place = `${i.code}. ${i.name}`;
    }
    const title = b.title || `${t.name.replace(/\s*\(.*\)$/, '')} - ${place}`;
    const { rows } = await db.tx(req.user.id, (tx) => tx.query(`
      insert into surveys (template, title, island_id, location_name, surveyed_on, answers, created_by, updated_by)
      values ($1, $2, $3, $4, $5, $6, $7, $7) returning id`,
    [t.key, title, b.island_id ?? null, b.island_id ? null : b.location_name, b.surveyed_on ?? null,
      JSON.stringify(cleanAnswers(t, b.answers)), req.user.id]));
    reply.code(201);
    return (await load(req.user, rows[0].id)).s;
  });

  app.patch('/surveys/:id', async (req) => {
    const { id: surveyId } = parse(serialParam, req.params);
    const { s, t } = await load(req.user, surveyId);
    if (!s.can_edit) throw forbidden('Only whoever started this survey, a manager or an administrator can change it');
    const b = parse(createBody.omit({ template: true }).partial().extend({ status: z.enum(['draft', 'completed']).optional() }), req.body);
    const fields = {};
    if (b.title) fields.title = b.title;
    if (b.surveyed_on !== undefined) fields.surveyed_on = b.surveyed_on;
    if (b.island_id !== undefined || b.location_name !== undefined) {
      fields.island_id = b.island_id ?? null;
      fields.location_name = b.island_id ? null : (b.location_name ?? s.location_name);
      if (!fields.island_id && !fields.location_name) throw badRequest('Choose the island, or type the place');
    }
    if (b.answers) fields.answers = JSON.stringify(cleanAnswers(t, b.answers));
    if (b.status && b.status !== s.status) {
      fields.status = b.status;
      fields.completed_at = b.status === 'completed' ? new Date().toISOString() : null;
    }
    fields.updated_by = req.user.id;
    const keys = Object.keys(fields);
    await db.tx(req.user.id, (tx) => tx.query(`update surveys set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`,
      [surveyId, ...keys.map((k) => fields[k])]));
    return (await load(req.user, surveyId)).s;
  });

  app.delete('/surveys/:id', async (req) => {
    const { id: surveyId } = parse(serialParam, req.params);
    const { s } = await load(req.user, surveyId);
    if (!(req.user.role === 'admin' || (s.created_by === req.user.id && s.status === 'draft'))) {
      throw forbidden('Only an administrator, or whoever started a draft, can delete a survey');
    }
    await db.tx(req.user.id, (tx) => tx.query('delete from surveys where id = $1', [surveyId]));
    return { ok: true };
  });

  // The answers as a CSV (section, item, field, value, unit).
  app.get('/surveys/:id/csv', async (req, reply) => {
    const { id: surveyId } = parse(serialParam, req.params);
    const { s, t } = await load(req.user, surveyId);
    const rows = [{ section: 'Survey', item: '', field: 'Title', value: s.title, unit: '' },
      { section: 'Survey', item: '', field: 'Place', value: s.island_name ? `${s.atoll_code}. ${s.island_name}` : s.location_name, unit: '' },
      { section: 'Survey', item: '', field: 'Surveyed on', value: s.surveyed_on || '', unit: '' },
      ...answerRows(t, s.answers)];
    return sendCsv(reply, `${s.ref} ${s.title}.csv`.replace(/[\\/:*?"<>|]/g, '_'), rows,
      [['Section', 'section'], ['Item', 'item'], ['Field', 'field'], ['Value', 'value'], ['Unit', 'unit']]);
  });

  // Photos and files: links to Microsoft 365 (OneDrive / SharePoint).
  linkRoutes(app, 'survey', '/surveys/:id', async (req, surveyId) => {
    const { s } = await load(req.user, surveyId);
    if (!s.can_edit) throw forbidden('Only whoever started this survey, a manager or an administrator can add or remove files');
  });
}
