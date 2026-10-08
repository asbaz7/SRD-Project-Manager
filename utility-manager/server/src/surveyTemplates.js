// Survey types. Each template is a list of sections; a section is either a
// set of fields, or a repeating group (gensets, feeders, pumping stations)
// shown as columns like the original spreadsheet.
//
// Field types: text, textarea, number (unit), date, yesno, choice (options).
// Answers are stored as { [section]: { [field]: value } } and, for repeating
// sections, { [section]: [{ [field]: value }, …] }.
//
// To add a survey type, add a template here (nothing else changes).

const yesno = (key, label) => ({ key, label, type: 'yesno' });
const num = (key, label, unit) => ({ key, label, type: 'number', unit });
const text = (key, label) => ({ key, label, type: 'text' });
const date = (key, label) => ({ key, label, type: 'date' });
const area = (key, label) => ({ key, label, type: 'textarea' });
const choice = (key, label, options) => ({ key, label, type: 'choice', options });

export const TEMPLATES = [
  {
    key: 'island_assessment',
    name: 'Island Assessment (powerhouse takeover)',
    description: 'Assessment of a powerhouse before taking it over: gensets, renewables, control panel, distribution, fuel, water, sewerage and CCTV.',
    technical: true,
    // From "Island Assessment - Dh. Bandidhoo.xlsx" (sheets GENSET DETAILS and OTHER DETAILS).
    sections: [
      {
        key: 'powerhouse', title: 'Powerhouse',
        fields: [
          text('name', 'Powerhouse name'),
          num('consumers', 'Number of consumers'),
          num('staff', 'Number of staff'),
          num('peak_load_kw', 'Peak load (this year)', 'kW'),
          text('peak_load_time', 'Peak load time (HHMM)'),
          num('installed_kw', 'Total installed capacity', 'kW'),
          num('expected_peak_kw', 'Expected peak load (next year)', 'kW'),
          num('expected_new_consumers', 'Expected additional consumers (next year)'),
        ],
      },
      {
        key: 'gensets', title: 'Genset details', repeat: { label: 'Gen', min: 1, max: 12 },
        fields: [
          text('fixed_asset_code', 'Fixed asset / internal registry code'),
          text('engine_brand', 'Engine brand'),
          text('engine_model', 'Engine model'),
          text('engine_serial', 'Engine serial number'),
          num('genset_kw', 'Genset rated capacity', 'kW'),
          num('engine_kw', 'Engine rated capacity', 'kW'),
          num('alternator_kw', 'Alternator rated capacity', 'kW'),
          text('alternator_brand', 'Alternator brand'),
          text('alternator_frame', 'Alternator frame no.'),
          text('alternator_serial', 'Alternator serial no.'),
          num('max_output_kw', 'Maximum output', 'kW'),
          date('last_overhaul', 'Last overhaul date'),
          date('next_overhaul', 'Next overhaul date'),
          date('last_alt_service', 'Last alternator service date'),
          date('commissioned', 'Original commissioning date at first power plant (if applicable)'),
          date('installed', 'Engine installed date at current power plant'),
          choice('condition', 'Running condition', ['Running; OK', 'Running; Faulty', 'Not running']),
          yesno('connected', 'Connected to panel'),
          date('last_used', 'Last used date'),
          yesno('shared_daytank', 'Shared day tank'),
          num('daytank_no', 'Day tank number'),
          num('daytank_l', 'Day tank capacity', 'L'),
          choice('radiator', 'Radiator type', ['Remote radiator', 'Heat exchanger', 'Engine in-built fan']),
          num('running_hours', 'Total running hours (meter reading)', 'h'),
          date('hours_read_on', 'Hours read on'),
        ],
      },
      {
        key: 'renewables', title: 'Renewable energy and new genset',
        fields: [
          yesno('renewable', 'Renewable energy'),
          num('renewable_kw', 'Renewable energy capacity', 'kW'),
          yesno('solar_pv', 'Solar PV'),
          yesno('net_metering', 'Net metering'),
          yesno('ppa', 'PPA'),
          yesno('new_genset_requested', 'New genset requested'),
          num('new_genset_kw', 'Size of new genset required', 'kW'),
        ],
      },
      {
        key: 'control_panel', title: 'Control panel',
        fields: [
          yesno('sync_panel', 'Sync panel'),
          yesno('modification_required', 'Modification required'),
          area('modification_details', 'If yes, details'),
          yesno('new_feeders_needed', 'Need to increase feeders'),
        ],
      },
      {
        key: 'distribution', title: 'Distribution network',
        fields: [
          num('feeders', 'Number of feeders'),
          yesno('voltage_drop_complaint', 'Voltage drop complaints'),
          area('voltage_drop_details', 'Voltage drop details'),
        ],
      },
      {
        key: 'feeders', title: 'Feeders', repeat: { label: 'Feeder', min: 0, max: 12 },
        fields: [num('end_voltage', 'Voltage at end of feeder', 'V')],
      },
      {
        key: 'fuel', title: 'Fuel storage',
        fields: [
          num('storage_l', 'Total fuel storage capacity', 'L'),
          text('tank_type', 'Type of main storage tanks (steel / PVC / etc.)'),
          yesno('calibrated', 'Tanks calibrated'),
          date('last_calibration', 'Date of last tank calibration'),
          num('main_tanks', 'Number of main storage tanks'),
          num('days_between_deliveries', 'Average days between fuel deliveries', 'days'),
          yesno('additional_tank_requested', 'Additional fuel tank requested to budget'),
        ],
      },
      {
        key: 'water', title: 'Water service',
        fields: [
          yesno('provided', 'Water service provided'),
          num('consumers', 'Number of consumers'),
          num('expected_new_consumers', 'Expected additional consumers (next year)'),
          num('storage_l', 'Water storage tank capacity', 'L'),
          yesno('additional_tank_required', 'Additional storage tank required'),
          yesno('land_available', 'Land available for additional tank'),
          num('daily_consumption_l', 'Daily water consumption', 'L'),
          text('ramazan_increase', 'Expected increase during Ramazan'),
          num('power_kw', 'Power consumption', 'kW'),
          area('issues', 'Issues and complaints about the service'),
        ],
      },
      {
        key: 'sewerage', title: 'Sewerage service',
        fields: [
          yesno('provided', 'Sewerage service provided'),
          num('consumers', 'Number of consumers'),
          num('expected_new_consumers', 'Expected additional consumers (next year)'),
          num('pumping_stations', 'Number of pumping stations'),
          area('issues', 'Issues and complaints about the service'),
        ],
      },
      {
        key: 'pumping_stations', title: 'Pumping stations', repeat: { label: 'PS', min: 0, max: 10 },
        fields: [num('power_kw', 'Power', 'kW')],
      },
      {
        key: 'cctv', title: 'CCTV',
        fields: [
          yesno('installed', 'CCTV cameras installed'),
          num('control_room', 'Cameras: control room'),
          num('engine_room', 'Cameras: engine room'),
          num('workshop', 'Cameras: workshop'),
          num('office', 'Cameras: office'),
          num('fuel_storage', 'Cameras: fuel storage'),
          num('open_area', 'Cameras: open area'),
          num('roads', 'Cameras: roads'),
        ],
      },
      {
        key: 'summary', title: 'Findings and recommendations',
        fields: [area('findings', 'Findings'), area('recommendations', 'Recommendations')],
      },
    ],
  },
  {
    key: 'general',
    name: 'General site survey',
    description: 'Any other survey: purpose, findings and recommendations, with photos and files attached.',
    technical: false,
    sections: [
      {
        key: 'survey', title: 'Survey',
        fields: [
          text('purpose', 'Purpose'),
          text('surveyed_by', 'Surveyed by (team)'),
          area('findings', 'Findings'),
          area('recommendations', 'Recommendations'),
        ],
      },
    ],
  },
];

export const templateByKey = (key) => TEMPLATES.find((t) => t.key === key) || null;

// Keep only known sections and fields, with values of the right type. Empty
// values are dropped.
export function cleanAnswers(template, answers = {}) {
  const coerce = (field, v) => {
    if (v === undefined || v === null || v === '') return undefined;
    switch (field.type) {
      case 'number': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
        return Number.isFinite(n) ? n : undefined;
      }
      case 'yesno': return v === true || v === 'yes' ? 'yes' : v === false || v === 'no' ? 'no' : undefined;
      case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : undefined;
      case 'choice': return field.options.includes(v) ? v : undefined;
      default: return String(v).slice(0, field.type === 'textarea' ? 10000 : 500);
    }
  };
  const cleanGroup = (section, values) => {
    const out = {};
    for (const f of section.fields) {
      const c = coerce(f, values?.[f.key]);
      if (c !== undefined) out[f.key] = c;
    }
    return out;
  };
  const out = {};
  for (const s of template.sections) {
    const v = answers[s.key];
    if (s.repeat) {
      const items = (Array.isArray(v) ? v : []).slice(0, s.repeat.max).map((item) => cleanGroup(s, item));
      while (items.length && !Object.keys(items.at(-1)).length) items.pop();
      if (items.length) out[s.key] = items;
    } else {
      const g = cleanGroup(s, v);
      if (Object.keys(g).length) out[s.key] = g;
    }
  }
  return out;
}

// Rows for a CSV export: section, item, field, value.
export function answerRows(template, answers) {
  const rows = [];
  for (const s of template.sections) {
    const v = answers[s.key];
    if (s.repeat) {
      (v || []).forEach((item, i) => {
        for (const f of s.fields) if (item[f.key] !== undefined) rows.push({ section: s.title, item: `${s.repeat.label} ${i + 1}`, field: f.label, value: item[f.key], unit: f.unit || '' });
      });
    } else if (v) {
      for (const f of s.fields) if (v[f.key] !== undefined) rows.push({ section: s.title, item: '', field: f.label, value: v[f.key], unit: f.unit || '' });
    }
  }
  return rows;
}
