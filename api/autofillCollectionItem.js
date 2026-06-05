const ALLOWED_CATEGORIES = new Set(['music', 'movie', 'tv', 'books', 'images', 'articles']);
const CATEGORY_LABELS = {
  music: '音乐',
  movie: '电影',
  tv: '电视剧',
  books: '书籍',
  images: '图片',
  articles: '文章'
};

const FORMAT_ERROR_MESSAGE = 'AI 返回格式异常，请重试或补充作者/导演。';
const NETEASE_DEFAULT_SEARCH_URL = 'https://openapi.music.163.com/openapi/music/basic/search/song/get/v3';
const NETEASE_DEFAULT_SONG_LIST_URL = 'https://openapi.music.163.com/openapi/music/basic/song/list/get/v2';
const NETEASE_DEFAULT_SONG_DETAIL_URL = 'https://openapi.music.163.com/openapi/music/basic/song/detail/get/v2';
const MAX_CANDIDATES = 3;
const ORIGINAL_ARTIST_ALIASES = {
  '彼得·威尔': 'Peter Weir',
  '彼得威尔': 'Peter Weir',
  '宫崎骏': '宮崎駿',
  '宫崎駿': '宮崎駿',
  '村上春树': '村上春樹',
  '葛饰北斋': '葛飾北斎',
  '梵高': 'Vincent van Gogh',
  '文森特·梵高': 'Vincent van Gogh',
  '达·芬奇': 'Leonardo da Vinci',
  '达芬奇': 'Leonardo da Vinci',
  '莱昂纳多·达·芬奇': 'Leonardo da Vinci',
  '米开朗基罗': 'Michelangelo Buonarroti',
  '乔治·奥威尔': 'George Orwell',
  '加西亚·马尔克斯': 'Gabriel García Márquez',
  '马尔克斯': 'Gabriel García Márquez'
};
const ORIGINAL_ARTIST_TITLE_OVERRIDES = {
  'tv:东京爱情故事': '坂元裕二',
  'movie:楚门的世界': 'Peter Weir',
  'images:神奈川冲浪里': '葛飾北斎',
  'books:挪威的森林': '村上春樹'
};

async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST is supported.' });
    return;
  }

  const apiKey = process.env.MIMO_API_KEY;
  const model = process.env.MIMO_MODEL || 'mimo-v2.5-pro';
  const baseUrl = normalizeBaseUrl(process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1');

  if (!apiKey) {
    res.status(500).json({ error: 'MIMO_API_KEY is not configured.' });
    return;
  }

  const input = normalizeRequest(req.body || {});
  if (!input.title && !input.clue) {
    res.status(400).json({ error: 'Title or clue is required.' });
    return;
  }

  try {
    if (input.category === 'music') {
      input.musicCandidates = await searchNetEaseSongs(input).catch((error) => {
        console.warn('NetEase music search failed', error);
        return [];
      });
    }

    const content = await requestModelJson(input, { apiKey, baseUrl, model });
    const parsed = await parseOrRepairModelJson(content, input, { apiKey, baseUrl, model }).catch((error) => {
      if (input.category === 'music' && input.musicCandidates.length) {
        console.warn('MiMo JSON parse failed, falling back to NetEase candidates', error);
        return createMusicCandidateFallback(input);
      }
      throw error;
    });
    const result = normalizeModelResult(parsed, input);
    if (input.category === 'music' && input.musicCandidates.length && !result.candidates.length) {
      result.candidates = input.musicCandidates.map((candidate) => normalizeItem(candidate, input)).filter(hasCandidateData).slice(0, MAX_CANDIDATES);
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Autofill failed', error);
    if (error instanceof AutofillParseError) {
      res.status(200).json(createFallbackModelResult(input));
      return;
    }
    res.status(error instanceof AutofillParseError ? 422 : 500).json({
      error: getPublicErrorMessage(error)
    });
  }
}

module.exports = handler;
module.exports.__test = {
  AutofillParseError,
  FORMAT_ERROR_MESSAGE,
  MAX_CANDIDATES,
  buildRepairPrompt,
  buildSystemPrompt,
  createFallbackModelResult,
  createMusicCandidateFallback,
  getPublicErrorMessage,
  extractJsonObject,
  normalizeNetEaseSongCandidates,
  normalizeOriginalArtistName,
  normalizeModelResult,
  normalizeRequest,
  parseModelJson,
  parseOrRepairModelJson,
  sanitizeModelText,
  softRepairJsonText
};

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, api-key');
  res.setHeader('Vary', 'Origin');
}

function normalizeRequest(body) {
  const category = cleanString(body.category);
  return {
    category: ALLOWED_CATEGORIES.has(category) ? category : 'music',
    categoryLabel: CATEGORY_LABELS[category] || CATEGORY_LABELS.music,
    title: cleanString(body.title).slice(0, 120),
    artist: cleanString(body.artist).slice(0, 120),
    clue: cleanString(body.clue).slice(0, 300),
    current: {
      description: cleanString(body.current && body.current.description).slice(0, 180),
      tags: normalizeTags(body.current && body.current.tags),
      year: cleanString(body.current && body.current.year).slice(0, 24)
    }
  };
}

function buildSystemPrompt() {
  return [
    '你是收藏后台元数据助手。只返回一行合法 JSON 对象，不要换行数组，不要输出 JSON 之外的内容。',
    '禁止输出 <think>、Markdown、代码块、解释文字。',
    '根据 category/title/artist/clue 识别作品；artist 有值时只作为识别作品的强约束，不代表输出 artist 可以照抄输入。',
    'clue 是用户输入的识别线索，可能是抽象描述、剧情、画面、主题或记忆片段；它只用于识别作品，不是最终 description，不要直接复制 clue 作为 description。',
    '当 category=music 且输入里有 musicCandidates 时，只能从 musicCandidates 中选择最匹配歌曲；可生成中文 description 和 tags，但 title/artist/year/coverUrl/link 必须优先使用候选原始字段。',
    '同名且不确定时返回 needsMoreContext=true，并给 candidates 2-3 项；不要强行确定。category=music 且 title 很短或常见（例如 Hero、Lemon、Stay）时，如果没有 musicCandidates，也必须根据常识返回最多 3 个最可能的歌曲 candidates 供用户选择，不要返回空结果。',
    '不要编造；不确定字段用空字符串或空数组。',
    'artist 字段按分类填写：音乐填歌手/艺术家；电影填导演；电视剧填主创/导演/编剧中最常用的负责人；书籍填作者；图片填艺术家/摄影师/创作者；文章填作者。能可靠确认时必须填写。电视剧不要填角色名或演员名，例如 东京爱情故事 不要返回 永尾完治，要返回 坂元裕二。',
    'title 使用作品原始语言标题；如果原始标题不是中文且有常用中文译名，格式为“原始标题（中文翻译）”。例如 The Creation of Adam（创造亚当）、千と千尋の神隠し（千与千寻）。',
    '如果作品原始标题就是中文，title 只保留中文原名，例如 三体；不要额外加括号。',
    'artist 必须优先使用创作者/团体的原文写法，不要默认翻译成中文，也不要优先改成英文罗马字；如果输入 artist 是中文译名或简体名，输出时必须尽量校正为原文写法。拉丁字母姓名必须返回拉丁原名，禁止返回中文音译名。只有无法可靠确认原文写法时才使用国际通用名。例如 楚门的世界 的导演不要返回 彼得·威尔，要返回 Peter Weir；宫崎骏/Hayao Miyazaki 要返回 宮崎駿；村上春树/Haruki Murakami 要返回 村上春樹；米开朗基罗要返回 Michelangelo Buonarroti；林俊杰仍返回 林俊杰。',
    'description 用中文 40-70 字；tags 必须是一行中文字符串数组，例如 "tags":["经典","文艺","电影"]；year 优先返回明确数字年份，不确定时为空字符串。',
    '严格返回这个结构：{"item":{"title":"","artist":"","description":"","tags":[],"year":"","coverUrl":"","link":"","confidence":0,"needsMoreContext":false},"candidates":[],"needsMoreContext":false}'
  ].join('\n');
}

function buildRepairPrompt(rawText, input) {
  return [
    '把下面模型输出修复为一个合法 JSON 对象，只返回一行 JSON，不要解释。',
    '必须使用双引号；数组元素之间必须有逗号；不要 Markdown；不要 <think>。',
    '如果原文没有可靠作品信息，根据输入的 title 或 clue 生成 needsMoreContext=true 的 JSON。',
    '如果是音乐短标题或同名作品，必须保留或生成最多 3 个候选 candidates，不要修成空 candidates。',
    '保留 title 语言规则：非中文原名用“原始标题（中文翻译）”，中文原名只保留中文；artist 优先使用创作者/团体的原文写法，不要默认翻译成中文，也不要优先改成英文罗马字；如果 artist 是中文译名或简体名，必须尽量校正为原文写法；拉丁字母姓名必须返回拉丁原名，禁止返回中文音译名；无法可靠确认原文写法时才使用国际通用名。',
    'artist 字段按分类填写：音乐=歌手/艺术家，电影=导演，电视剧=主创/导演/编剧，书籍=作者，图片=艺术家/摄影师，文章=作者。',
    'description 和 tags 必须是中文；tags 必须是字符串数组；year 优先为明确数字年份。',
    '目标格式：{"item":{"title":"","artist":"","description":"","tags":[],"year":"","coverUrl":"","link":"","confidence":0,"needsMoreContext":false},"candidates":[],"needsMoreContext":false}',
    '输入：' + JSON.stringify(input),
    '原文：' + cleanString(rawText).slice(0, 2500)
  ].join('\n');
}

function extractMessageContent(payload) {
  const choice = payload && payload.choices && payload.choices[0];
  if (!choice || !choice.message) return '';
  if (Array.isArray(choice.message.content)) {
    return choice.message.content.map(function (part) {
      return typeof part === 'string' ? part : cleanString(part && (part.text || part.content));
    }).join('');
  }
  return choice.message.content || choice.message.reasoning_content || '';
}

async function requestModelJson(input, options) {
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'api-key': options.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0.15,
      max_completion_tokens: 520,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'system',
          name: 'CurioVault',
          content: buildSystemPrompt()
        },
        {
          role: 'user',
          name: 'Admin',
          content: JSON.stringify(input)
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn('MiMo request failed', payload);
    throw new Error(getProviderError(payload));
  }
  return extractMessageContent(payload);
}

async function searchNetEaseSongs(input) {
  const query = buildNetEaseSearchQuery(input);
  if (!query) return [];

  const searchUrl = normalizeBaseUrl(process.env.NETEASE_MUSIC_SEARCH_URL || NETEASE_DEFAULT_SEARCH_URL);
  const method = cleanString(process.env.NETEASE_MUSIC_SEARCH_METHOD || 'POST').toUpperCase();
  const limit = clampInteger(process.env.NETEASE_MUSIC_SEARCH_LIMIT, 1, 10, 5);
  const headers = buildNetEaseHeaders();
  const payload = buildNetEaseCommonParams({
    bizContent: JSON.stringify({
      keyword: query,
      limit: String(limit),
      offset: '0',
      qualityFlag: true
    })
  });

  const response = await fetchWithTimeout(
    method === 'GET' ? appendQuery(searchUrl, payload) : searchUrl,
    {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(payload)
    },
    8000
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getNetEaseError(data));
  const candidates = normalizeNetEaseSongCandidates(data).slice(0, limit);
  return enrichNetEaseSongDetails(candidates);
}

function buildNetEaseSearchQuery(input) {
  return [input.title, input.artist].filter(Boolean).join(' ') || input.clue || '';
}

function buildNetEaseHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const apiKey = cleanString(process.env.NETEASE_MUSIC_API_KEY);
  const appKey = cleanString(process.env.NETEASE_MUSIC_APP_KEY);
  const appSecret = cleanString(process.env.NETEASE_MUSIC_APP_SECRET);
  if (apiKey) headers[process.env.NETEASE_MUSIC_API_KEY_HEADER || 'Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  if (appKey) headers[process.env.NETEASE_MUSIC_APP_KEY_HEADER || 'X-App-Key'] = appKey;
  if (appSecret) headers[process.env.NETEASE_MUSIC_APP_SECRET_HEADER || 'X-App-Secret'] = appSecret;
  return headers;
}

async function enrichNetEaseSongDetails(candidates) {
  const songIds = candidates.map((candidate) => candidate.id).filter(Boolean).slice(0, 500);
  if (!songIds.length) return candidates;

  const listUrl = cleanString(process.env.NETEASE_MUSIC_SONG_LIST_URL || NETEASE_DEFAULT_SONG_LIST_URL);
  const detailUrl = cleanString(process.env.NETEASE_MUSIC_SONG_DETAIL_URL || NETEASE_DEFAULT_SONG_DETAIL_URL);

  try {
    const method = cleanString(process.env.NETEASE_MUSIC_SONG_LIST_METHOD || 'POST').toUpperCase();
    const payload = buildNetEaseCommonParams({
      bizContent: JSON.stringify({
        qualityFlag: true,
        songIdList: songIds
      })
    });
    const response = await fetchWithTimeout(
      method === 'GET' ? appendQuery(listUrl, payload) : listUrl,
      {
        method,
        headers: buildNetEaseHeaders(),
        body: method === 'GET' ? undefined : JSON.stringify(payload)
      },
      8000
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(getNetEaseError(data));
    const details = normalizeNetEaseSongCandidates(data);
    return mergeNetEaseSongDetails(candidates, details);
  } catch (error) {
    console.warn('NetEase song list detail failed', error);
  }

  if (!detailUrl) return candidates;
  try {
    const details = await fetchNetEaseSongDetailCandidates(songIds.slice(0, 5), detailUrl);
    return mergeNetEaseSongDetails(candidates, details);
  } catch (error) {
    console.warn('NetEase single song detail failed', error);
    return candidates;
  }
}

async function fetchNetEaseSongDetailCandidates(songIds, detailUrl) {
  const method = cleanString(process.env.NETEASE_MUSIC_SONG_DETAIL_METHOD || 'POST').toUpperCase();
  const requests = songIds.map(async (songId) => {
    const payload = buildNetEaseCommonParams({
      bizContent: JSON.stringify({
        songId,
        withUrl: false,
        qualityFlag: true
      })
    });
    const response = await fetchWithTimeout(
      method === 'GET' ? appendQuery(detailUrl, payload) : detailUrl,
      {
        method,
        headers: buildNetEaseHeaders(),
        body: method === 'GET' ? undefined : JSON.stringify(payload)
      },
      8000
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(getNetEaseError(data));
    return normalizeNetEaseSongCandidates(data);
  });
  return (await Promise.all(requests)).flat();
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

function mergeNetEaseSongDetails(candidates, details) {
  const detailMap = new Map(details.map((detail) => [detail.id, detail]));
  return candidates.map((candidate) => {
    const detail = detailMap.get(candidate.id);
    if (!detail) return candidate;
    return Object.assign({}, candidate, {
      title: detail.title || candidate.title,
      artist: detail.artist || candidate.artist,
      tags: detail.tags.length ? detail.tags : candidate.tags,
      year: detail.year || candidate.year,
      coverUrl: detail.coverUrl || candidate.coverUrl,
      link: candidate.link || detail.link,
      album: detail.album || candidate.album,
      visible: detail.visible,
      playFlag: detail.playFlag
    });
  });
}

function normalizeNetEaseSongCandidates(payload) {
  const songs = findSongList(payload);
  return songs.map(normalizeNetEaseSong).filter(hasCandidateData);
}

function findSongList(value) {
  if (!value || typeof value !== 'object') return [];
  const directLists = [
    value.songs,
    value.list,
    Array.isArray(value.data) ? value.data : null,
    value.result && value.result.songs,
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

function normalizeNetEaseSong(song) {
  const album = song.album || song.al || {};
  const artists = normalizeArtists(firstNonEmptyArtistSource(song.artists, song.fullArtists, song.ar, song.singers, song.artist));
  const year = extractYear(song.publishTime || song.publishDate || album.publishTime || album.publishDate);
  const id = cleanString(song.id || song.songId || song.resourceId);
  const artistName = artists || cleanString(song.artistName || song.albumArtistName);
  return {
    id,
    title: cleanString(song.name || song.songName || song.title),
    artist: artistName,
    description: '',
    tags: normalizeTags(song.songTag).length ? normalizeTags(song.songTag) : ['音乐'],
    year,
    coverUrl: cleanString(song.coverImgUrl || song.coverUrl || song.picUrl || song.imgUrl || album.picUrl || album.coverUrl),
    link: cleanString(song.link || song.url || (id ? `https://music.163.com/#/song?id=${id}` : '')),
    confidence: 0.75,
    needsMoreContext: false,
    source: 'netease',
    album: cleanString(album.name || song.albumName),
    visible: typeof song.visible === 'boolean' ? song.visible : undefined,
    playFlag: typeof song.playFlag === 'boolean' ? song.playFlag : undefined
  };
}

function firstNonEmptyArtistSource() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (Array.isArray(value) && value.length) return value;
    if (value && !Array.isArray(value)) return value;
  }
  return null;
}

function normalizeArtists(value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value.map((item) => cleanString((item && (item.name || item.artistName)) || item)).filter(Boolean).join(' / ');
  }
  if (typeof value === 'object') return cleanString(value.name || value.artistName);
  return cleanString(value);
}

function parseModelJson(content) {
  if (!cleanString(content)) {
    throw new AutofillParseError('AI 返回为空，请重试或补充作者/导演。', {
      sample: ''
    });
  }

  const candidates = getParseCandidates(content);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw new AutofillParseError(FORMAT_ERROR_MESSAGE, {
    cause: lastError,
    sample: cleanString(content).slice(0, 500)
  });
}

async function parseOrRepairModelJson(content, input, options) {
  try {
    return parseModelJson(content);
  } catch (firstError) {
    try {
      const repaired = await repairModelJson(content, input, options);
      return parseModelJson(repaired);
    } catch (repairError) {
      console.warn('MiMo JSON parse failed', {
        firstError: firstError && firstError.message,
        repairError: repairError && repairError.message,
        sample: cleanString(content).slice(0, 500)
      });
      throw new AutofillParseError(FORMAT_ERROR_MESSAGE, {
        cause: repairError,
        sample: cleanString(content).slice(0, 500)
      });
    }
  }
}

async function repairModelJson(content, input, options) {
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'api-key': options.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0,
      max_completion_tokens: 350,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'system',
          name: 'CurioVault',
          content: '你是 JSON 修复器。只返回一行合法 JSON。'
        },
        {
          role: 'user',
          name: 'Admin',
          content: buildRepairPrompt(content, input)
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getProviderError(payload));
  return extractMessageContent(payload);
}

function getParseCandidates(content) {
  const sanitized = sanitizeModelText(content);
  const extracted = extractJsonObject(sanitized);
  const base = uniqueStrings([
    sanitized,
    extracted,
    softRepairJsonText(sanitized),
    softRepairJsonText(extracted)
  ]);

  return base.filter(Boolean);
}

function sanitizeModelText(content) {
  return cleanString(content)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function extractJsonObject(text) {
  const value = cleanString(text);
  const start = value.indexOf('{');
  if (start === -1) return value;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;

    if (depth === 0) return value.slice(start, index + 1);
  }

  return value.slice(start);
}

function softRepairJsonText(text) {
  return cleanString(text)
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/"(\s+)"/g, '","')
    .replace(/"\s+(?="[\w\u4e00-\u9fa5])/g, '",')
    .replace(/]\s+(?="[\w\u4e00-\u9fa5])/g, '],')
    .replace(/}\s+(?="[\w\u4e00-\u9fa5])/g, '},');
}

function normalizeModelResult(data, input) {
  const safeData = data && typeof data === 'object' ? data : createFallbackModelResult(input);
  const item = normalizeItem(safeData.item || safeData.result || safeData, input);
  const candidates = Array.isArray(safeData.candidates)
    ? safeData.candidates.map((candidate) => normalizeItem(candidate, input)).filter(hasCandidateData).slice(0, MAX_CANDIDATES)
    : [];

  return {
    item,
    candidates,
    needsMoreContext: Boolean(safeData.needsMoreContext || item.needsMoreContext)
  };
}

function createFallbackModelResult(input) {
  return {
    item: {
      title: input && input.title ? input.title : '',
      artist: '',
      description: '',
      tags: [],
      year: '',
      coverUrl: '',
      link: '',
      confidence: 0,
      needsMoreContext: true
    },
    candidates: [],
    needsMoreContext: true
  };
}

function createMusicCandidateFallback(input) {
  const candidates = Array.isArray(input && input.musicCandidates)
    ? input.musicCandidates.map((candidate) => normalizeItem(candidate, input)).filter(hasCandidateData).slice(0, MAX_CANDIDATES)
    : [];
  return {
    item: candidates[0] || createFallbackModelResult(input).item,
    candidates,
    needsMoreContext: candidates.length > 1
  };
}

function normalizeItem(item, input) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const artist = cleanString(safeItem.artist || safeItem.creator || safeItem.author || safeItem.director).slice(0, 120);
  const title = cleanString(safeItem.title || (input && input.title)).slice(0, 120);
  return {
    title,
    artist: normalizeOriginalArtistName(artist, title, input && input.category),
    description: cleanString(safeItem.description).slice(0, 180),
    tags: normalizeTags(safeItem.tags),
    year: cleanString(safeItem.year).slice(0, 24),
    coverUrl: cleanString(safeItem.coverUrl || safeItem.cover || safeItem.image || safeItem.picUrl).slice(0, 500),
    link: cleanString(safeItem.link || safeItem.url || safeItem.sourceUrl).slice(0, 500),
    confidence: clampConfidence(safeItem.confidence),
    needsMoreContext: Boolean(safeItem.needsMoreContext)
  };
}

function normalizeOriginalArtistName(value, title, category) {
  const titleKey = `${cleanString(category)}:${cleanString(title)}`;
  if (ORIGINAL_ARTIST_TITLE_OVERRIDES[titleKey]) return ORIGINAL_ARTIST_TITLE_OVERRIDES[titleKey];
  const artist = cleanString(value);
  if (!artist) return '';
  return ORIGINAL_ARTIST_ALIASES[artist] || artist;
}

function hasCandidateData(item) {
  return Boolean(item.title || item.artist || item.description || item.year || item.coverUrl || item.link || item.tags.length);
}

function normalizeTags(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[,，、/]/);
  return raw
    .map((tag) => cleanString(tag).slice(0, 16))
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index)
    .slice(0, 5);
}

function clampConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(1, confidence));
}

function clampInteger(value, min, max, fallback) {
  const number = parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function extractYear(value) {
  if (!value) return '';
  if (typeof value === 'number') {
    const date = value > 10000000000 ? new Date(value) : null;
    if (date && !Number.isNaN(date.getTime())) return String(date.getFullYear());
    if (value >= 1000 && value <= 9999) return String(value);
  }
  const match = String(value).match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? match[1] : '';
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
  if (!payload) return 'NetEase music search failed.';
  if (payload.error && payload.error.message) return payload.error.message;
  if (payload.message) return payload.message;
  if (payload.msg) return payload.msg;
  return 'NetEase music search failed.';
}

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function uniqueStrings(values) {
  return values.filter(Boolean).filter((value, index, list) => list.indexOf(value) === index);
}

function normalizeBaseUrl(value) {
  return cleanString(value).replace(/\/+$/, '');
}

function getProviderError(payload) {
  if (!payload) return 'MiMo request failed.';
  if (payload.error && payload.error.message) return payload.error.message;
  if (payload.base_resp && payload.base_resp.status_msg) return payload.base_resp.status_msg;
  if (payload.message) return payload.message;
  return 'MiMo request failed.';
}

function getPublicErrorMessage(error) {
  if (error instanceof AutofillParseError) return error.message;
  if (!error) return 'Autofill failed.';
  return error.message || String(error);
}

function AutofillParseError(message, details) {
  this.name = 'AutofillParseError';
  this.message = message || FORMAT_ERROR_MESSAGE;
  this.details = details || {};
  if (Error.captureStackTrace) Error.captureStackTrace(this, AutofillParseError);
}

AutofillParseError.prototype = Object.create(Error.prototype);
AutofillParseError.prototype.constructor = AutofillParseError;
