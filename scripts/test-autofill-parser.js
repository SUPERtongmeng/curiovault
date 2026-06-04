const assert = require('node:assert/strict');
const api = require('../api/autofillCollectionItem.js');

const {
  AutofillParseError,
  FORMAT_ERROR_MESSAGE,
  normalizeModelResult,
  normalizeRequest,
  parseModelJson
} = api.__test;

const input = normalizeRequest({
  category: 'movie',
  title: 'Wednesday',
  artist: '',
  current: {}
});

const completeItem = {
  item: {
    title: 'Wednesday',
    artist: 'Tim Burton',
    description: '一部带有黑色幽默和哥特气质的青春奇幻剧，围绕少女的校园生活与谜案展开。',
    tags: ['哥特', '悬疑', '青春'],
    year: '2022',
    confidence: 0.91,
    needsMoreContext: false
  },
  candidates: [],
  needsMoreContext: false
};

const tests = [
  {
    name: 'normal json',
    run() {
      const parsed = parseModelJson(JSON.stringify(completeItem));
      const result = normalizeModelResult(parsed, input);
      assert.equal(result.item.title, 'Wednesday');
      assert.equal(result.item.artist, 'Tim Burton');
      assert.deepEqual(result.item.tags, ['哥特', '悬疑', '青春']);
    }
  },
  {
    name: 'markdown wrapped json',
    run() {
      const parsed = parseModelJson('```json\n' + JSON.stringify(completeItem) + '\n```');
      assert.equal(parsed.item.year, '2022');
    }
  },
  {
    name: 'think block before json',
    run() {
      const parsed = parseModelJson('<think>searching</think>' + JSON.stringify(completeItem));
      assert.equal(parsed.item.artist, 'Tim Burton');
    }
  },
  {
    name: 'extra explanatory text',
    run() {
      const parsed = parseModelJson('这是结果：' + JSON.stringify(completeItem) + ' 请确认。');
      assert.equal(parsed.item.title, 'Wednesday');
    }
  },
  {
    name: 'missing comma between array string elements',
    run() {
      const parsed = parseModelJson('{"item":{"title":"Wednesday","artist":"Tim Burton","description":"中文描述","tags":["哥特" "悬疑" "青春"],"year":"2022","confidence":0.8,"needsMoreContext":false},"candidates":[],"needsMoreContext":false}');
      const result = normalizeModelResult(parsed, input);
      assert.deepEqual(result.item.tags, ['哥特', '悬疑', '青春']);
    }
  },
  {
    name: 'wrong field types are normalized',
    run() {
      const parsed = parseModelJson('{"item":{"title":"Wednesday","artist":"Tim Burton","description":"中文描述","tags":"哥特,悬疑,青春","year":2022,"confidence":"0.7","needsMoreContext":false},"candidates":{"title":"bad"},"needsMoreContext":false}');
      const result = normalizeModelResult(parsed, input);
      assert.deepEqual(result.item.tags, ['哥特', '悬疑', '青春']);
      assert.equal(result.item.year, '2022');
      assert.deepEqual(result.candidates, []);
    }
  },
  {
    name: 'multiple candidates',
    run() {
      const parsed = parseModelJson(JSON.stringify({
        item: { title: '同名作品', tags: [], needsMoreContext: true },
        candidates: [
          { title: '作品 A', artist: '作者 A', tags: ['候选'] },
          { title: '作品 B', artist: '作者 B', year: '1999' }
        ],
        needsMoreContext: true
      }));
      const result = normalizeModelResult(parsed, input);
      assert.equal(result.needsMoreContext, true);
      assert.equal(result.candidates.length, 2);
      assert.equal(result.candidates[0].title, '作品 A');
    }
  },
  {
    name: 'unparseable output returns friendly parser error',
    run() {
      assert.throws(
        () => parseModelJson('这里没有任何 JSON，只是一段普通文本。'),
        (error) => error instanceof AutofillParseError && error.message === FORMAT_ERROR_MESSAGE
      );
    }
  }
];

let passed = 0;

for (const test of tests) {
  try {
    test.run();
    passed += 1;
    console.log('[pass]', test.name);
  } catch (error) {
    console.error('[fail]', test.name);
    console.error(error);
    process.exitCode = 1;
    break;
  }
}

if (!process.exitCode) {
  console.log(`Autofill parser robustness: ${passed}/${tests.length} passed.`);
}
