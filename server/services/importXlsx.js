import ExcelJS from 'exceljs';

export class ImportParseError extends Error {}

const SHEET_NAME = 'All (for import)';
const MAX_DATA_ROWS = 10000;

const HEADER_MAP = {
  PROJECT: 'project',
  DATE: 'post_date',
  'THEFT DATE': 'theft_date',
  'SITE ID': 'site_id',
  'SITE NAME': 'site_name',
  'LAST VISIT DATE': 'last_visit_date',
  'ITEM STOLEN': 'item_stolen',
  'ITEM TYPE': 'item_type',
  UNIT: 'unit',
  LENGTH: 'length',
  'RH BEFORE': 'rh_before',
  'RH AFTER': 'rh_after',
  'DIPSTICK BEFORE (CM)': 'dipstick_before_cm',
  'DIPSTICK AFTER (CM)': 'dipstick_after_cm',
  'PROBE BEFORE (L)': 'probe_before_l',
  'PROBE AFTER (L)': 'probe_after_l',
  'FUEL BEFORE (L)': 'fuel_before_l',
  'FUEL AFTER (L)': 'fuel_after_l',
  'QUANTITY LOST': 'quantity_lost',
  'POSTED BY': 'posted_by',
  'SOURCE (CHAT MSG)': 'source_time',
  'SOURCE MSG IDS': 'source_msg_ids',
  FLAG: 'flags',
  REMARKS: 'remarks',
  'RAW POST': 'raw_post',
};

const REQUIRED_HEADERS = ['PROJECT', 'DATE', 'ITEM STOLEN', 'ITEM TYPE', 'UNIT', 'SOURCE MSG IDS'];

const NUMERIC_FIELDS = [
  'rh_before',
  'rh_after',
  'dipstick_before_cm',
  'dipstick_after_cm',
  'probe_before_l',
  'probe_after_l',
  'fuel_before_l',
  'fuel_after_l',
];

const REQUIRED_STRING_FIELDS = [
  ['item_stolen', 'item stolen', 150],
  ['item_type', 'item type', 40],
  ['unit', 'unit', 5],
  ['source_msg_ids', 'source msg ids', 120],
];

const OPTIONAL_STRING_FIELDS = [
  ['site_id', 'site id', 20],
  ['site_name', 'site name', 100],
  ['length', 'length', 20],
  ['posted_by', 'posted by', 60],
  ['source_time', 'source', 80],
  ['flags', 'flag', 200],
];

// Formula cells expose {formula, result} — read the cached result. Rich text and
// hyperlink cells expose their text under other keys. Never trims: raw_post must
// stay verbatim, other fields are trimmed individually in validateRow.
function cellPlainValue(cell) {
  let v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if ('result' in v) v = v.result;
    else if ('richText' in v) v = v.richText.map((t) => t.text).join('');
    else if ('text' in v) v = v.text;
  }
  if (v === null || v === undefined || v === '') return null;
  return v;
}

function excelDateToISO(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseExcelDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return excelDateToISO(v);
  if (typeof v === 'number') {
    const epoch = Date.UTC(1899, 11, 30);
    return excelDateToISO(new Date(epoch + v * 86400000));
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  return undefined; // present but not a recognizable date
}

function validateRow(record) {
  const errors = [];
  const values = {};

  const project = record.project ? String(record.project).trim().toUpperCase() : null;
  if (project !== 'HTG' && project !== 'ATC') errors.push('project must be HTG or ATC');
  values.project = project;

  const postDate = parseExcelDate(record.post_date);
  if (postDate === null) errors.push('date is required');
  else if (postDate === undefined) errors.push('date is not a valid date');
  values.post_date = postDate || null;

  for (const [field, label] of [
    ['theft_date', 'theft date'],
    ['last_visit_date', 'last visit date'],
  ]) {
    const parsed = parseExcelDate(record[field]);
    if (parsed === undefined) errors.push(`${label} is not a valid date`);
    values[field] = parsed || null;
  }

  for (const [field, label, maxLen] of REQUIRED_STRING_FIELDS) {
    const v = record[field] ? String(record[field]).trim() : null;
    if (!v) errors.push(`${label} is required`);
    else if (v.length > maxLen) errors.push(`${label} exceeds ${maxLen} characters`);
    values[field] = v;
  }

  for (const [field, label, maxLen] of OPTIONAL_STRING_FIELDS) {
    const v = record[field] ? String(record[field]).trim() : null;
    if (v && v.length > maxLen) errors.push(`${label} exceeds ${maxLen} characters`);
    values[field] = v;
  }

  values.remarks = record.remarks ? String(record.remarks).trim() : null;
  values.raw_post = record.raw_post !== null && record.raw_post !== undefined ? String(record.raw_post) : null;

  for (const field of NUMERIC_FIELDS) {
    const raw = record[field];
    if (raw === null || raw === undefined || raw === '') {
      values[field] = null;
      continue;
    }
    const n = Number(raw);
    if (Number.isNaN(n)) {
      errors.push(`${field.replace(/_/g, ' ')} must be numeric`);
      values[field] = null;
    } else {
      values[field] = n;
    }
  }

  let quantityLost = null;
  if (record.quantity_lost !== null && record.quantity_lost !== undefined && record.quantity_lost !== '') {
    const n = Number(record.quantity_lost);
    if (Number.isNaN(n)) errors.push('quantity lost must be numeric');
    else quantityLost = n;
  } else if (
    values.item_type &&
    values.item_type.toLowerCase() === 'fuel' &&
    values.fuel_before_l !== null &&
    values.fuel_after_l !== null
  ) {
    quantityLost = values.fuel_before_l - values.fuel_after_l;
  }
  values.quantity_lost = quantityLost;

  return { errors, values };
}

function isRecordEmpty(record) {
  return Object.values(record).every((v) => v === null);
}

// Shared by preview and commit so a file is always judged the same way regardless of
// which endpoint parsed it. `existingKeys` is a Set of "project|source_msg_ids|item_stolen".
export async function parseImportFile(buffer, existingKeys) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ImportParseError('Could not read the file as an Excel workbook.');
  }

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) throw new ImportParseError(`Sheet "${SHEET_NAME}" not found.`);

  const colByField = {};
  const seenHeaders = new Set();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellPlainValue(cell);
    if (raw === null) return;
    const norm = String(raw).trim().toUpperCase();
    seenHeaders.add(norm);
    const field = HEADER_MAP[norm];
    if (field) colByField[field] = colNumber;
  });

  const missing = REQUIRED_HEADERS.filter((h) => !seenHeaders.has(h));
  if (missing.length) throw new ImportParseError(`Missing required column(s): ${missing.join(', ')}`);

  const results = [];
  const fileKeys = new Set();
  let dataRowCount = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const record = {};
    for (const [field, col] of Object.entries(colByField)) {
      record[field] = cellPlainValue(row.getCell(col));
    }

    if (isRecordEmpty(record)) break;

    dataRowCount++;
    if (dataRowCount > MAX_DATA_ROWS) {
      throw new ImportParseError(`Too many data rows (max ${MAX_DATA_ROWS}).`);
    }

    const { errors, values } = validateRow(record);
    let status, reason;

    if (errors.length) {
      status = 'error';
      reason = errors.join('; ');
    } else {
      const key = `${values.project}|${values.source_msg_ids}|${values.item_stolen}`;
      if (existingKeys.has(key)) {
        status = 'duplicate';
        reason = 'Already in the database';
      } else if (fileKeys.has(key)) {
        status = 'duplicate';
        reason = 'Duplicate within this file';
      } else {
        status = 'new';
        reason = null;
        fileKeys.add(key);
      }
    }

    results.push({ row: rowNumber, status, reason, values });
  }

  return results;
}
