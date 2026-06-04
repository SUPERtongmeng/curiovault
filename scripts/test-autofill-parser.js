const assert = require('node:assert/strict');
const api = require('../api/autofillCollectionItem.js');

const {
  AutofillParseError,
  FORMAT_ERROR_MESSAGE,
  createMusicCandidateFallback,
  createFallbackModelResult,
  normalizeNetEaseSongCandidates,
  normalizeModelResult,
  normalizeRequest,
  parseModelJson
} = api.__test;

const input = normalizeRequest({
  category: 'movie',
  title: 'Wednesday',
  artist: '',
  clue: '',
  current: {}
});

const clueOnlyInput = normalizeRequest({
  category: 'images',
  title: '',
  artist: '',
  clue: 'a Japanese print with a huge wave',
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
    name: 'clue only request is accepted',
    run() {
      assert.equal(clueOnlyInput.title, '');
      assert.equal(clueOnlyInput.clue, 'a Japanese print with a huge wave');
      const parsed = parseModelJson(JSON.stringify({
        item: {
          title: 'The Great Wave off Kanagawa',
          artist: 'Katsushika Hokusai',
          description: '一幅以巨大海浪与远处富士山构成张力的日本浮世绘名作。',
          tags: ['浮世绘', '海浪', '日本艺术'],
          year: '1831',
          confidence: 0.86,
          needsMoreContext: false
        },
        candidates: [],
        needsMoreContext: false
      }));
      const result = normalizeModelResult(parsed, clueOnlyInput);
      assert.equal(result.item.title, 'The Great Wave off Kanagawa');
      assert.equal(result.item.artist, 'Katsushika Hokusai');
    }
  },
  {
    name: 'title plus clue request keeps both fields',
    run() {
      const request = normalizeRequest({
        category: 'movie',
        title: 'family spies',
        artist: '',
        clue: 'Korean movie about agents pretending to be a family',
        current: {}
      });
      assert.equal(request.title, 'family spies');
      assert.equal(request.clue, 'Korean movie about agents pretending to be a family');
    }
  },
  {
    name: 'vague clue can return candidates',
    run() {
      const parsed = parseModelJson(JSON.stringify({
        item: { title: '', tags: [], needsMoreContext: true },
        candidates: [
          { title: 'Candidate One', artist: 'Creator One', year: '2001' },
          { title: 'Candidate Two', artist: 'Creator Two', tags: ['可能结果'] }
        ],
        needsMoreContext: true
      }));
      const result = normalizeModelResult(parsed, clueOnlyInput);
      assert.equal(result.needsMoreContext, true);
      assert.equal(result.candidates.length, 2);
    }
  },
  {
    name: 'netease song candidates are normalized',
    run() {
      const candidates = normalizeNetEaseSongCandidates({
        result: {
          songs: [
            {
              id: 123,
              name: 'Time Machine',
              ar: [{ name: 'bluesky' }],
              al: { name: 'Album', picUrl: 'https://example.com/cover.jpg' },
              publishTime: 1704067200000
            }
          ]
        }
      });
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].title, 'Time Machine');
      assert.equal(candidates[0].artist, 'bluesky');
      assert.equal(candidates[0].year, '2024');
      assert.equal(candidates[0].coverUrl, 'https://example.com/cover.jpg');
      assert.equal(candidates[0].link, 'https://music.163.com/#/song?id=123');
    }
  },
  {
    name: 'netease official search records are normalized',
    run() {
      const candidates = normalizeNetEaseSongCandidates({
        code: 200,
        data: {
          recordCount: 1,
          records: [
            {
              id: '1CE4E2A5D6869390649E6FF192436A5F',
              name: '陈酒新茶令',
              artists: [],
              fullArtists: [{ id: null, name: 'Assen捷&东篱' }],
              album: { id: 'album-1', name: '原创作品集' },
              coverImgUrl: 'http://p1.music.126.net/search.jpg',
              songTag: null,
              playFlag: true,
              visible: true
            }
          ]
        }
      });
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].title, '陈酒新茶令');
      assert.equal(candidates[0].artist, 'Assen捷&东篱');
      assert.equal(candidates[0].album, '原创作品集');
      assert.equal(candidates[0].coverUrl, 'http://p1.music.126.net/search.jpg');
    }
  },
  {
    name: 'netease song detail response is normalized',
    run() {
      const candidates = normalizeNetEaseSongCandidates({
        code: 200,
        subCode: '200',
        data: [
          {
            id: '0ACE1D9BB5D16A2249ECD8DF64F0D267',
            name: '愿与愁',
            coverImgUrl: 'http://p1.music.126.net/example.jpg',
            artists: [{ id: 'artist-1', name: '林俊杰' }],
            album: { id: 'album-1', name: '愿与愁' },
            songTag: ['流行', '华语流行'],
            visible: true,
            playFlag: false
          }
        ]
      });
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].title, '愿与愁');
      assert.equal(candidates[0].artist, '林俊杰');
      assert.deepEqual(candidates[0].tags, ['流行', '华语流行']);
      assert.equal(candidates[0].coverUrl, 'http://p1.music.126.net/example.jpg');
      assert.equal(candidates[0].link, 'https://music.163.com/#/song?id=0ACE1D9BB5D16A2249ECD8DF64F0D267');
    }
  },
  {
    name: 'music fallback returns netease candidates when model json fails',
    run() {
      const request = normalizeRequest({
        category: 'music',
        title: '愿与愁',
        artist: '林俊杰',
        clue: '',
        current: {}
      });
      request.musicCandidates = normalizeNetEaseSongCandidates({
        code: 200,
        data: {
          records: [
            {
              id: '0ACE1D9BB5D16A2249ECD8DF64F0D267',
              name: '愿与愁',
              artists: [{ name: '林俊杰' }],
              coverImgUrl: 'http://p1.music.126.net/example.jpg'
            }
          ]
        }
      });
      const fallback = createMusicCandidateFallback(request);
      assert.equal(fallback.item.title, '愿与愁');
      assert.equal(fallback.item.artist, '林俊杰');
      assert.equal(fallback.candidates.length, 1);
      assert.equal(fallback.needsMoreContext, false);
    }
  },
  {
    name: 'parse failure fallback is structured and non-empty title',
    run() {
      const fallback = createFallbackModelResult(input);
      assert.equal(fallback.item.title, 'Wednesday');
      assert.equal(fallback.item.needsMoreContext, true);
      assert.equal(fallback.needsMoreContext, true);
      assert.deepEqual(fallback.candidates, []);
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
