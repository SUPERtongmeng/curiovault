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

  const apiKey = process.env.MINIMAX_API_KEY;
  const model = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';
  const baseUrl = normalizeBaseUrl(process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1');

  if (!apiKey) {
    res.status(500).json({ error: 'MINIMAX_API_KEY is not configured.' });
    return;
  }

  const input = normalizeRequest(req.body || {});
  if (!input.title) {
    res.status(400).json({ error: 'Title is required.' });
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        max_completion_tokens: 450,
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
      console.warn('MiniMax request failed', payload);
      res.status(502).json({ error: getMiniMaxError(payload) });
      return;
    }

    const content = extractMessageContent(payload);
    const parsed = await parseOrRepairModelJson(content, input, { apiKey, baseUrl, model });
    res.status(200).json(normalizeModelResult(parsed, input));
  } catch (error) {
    console.error('Autofill failed', error);
    res.status(error instanceof AutofillParseError ? 422 : 500).json({
      error: getPublicErrorMessage(error)
    });
  }
}

module.exports = handler;
module.exports.__test = {
  AutofillParseError,
  FORMAT_ERROR_MESSAGE,
  buildRepairPrompt,
  buildSystemPrompt,
  createFallbackModelResult,
  extractJsonObject,
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

function normalizeRequest(body) {
  const category = cleanString(body.category);
  return {
    category: ALLOWED_CATEGORIES.has(category) ? category : 'music',
    categoryLabel: CATEGORY_LABELS[category] || CATEGORY_LABELS.music,
    title: cleanString(body.title).slice(0, 120),
    artist: cleanString(body.artist).slice(0, 120),
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
    '根据 category/title/artist 识别作品；artist 有值时作为强约束。',
    '同名且不确定时返回 needsMoreContext=true，并给 candidates 2-5 项；不要强行确定。',
    '不要编造；不确定字段用空字符串或空数组。',
    'title 使用作品原始语言标题；如果原始标题不是中文且有常用中文译名，格式为“原始标题（中文翻译）”。例如 The Creation of Adam（创造亚当）、千と千尋の神隠し（千与千寻）。',
    '如果作品原始标题就是中文，title 只保留中文原名，例如 三体；不要额外加括号。',
    'artist 使用创作者原始语言姓名或国际通用姓名，不要默认翻译成中文，例如 Michelangelo Buonarroti、宮崎駿。',
    'description 用中文 40-70 字；tags 必须是一行中文字符串数组，例如 "tags":["经典","文艺","电影"]；year 优先返回明确数字年份，不确定时为空字符串。',
    '严格返回这个结构：{"item":{"title":"","artist":"","description":"","tags":[],"year":"","confidence":0,"needsMoreContext":false},"candidates":[],"needsMoreContext":false}'
  ].join('\n');
}

function buildRepairPrompt(rawText, input) {
  return [
    '把下面模型输出修复为一个合法 JSON 对象，只返回一行 JSON，不要解释。',
    '必须使用双引号；数组元素之间必须有逗号；不要 Markdown；不要 <think>。',
    '如果原文没有可靠作品信息，根据输入生成 needsMoreContext=true 的 JSON。',
    '保留 title 语言规则：非中文原名用“原始标题（中文翻译）”，中文原名只保留中文；artist 使用原始语言姓名或国际通用姓名。',
    'description 和 tags 必须是中文；tags 必须是字符串数组；year 优先为明确数字年份。',
    '目标格式：{"item":{"title":"","artist":"","description":"","tags":[],"year":"","confidence":0,"needsMoreContext":false},"candidates":[],"needsMoreContext":false}',
    '输入：' + JSON.stringify(input),
    '原文：' + cleanString(rawText).slice(0, 2500)
  ].join('\n');
}

function extractMessageContent(payload) {
  const choice = payload && payload.choices && payload.choices[0];
  if (!choice || !choice.message) return '';
  return choice.message.content || '';
}

function parseModelJson(content) {
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
      console.warn('MiniMax JSON parse failed', {
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
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0,
      max_completion_tokens: 350,
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
  if (!response.ok) throw new Error(getMiniMaxError(payload));
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
    ? safeData.candidates.map((candidate) => normalizeItem(candidate, input)).filter(hasCandidateData).slice(0, 5)
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
      confidence: 0,
      needsMoreContext: true
    },
    candidates: [],
    needsMoreContext: true
  };
}

function normalizeItem(item, input) {
  const safeItem = item && typeof item === 'object' ? item : {};
  return {
    title: cleanString(safeItem.title || (input && input.title)).slice(0, 120),
    artist: cleanString(safeItem.artist || safeItem.creator || safeItem.author || safeItem.director).slice(0, 120),
    description: cleanString(safeItem.description).slice(0, 180),
    tags: normalizeTags(safeItem.tags),
    year: cleanString(safeItem.year).slice(0, 24),
    confidence: clampConfidence(safeItem.confidence),
    needsMoreContext: Boolean(safeItem.needsMoreContext)
  };
}

function hasCandidateData(item) {
  return Boolean(item.title || item.artist || item.description || item.year || item.tags.length);
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

function getMiniMaxError(payload) {
  if (!payload) return 'MiniMax request failed.';
  if (payload.error && payload.error.message) return payload.error.message;
  if (payload.base_resp && payload.base_resp.status_msg) return payload.base_resp.status_msg;
  if (payload.message) return payload.message;
  return 'MiniMax request failed.';
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
