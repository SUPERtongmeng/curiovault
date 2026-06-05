const assert = require('node:assert/strict');
const api = require('../api/autofillCollectionItem.js');

const {
  AutofillParseError,
  FORMAT_ERROR_MESSAGE,
  MAX_CANDIDATES,
  buildRepairPrompt,
  buildSystemPrompt,
  createMusicCandidateFallback,
  createFallbackModelResult,
  normalizeNetEaseSongCandidates,
  normalizeExcludedCandidates,
  normalizeOriginalArtistName,
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
    name: 'translated artist aliases are normalized to original names',
    run() {
      assert.equal(normalizeOriginalArtistName('彼得·威尔'), 'Peter Weir');
      assert.equal(normalizeOriginalArtistName('宫崎骏'), '宮崎駿');
      assert.equal(normalizeOriginalArtistName('乔治·奥威尔'), 'George Orwell');
      assert.equal(normalizeOriginalArtistName('永尾完治', '东京爱情故事', 'tv'), '坂元裕二');
      assert.equal(normalizeOriginalArtistName('彼得·威尔', '楚门的世界', 'movie'), 'Peter Weir');
      assert.equal(normalizeOriginalArtistName('葛饰北斋', '神奈川冲浪里', 'images'), '葛飾北斎');

      const result = normalizeModelResult(parseModelJson(JSON.stringify({
        item: {
          title: '楚门的世界',
          artist: '彼得·威尔',
          tags: ['电影'],
          needsMoreContext: false
        },
        candidates: [],
        needsMoreContext: false
      })), input);
      assert.equal(result.item.artist, 'Peter Weir');

      const tvInput = normalizeRequest({
        category: 'tv',
        title: '东京爱情故事',
        artist: '',
        clue: '',
        current: {}
      });
      const tvResult = normalizeModelResult(parseModelJson(JSON.stringify({
        item: {
          title: '东京爱情故事',
          artist: '永尾完治',
          tags: ['日剧'],
          needsMoreContext: false
        },
        candidates: [],
        needsMoreContext: false
      })), tvInput);
      assert.equal(tvResult.item.artist, '坂元裕二');
    }
  },
  {
    name: 'model candidates are limited to three',
    run() {
      assert.equal(MAX_CANDIDATES, 3);
      const result = normalizeModelResult(parseModelJson(JSON.stringify({
        item: { title: 'Hero', tags: [], needsMoreContext: true },
        candidates: [
          { title: 'Hero 1', artist: 'Artist 1' },
          { title: 'Hero 2', artist: 'Artist 2' },
          { title: 'Hero 3', artist: 'Artist 3' },
          { title: 'Hero 4', artist: 'Artist 4' }
        ],
        needsMoreContext: true
      })), input);
      assert.equal(result.candidates.length, 3);
      assert.equal(result.candidates[2].title, 'Hero 3');
    }
  },
  {
    name: 'excluded candidates are omitted from next batch',
    run() {
      const request = normalizeRequest({
        category: 'music',
        title: 'Hero',
        excludedCandidates: [
          { title: 'Hero', artist: 'Mariah Carey', year: '1993' },
          { title: 'Hero', artist: 'Enrique Iglesias', year: '2001' }
        ],
        current: {}
      });
      assert.equal(normalizeExcludedCandidates(request.excludedCandidates).length, 2);
      const result = normalizeModelResult(parseModelJson(JSON.stringify({
        item: { title: 'Hero', artist: 'Mariah Carey', year: '1993', tags: ['流行'], needsMoreContext: false },
        candidates: [
          { title: 'Hero', artist: 'Mariah Carey', year: '1993' },
          { title: 'Hero', artist: 'Enrique Iglesias', year: '2001' },
          { title: 'Hero', artist: 'Chad Kroeger', year: '2002' },
          { title: 'Hero', artist: 'Family of the Year', year: '2012' }
        ],
        needsMoreContext: true
      })), request);
      assert.equal(result.item.artist, '');
      assert.equal(result.item.needsMoreContext, true);
      assert.equal(result.candidates.length, 2);
      assert.equal(result.candidates[0].artist, 'Chad Kroeger');
      assert.equal(result.candidates[1].artist, 'Family of the Year');
    }
  },
  {
    name: 'system prompt requires original artist names',
    run() {
      const prompt = buildSystemPrompt();
      assert.match(prompt, /artist 必须优先使用创作者\/团体的原文写法/);
      assert.match(prompt, /电视剧不要填角色名或演员名/);
      assert.match(prompt, /东京爱情故事 不要返回 永尾完治，要返回 坂元裕二/);
      assert.match(prompt, /不代表输出 artist 可以照抄输入/);
      assert.match(prompt, /不要默认翻译成中文/);
      assert.match(prompt, /不要优先改成英文罗马字/);
      assert.match(prompt, /如果输入 artist 是中文译名或简体名/);
      assert.match(prompt, /拉丁字母姓名必须返回拉丁原名/);
      assert.match(prompt, /禁止返回中文音译名/);
      assert.match(prompt, /楚门的世界 的导演不要返回 彼得·威尔，要返回 Peter Weir/);
      assert.match(prompt, /宫崎骏\/Hayao Miyazaki 要返回 宮崎駿/);
      assert.match(prompt, /村上春树\/Haruki Murakami 要返回 村上春樹/);
      assert.match(prompt, /宮崎駿/);
      assert.match(prompt, /村上春樹/);
      assert.match(prompt, /Michelangelo Buonarroti/);
      assert.match(prompt, /林俊杰/);
      assert.match(prompt, /同名且不确定时返回 needsMoreContext=true，并给 candidates 2-3 项/);
      assert.match(prompt, /例如 Hero、Lemon、Stay/);
      assert.match(prompt, /最多 3 个最可能的歌曲 candidates/);
      assert.match(prompt, /excludedCandidates/);
      assert.match(prompt, /不要重复返回/);
    }
  },
  {
    name: 'repair prompt keeps original artist name rule',
    run() {
      const prompt = buildRepairPrompt('{"item":{"artist":"Hayao Miyazaki"}}', input);
      assert.match(prompt, /artist 优先使用创作者\/团体的原文写法/);
      assert.match(prompt, /不要默认翻译成中文/);
      assert.match(prompt, /不要优先改成英文罗马字/);
      assert.match(prompt, /如果 artist 是中文译名或简体名/);
      assert.match(prompt, /拉丁字母姓名必须返回拉丁原名/);
      assert.match(prompt, /禁止返回中文音译名/);
      assert.match(prompt, /音乐短标题或同名作品/);
      assert.match(prompt, /最多 3 个候选 candidates/);
      assert.match(prompt, /不要把这些已排除候选修回 item 或 candidates/);
      assert.match(prompt, /无法可靠确认原文写法时才使用国际通用名/);
    }
  },
  {
    name: 'japanese creator original name is preserved',
    run() {
      const parsed = parseModelJson(JSON.stringify({
        item: {
          title: '千と千尋の神隠し（千与千寻）',
          artist: '宮崎駿',
          description: '少女误入神灵世界后经历冒险与成长，最终找回勇气和亲情的经典动画电影。',
          tags: ['动画', '奇幻', '日本电影'],
          year: '2001',
          confidence: 0.92,
          needsMoreContext: false
        },
        candidates: [],
        needsMoreContext: false
      }));
      const result = normalizeModelResult(parsed, input);
      assert.equal(result.item.artist, '宮崎駿');
      assert.notEqual(result.item.artist, '宫崎骏');
      assert.notEqual(result.item.artist, 'Hayao Miyazaki');
    }
  },
  {
    name: 'western and chinese original artist names are preserved',
    run() {
      const western = normalizeModelResult(parseModelJson(JSON.stringify({
        item: {
          title: 'The Creation of Adam（创造亚当）',
          artist: 'Michelangelo Buonarroti',
          tags: ['艺术'],
          needsMoreContext: false
        },
        candidates: [],
        needsMoreContext: false
      })), input);
      assert.equal(western.item.artist, 'Michelangelo Buonarroti');

      const chinese = normalizeModelResult(parseModelJson(JSON.stringify({
        item: {
          title: '愿与愁',
          artist: '林俊杰',
          tags: ['音乐'],
          needsMoreContext: false
        },
        candidates: [],
        needsMoreContext: false
      })), input);
      assert.equal(chinese.item.artist, '林俊杰');
    }
  },
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
