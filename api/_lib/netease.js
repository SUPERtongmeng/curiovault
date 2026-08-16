// Shared NetEase music API helpers for CurioVault serverless functions.

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeBaseUrl(value) {
  return cleanString(value).replace(/\/+$/, '');
}

function appendQuery(url, params) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  return query ? `${url}${url.indexOf('?') === -1 ? '?' : '&'}${query}` : url;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

function getNetEaseError(payload) {
  if (!payload) return 'NetEase request failed.';
  if (payload.error && payload.error.message) return payload.error.message;
  if (payload.message) return payload.message;
  if (payload.msg) return payload.msg;
  return 'NetEase request failed.';
}

function clampInteger(value, min, max, fallback) {
  const number = parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function buildNetEaseHeaders(includeContentType = true) {
  const headers = includeContentType ? { 'Content-Type': 'application/json' } : {};
  const apiKey = cleanString(process.env.NETEASE_MUSIC_API_KEY);
  const appKey = cleanString(process.env.NETEASE_MUSIC_APP_KEY);
  const appSecret = cleanString(process.env.NETEASE_MUSIC_APP_SECRET);
  if (apiKey) headers[process.env.NETEASE_MUSIC_API_KEY_HEADER || 'Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  if (appKey) headers[process.env.NETEASE_MUSIC_APP_KEY_HEADER || 'X-App-Key'] = appKey;
  if (appSecret) headers[process.env.NETEASE_MUSIC_APP_SECRET_HEADER || 'X-App-Secret'] = appSecret;
  return headers;
}

function buildNetEaseCommonParams(extra) {
  const params = Object.assign({}, extra);
  const appId = cleanString(process.env.NETEASE_MUSIC_APP_ID || process.env.NETEASE_MUSIC_APP_KEY);
  const appSecret = cleanString(process.env.NETEASE_MUSIC_APP_SECRET);
  const accessToken = cleanString(process.env.NETEASE_MUSIC_ACCESS_TOKEN);
  const privateKey = cleanString(process.env.NETEASE_MUSIC_PRIVATE_KEY);
  const device = cleanString(process.env.NETEASE_MUSIC_DEVICE);

  if (appId) params.appId = appId;
  if (appSecret) params.appSecret = appSecret;
  if (accessToken) params.accessToken = accessToken;
  if (device) params.device = device;
  params.timestamp = String(Date.now());
  params.signType = cleanString(process.env.NETEASE_MUSIC_SIGN_TYPE || (privateKey ? 'RSA_SHA256' : ''));

  return params;
}

function findSongList(value) {
  if (!value || typeof value !== 'object') return [];
  const directLists = [
    value.songs,
    value.list,
    Array.isArray(value.data) ? value.data : null,
    value.result && value.result.songs,
    value.result && value.result.songCount && value.result.songs,
    value.result && value.result.list,
    value.result && value.result.data,
    value.data && value.data.songs,
    value.data && value.data.list,
    value.data && value.data.records
  ];
  for (const list of directLists) {
    if (Array.isArray(list)) return list;
  }
  if (value.data && typeof value.data === 'object') return [value.data];
  return [];
}

module.exports = {
  cleanString,
  normalizeBaseUrl,
  appendQuery,
  fetchWithTimeout,
  getNetEaseError,
  clampInteger,
  buildNetEaseHeaders,
  buildNetEaseCommonParams,
  findSongList
};
