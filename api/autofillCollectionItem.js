const ALLOWED_CATEGORIES = new Set(['music', 'movie', 'tv', 'books', 'images', 'articles']);
const CATEGORY_LABELS = {
  music: '音乐',
  movie: '电影',
  tv: '电视剧',
  books: '书籍',
  images: '图片',
  articles: '文章'
};

module.exports = async function handler(req, res) {
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
        temperature: 0.2,
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
    const result = normalizeModelResult(parsed, input);
    res.status(200).json(result);
  } catch (error) {
    console.error('Autofill failed', error);
    res.status(500).json({ error: error.message || 'Autofill failed.' });
  }
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
    '你是收藏后台元数据助手。只返回一个可被 JSON.parse 解析的 JSON 对象。',
    '禁止输出 <think>、Markdown、代码块、解释文字或 JSON 之外的任何内容。',
    '根据 category/title/artist 识别作品。artist 有值时作为强约束。',
    '同名且不确定时返回 needsMoreContext=true，并给 candidates 2-5 项；不要强行确定。',
    '不要编造；不确定字段用空字符串或空数组。',
    'title 使用作品原始语言标题；如果原始标题不是中文且有常用中文译名，格式为“原始标题（中文翻译）”，例如 The Creation of Adam（创造亚当）、千と千尋の神隠し（千与千寻）。',
    '如果作品原始标题就是中文，title 只保留中文原名，例如 三体；不要额外加括号。',
    'artist 使用创作者原始语言姓名或国际通用姓名，不要默认翻译成中文，例如 Michelangelo Buonarroti、宮崎駿。',
    'description 中文 40-70 字；tags 为 3-5 个中文短标签；year 优先返回明确数字年份，不确定时可为空。',
    '格式：{"item":{"title":"","artist":"","description":"","tags":[],"year":"","confidence":0,"needsMoreContext":false},"candidates":[],"needsMoreContext":false}'
  ].join('\n');
}

function buildRepairPrompt(rawText, input) {
  return [
    '把下面模型输出修复为一个合法 JSON 对象，只返回 JSON，不要解释。',
    '如果原文没有可靠作品信息，根据输入生成 needsMoreContext=true 的 JSON。',
    '保留 title 的语言规则：非中文原名用“原始标题（中文翻译）”，中文原名只保留中文；artist 使用原始语言姓名或国际通用姓名。',
    'description 和 tags 必须是中文；year 优先为明确数字年份。',
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
  let text = cleanString(content)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  if (!text) throw new Error('MiniMax returned an empty response.');

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text);
}

async function parseOrRepairModelJson(content, input, options) {
  try {
    return parseModelJson(content);
  } catch (error) {
    const repaired = await repairModelJson(content, input, options);
    return parseModelJson(repaired);
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
          content: '你是 JSON 修复器。只返回合法 JSON。'
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

function normalizeModelResult(data, input) {
  const item = normalizeItem(data.item || data.result || data, input);
  const candidates = Array.isArray(data.candidates)
    ? data.candidates.map((candidate) => normalizeItem(candidate, input)).filter(hasCandidateData).slice(0, 5)
    : [];

  return {
    item,
    candidates,
    needsMoreContext: Boolean(data.needsMoreContext || item.needsMoreContext)
  };
}

function normalizeItem(item, input) {
  item = item || {};
  return {
    title: cleanString(item.title || input.title).slice(0, 120),
    artist: cleanString(item.artist || item.creator || item.author || item.director).slice(0, 120),
    description: cleanString(item.description).slice(0, 180),
    tags: normalizeTags(item.tags),
    year: cleanString(item.year).slice(0, 24),
    confidence: clampConfidence(item.confidence),
    needsMoreContext: Boolean(item.needsMoreContext)
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
