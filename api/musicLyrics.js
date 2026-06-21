const NETEASE_DEFAULT_SEARCH_URL = 'https://openapi.music.163.com/openapi/music/basic/search/song/get/v3';
const NETEASE_DEFAULT_LYRIC_URL = 'https://music.163.com/api/song/lyric';

async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Only POST is supported.' });
    return;
  }

  const input = normalizeRequest(req.body || {});
  if (!input.title && !input.artist && !input.link && !input.songId) {
    res.status(400).json({ ok: false, error: 'Title, artist, or link is required.' });
    return;
  }

  try {
    const songId = input.songId || extractNetEaseSongId(input.link) || await findNetEaseSongId(input);
    if (!songId) {
      res.status(200).json({ ok: false, error: 'No matching NetEase song was found.', lines: [] });
      return;
    }

    const payload = await fetchNetEaseLyrics(songId);
    const lyric = cleanString(payload.lrc && payload.lrc.lyric || payload.lyric || payload.data && payload.data.lyric);
    const translatedLyric = cleanString(payload.tlyric && payload.tlyric.lyric || payload.translatedLyric || payload.data && payload.data.translatedLyric);
    const lines = mergeTranslatedLyrics(parseLyricLines(lyric), parseLyricLines(translatedLyric));

    res.status(200).json({
      ok: Boolean(lines.length),
      songId,
      lyric,
      translatedLyric,
      lines,
      message: lines.length ? '' : 'Lyrics unavailable.'
    });
  } catch (error) {
    console.error('Music lyrics failed', error);
    res.status(200).json({ ok: false, error: getPublicError(error), lines: [] });
  }
}

module.exports = handler;
module.exports.__test = {
  extractNetEaseSongId,
  parseLyricLines,
  mergeTranslatedLyrics
};

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, api-key');
}

function normalizeRequest(body) {
  return {
    title: cleanString(body.title).slice(0, 120),
    artist: cleanString(body.artist).slice(0, 120),
    link: cleanString(body.link).slice(0, 500),
    songId: cleanString(body.songId || body.neteaseSongId).slice(0, 64)
  };
}

function extractNetEaseSongId(link) {
  const value = cleanString(link);
  if (!value) return '';
  const match = value.match(/[?&#]id=(\d+)/) || value.match(/song\/(\d+)/) || value.match(/\b(\d{5,})\b/);
  return match ? match[1] : '';
}

async function findNetEaseSongId(input) {
  const query = [input.title, input.artist].filter(Boolean).join(' ');
  if (!query) return '';

  const openApiId = await findNetEaseSongIdFromOpenApi(input, query).catch((error) => {
    console.warn('NetEase OpenAPI lyrics search failed', error);
    return '';
  });
  return openApiId || await findNetEaseSongIdFromPublicSearch(input, query);
}

async function findNetEaseSongIdFromOpenApi(input, query) {
  const searchUrl = normalizeBaseUrl(process.env.NETEASE_MUSIC_SEARCH_URL || NETEASE_DEFAULT_SEARCH_URL);
  const method = cleanString(process.env.NETEASE_MUSIC_SEARCH_METHOD || 'POST').toUpperCase();
  const payload = buildNetEaseCommonParams({
    bizContent: JSON.stringify({
      keyword: query,
      limit: '5',
      offset: '0',
      qualityFlag: true
    })
  });
  const response = await fetchWithTimeout(
    method === 'GET' ? appendQuery(searchUrl, payload) : searchUrl,
    {
      method,
      headers: buildNetEaseHeaders(),
      body: method === 'GET' ? undefined : JSON.stringify(payload)
    },
    8000
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getNetEaseError(data));
  return getBestSongId(findSongList(data), input);
}

async function findNetEaseSongIdFromPublicSearch(input, query) {
  const response = await fetchWithTimeout('https://music.163.com/api/search/get/web?csrf_token=', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://music.163.com/',
      'User-Agent': 'Mozilla/5.0 CurioVault/1.0'
    },
    body: new URLSearchParams({ s: query, type: '1', limit: '10', offset: '0' }).toString()
  }, 8000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getNetEaseError(data));
  return getBestSongId(findSongList(data), input);
}

function getBestSongId(songs, input) {
  if (!Array.isArray(songs) || !songs.length) return '';
  const title = normalizeSearchText(input.title);
  const artist = normalizeSearchText(input.artist);
  const ranked = songs.map((song, index) => ({ song, index, score: scoreSongMatch(song, title, artist) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const best = ranked[0] && ranked[0].song;
  return cleanString(best && (best.id || best.songId || best.resourceId));
}

function scoreSongMatch(song, title, artist) {
  const songTitle = normalizeSearchText(song && (song.name || song.title || song.songName));
  const songArtists = normalizeSearchText(getSongArtists(song).join(' '));
  let score = 0;
  if (title && songTitle === title) score += 10;
  else if (title && songTitle.indexOf(title) !== -1) score += 5;
  if (artist && songArtists.indexOf(artist) !== -1) score += 7;
  return score;
}

function getSongArtists(song) {
  const artists = song && (song.artists || song.ar || song.singers || song.artist);
  if (Array.isArray(artists)) return artists.map((artist) => cleanString(artist && (artist.name || artist.artistName || artist))).filter(Boolean);
  if (artists && typeof artists === 'object') return [cleanString(artists.name || artists.artistName)].filter(Boolean);
  return [cleanString(artists)].filter(Boolean);
}

function normalizeSearchText(value) {
  return cleanString(value).toLowerCase().replace(/[\s???,?.!???:?;?'"??<>??()[]??_-]+/g, '');
}

async function fetchNetEaseLyrics(songId) {
  const baseUrl = cleanString(process.env.NETEASE_MUSIC_LYRIC_URL || NETEASE_DEFAULT_LYRIC_URL);
  const url = baseUrl.indexOf('{id}') !== -1
    ? baseUrl.replace(/\{id\}/g, encodeURIComponent(songId))
    : appendQuery(baseUrl, { id: songId, lv: 1, kv: 1, tv: -1 });
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: Object.assign({
      Referer: 'https://music.163.com/',
      'User-Agent': 'Mozilla/5.0 CurioVault/1.0'
    }, buildNetEaseHeaders(false))
  }, 8000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getNetEaseError(data));
  return data;
}

function parseLyricLines(raw) {
  return cleanString(raw).split(/\r?\n/).reduce((lines, row) => {
    const stamps = row.match(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g);
    const text = row.replace(/\[[^\]]+\]/g, '').trim();
    if (!stamps || !text) return lines;
    stamps.forEach((stamp) => {
      const parts = stamp.match(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/);
      if (!parts) return;
      const fraction = Number(`0.${parts[3] || '0'}`) || 0;
      lines.push({
        time: Number(parts[1]) * 60 + Number(parts[2]) + fraction,
        text
      });
    });
    return lines;
  }, []).sort((a, b) => a.time - b.time);
}

function mergeTranslatedLyrics(lines, translations) {
  if (!translations.length) return lines;
  const translationMap = new Map(translations.map((line) => [line.time.toFixed(2), line.text]));
  return lines.map((line) => Object.assign({}, line, {
    translation: translationMap.get(line.time.toFixed(2)) || ''
  }));
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

function normalizeBaseUrl(value) {
  return cleanString(value).replace(/\/+$/, '');
}

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getPublicError(error) {
  if (!error) return 'Lyrics unavailable.';
  return error.message || String(error);
}
