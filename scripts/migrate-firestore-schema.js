const fs = require('fs');
const path = require('path');

const applyChanges = process.argv.includes('--apply');
const rootDir = path.resolve(__dirname, '..');
const configText = fs.readFileSync(path.join(rootDir, 'collection/js/firebase-config.js'), 'utf8');
const projectId = readConfigValue('projectId');
const apiKey = readConfigValue('apiKey');
const collectionName = 'items';
const normalizedFields = [
  'category', 'title', 'artist', 'coverUrl', 'description', 'link',
  'neteaseSongId', 'year', 'duration', 'rating', 'tags', 'createdAt', 'updatedAt'
];

main().catch(function (error) {
  console.error(error.message || error);
  process.exitCode = 1;
});

async function main() {
  const documents = await listDocuments();
  const migrations = documents.map(function (doc) {
    return {
      name: doc.name,
      id: doc.name.split('/').pop(),
      before: doc.fields || {},
      after: normalizeFields(doc.fields || {})
    };
  });
  const changed = migrations.filter(function (entry) {
    return normalizedFields.some(function (field) {
      return !firestoreValuesEqual(entry.before[field], entry.after[field]);
    });
  });

  console.log('Documents:', migrations.length);
  console.log('Need migration:', changed.length);
  changed.forEach(function (entry) {
    const fields = normalizedFields.filter(function (field) {
      return !firestoreValuesEqual(entry.before[field], entry.after[field]);
    });
    console.log(' ', entry.id + ':', fields.join(', '));
  });
  printTypeSummary('Before', migrations.map(function (entry) { return entry.before; }));
  printTypeSummary('After', migrations.map(function (entry) { return entry.after; }));

  if (!applyChanges) {
    console.log('Dry run only. Re-run with --apply to back up and update Firestore.');
    return;
  }

  const backupPath = writeBackup(documents);
  console.log('Backup:', backupPath);

  for (const entry of changed) {
    await patchDocument(entry.name, entry.after);
    console.log('Updated:', entry.id);
  }

  const verified = (await listDocuments()).map(function (doc) { return doc.fields || {}; });
  verifyFields(verified);
  console.log('Verified:', verified.length, 'documents use the normalized schema.');
}

function readConfigValue(key) {
  const match = configText.match(new RegExp(key + "\\s*:\\s*['\"]([^'\"]+)['\"]"));
  if (!match) throw new Error('Missing Firebase config value: ' + key);
  return match[1];
}

async function listDocuments() {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL('https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId)
      + '/databases/(default)/documents/' + encodeURIComponent(collectionName));
    url.searchParams.set('key', apiKey);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await requestJson(url);
    documents.push.apply(documents, data.documents || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return documents;
}

async function patchDocument(name, fields) {
  const url = new URL('https://firestore.googleapis.com/v1/' + name);
  url.searchParams.set('key', apiKey);
  normalizedFields.forEach(function (field) {
    url.searchParams.append('updateMask.fieldPaths', field);
  });
  await requestJson(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields })
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    throw new Error((data.error && data.error.message) || ('Firestore request failed: ' + response.status));
  }
  return data;
}

function normalizeFields(fields) {
  const createdAt = toTimestamp(fields.createdAt, 'createdAt');
  const updatedAt = toTimestamp(fields.updatedAt, 'updatedAt');
  return {
    category: stringValue(fields.category),
    title: stringValue(fields.title),
    artist: stringValue(fields.artist),
    coverUrl: stringValue(fields.coverUrl),
    description: stringValue(fields.description),
    link: stringValue(fields.link),
    neteaseSongId: nullableStringValue(fields.neteaseSongId || fields.songId),
    year: nullableStringValue(fields.year),
    duration: normalizeDuration(fields.duration),
    rating: { doubleValue: normalizeRating(fields.rating) },
    tags: normalizeTags(fields.tags),
    createdAt: { timestampValue: createdAt },
    updatedAt: { timestampValue: updatedAt }
  };
}

function decodeValue(value) {
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
  return null;
}

function firestoreValuesEqual(left, right) {
  if (!left || !right) return left === right;
  if (left.timestampValue && right.timestampValue) {
    return new Date(left.timestampValue).getTime() === new Date(right.timestampValue).getTime();
  }
  if (left.arrayValue && right.arrayValue) {
    return JSON.stringify(decodeValue(left)) === JSON.stringify(decodeValue(right));
  }
  const leftNumber = left.integerValue === undefined ? left.doubleValue : left.integerValue;
  const rightNumber = right.integerValue === undefined ? right.doubleValue : right.integerValue;
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return Number(leftNumber) === Number(rightNumber);
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function stringValue(value) {
  const decoded = decodeValue(value);
  return { stringValue: decoded === null ? '' : String(decoded).trim() };
}

function nullableStringValue(value) {
  const decoded = decodeValue(value);
  if (decoded === null || String(decoded).trim() === '') return { nullValue: null };
  return { stringValue: String(decoded).trim() };
}

function normalizeDuration(value) {
  const decoded = decodeValue(value);
  if (decoded === null || decoded === '') return { nullValue: null };
  if (typeof decoded === 'number' && Number.isFinite(decoded)) {
    const seconds = Math.max(0, Math.round(decoded));
    return { stringValue: Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') };
  }
  return { stringValue: String(decoded).trim() };
}

function normalizeRating(value) {
  const decoded = Number(decodeValue(value));
  if (!Number.isFinite(decoded)) return 4;
  return Math.max(1, Math.min(5, Math.round(decoded * 2) / 2));
}

function normalizeTags(value) {
  const decoded = decodeValue(value);
  const tags = (Array.isArray(decoded) ? decoded : [])
    .map(function (tag) { return String(tag).trim(); })
    .filter(Boolean)
    .filter(function (tag, index, list) { return list.indexOf(tag) === index; })
    .slice(0, 6);
  return { arrayValue: { values: tags.map(function (tag) { return { stringValue: tag }; }) } };
}

function toTimestamp(value, field) {
  const decoded = decodeValue(value);
  const date = new Date(decoded);
  if (!decoded || Number.isNaN(date.getTime())) throw new Error('Invalid ' + field + ' value');
  return date.toISOString();
}

function writeBackup(documents) {
  const dir = path.join(rootDir, '.firestore-backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, 'items-' + stamp + '.json');
  fs.writeFileSync(target, JSON.stringify({ exportedAt: new Date().toISOString(), projectId, documents }, null, 2));
  return target;
}

function printTypeSummary(label, fieldsList) {
  console.log(label + ':');
  ['createdAt', 'updatedAt', 'year', 'duration', 'neteaseSongId', 'rating', 'tags'].forEach(function (field) {
    const counts = {};
    fieldsList.forEach(function (fields) {
      const value = fields[field];
      const type = value ? Object.keys(value)[0] : 'missing';
      counts[type] = (counts[type] || 0) + 1;
    });
    console.log(' ', field, counts);
  });
}

function verifyFields(fieldsList) {
  const expected = {
    createdAt: 'timestampValue', updatedAt: 'timestampValue', year: ['stringValue', 'nullValue'],
    duration: ['stringValue', 'nullValue'], neteaseSongId: ['stringValue', 'nullValue'],
    rating: 'doubleValue', tags: 'arrayValue'
  };
  fieldsList.forEach(function (fields, index) {
    Object.keys(expected).forEach(function (field) {
      const actual = fields[field] ? Object.keys(fields[field])[0] : 'missing';
      const allowed = Array.isArray(expected[field]) ? expected[field] : [expected[field]];
      if (allowed.indexOf(actual) === -1) {
        throw new Error('Verification failed at document ' + index + ': ' + field + ' is ' + actual);
      }
    });
  });
}
