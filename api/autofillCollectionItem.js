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
    const response = await fetch('https://api.minimax.io/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: 900,
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
    const parsed = parseModelJson(content);
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
    '你是 CurioVault 收藏后台的元数据助手。',
    '你只返回 JSON，不要 Markdown，不要解释。',
    '根据用户给出的 category/title/artist 推断作品信息。',
    '如果 title 对应多个知名作品，artist 为空时不要强行确定；返回 needsMoreContext=true，并在 candidates 里给出 2-5 个可能项。',
    '如果 artist 已提供，把它作为强约束。',
    '不要编造不存在的信息；不确定的字段返回空字符串或空数组。',
    'description 使用中文，40-80 字，适合收藏网站展示。',
    'tags 返回 3-5 个中文短标签。',
    'year 可返回年份、年代或世纪，如 "1889"、"19世纪"、"约1830"。',
    'confidence 为 0 到 1。',
    'JSON 格式固定为：{"item":{"title":"","artist":"","description":"","tags":[],"year":"","confidence":0,"needsMoreContext":false},"candidates":[],"needsMoreContext":false}'
  ].join('\n');
}

function extractMessageContent(payload) {
  const choice = payload && payload.choices && payload.choices[0];
  if (!choice || !choice.message) return '';
  return choice.message.content || '';
}

function parseModelJson(content) {
  let text = cleanString(content)
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

function getMiniMaxError(payload) {
  if (!payload) return 'MiniMax request failed.';
  if (payload.error && payload.error.message) return payload.error.message;
  if (payload.base_resp && payload.base_resp.status_msg) return payload.base_resp.status_msg;
  if (payload.message) return payload.message;
  return 'MiniMax request failed.';
}
