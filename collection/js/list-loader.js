// Shared Firestore data layer and page-specific renderers.
(function () {
  var CATEGORY_LABELS = {
    music: '音乐',
    movie: '电影',
    tv: '电视剧',
    books: '书籍',
    images: '图片',
    articles: '文章'
  };

  window.CollectionData = {
    initFirebase: initFirebase,
    loadItems: loadItems,
    getTime: getTime,
    esc: esc,
    escAttr: escAttr,
    getCategoryLabel: getCategoryLabel
  };

  bootPageRenderer();

  function initFirebase() {
    if (typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined') {
      throw new Error('Firebase 未加载');
    }
    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
    } catch (error) {
      if (!/already exists|already been created/i.test(error.message || '')) {
        throw error;
      }
    }
    return firebase.firestore();
  }

  function loadItems(categories) {
    var db = initFirebase();
    return Promise.all(categories.map(function (category) {
      return db.collection('items')
        .where('category', '==', category)
        .get()
        .then(function (snapshot) {
          return snapshot.docs.map(function (doc) {
            var data = doc.data() || {};
            data.id = doc.id;
            return data;
          });
        });
    })).then(function (groups) {
      return groups.reduce(function (list, group) {
        return list.concat(group);
      }, []).sort(function (a, b) {
        return getTime(b.createdAt) - getTime(a.createdAt);
      });
    });
  }

  function bootPageRenderer() {
    var page = document.body.dataset.collectionPage;
    var config = {
      music: {
        categories: ['music'],
        render: renderMusic
      },
      film: {
        categories: ['movie', 'tv'],
        render: renderFilm
      },
      books: {
        categories: ['books'],
        render: renderBooks
      },
      images: {
        categories: ['images'],
        render: renderImages
      },
      articles: {
        categories: ['articles'],
        render: renderArticles
      }
    }[page];

    if (!config) return;
    setLoading(page);
    loadItems(config.categories)
      .then(function (items) {
        config.render(items);
      })
      .catch(function (error) {
        console.error('Firestore error:', error);
        setError(page, '加载失败');
      });
  }

  function renderMusic(items) {
    var feature = document.getElementById('musicFeature');
    var queue = document.getElementById('musicQueue');
    if (!feature || !queue) return;
    if (items.length === 0) {
      feature.innerHTML = emptyBlock('还没有音乐收藏');
      queue.innerHTML = '';
      return;
    }

    var selectedIndex = 0;

    function renderSelectedMusic(item, animateCover) {
      feature.innerHTML = [
        '<div class="music-player-content">',
        '<div class="music-player-cover' + (animateCover ? ' is-switching' : '') + '">' + coverImg(item) + '</div>',
        '<div class="music-player-meta">',
        '<h1>' + esc(item.title || '未命名音乐') + '</h1>',
        '<p>' + esc(item.artist || item.description || '未填写艺术家') + '</p>',
        '</div>',
        '<div class="music-player-controls" aria-label="音乐控制">',
        '<button class="music-panel-btn" type="button" data-music-action="prev" aria-label="上一首"><i class="fa-solid fa-backward-step"></i></button>',
        '<button class="music-panel-btn music-panel-play" type="button" aria-label="播放"><i class="fa-solid fa-play"></i></button>',
        '<button class="music-panel-btn" type="button" data-music-action="next" aria-label="下一首"><i class="fa-solid fa-forward-step"></i></button>',
        '</div>',
        '<div class="music-player-progress" aria-hidden="true"><span></span></div>',
        '</div>'
      ].join('');
    }

    function applyDistances(centerIndex) {
      queue.querySelectorAll('.music-track').forEach(function (track) {
        var dist = Math.abs(Number(track.dataset.index) - centerIndex);
        track.classList.toggle('is-active', dist === 0);
        track.style.setProperty('--dist', dist);
      });
    }

    function setSelected(index) {
      var nextIndex = Math.max(0, Math.min(items.length - 1, index));
      var animateCover = feature.querySelector('.music-player-cover') !== null && nextIndex !== selectedIndex;
      selectedIndex = nextIndex;
      renderSelectedMusic(items[selectedIndex], animateCover);
      updateMusicPalette(items[selectedIndex]);
      applyDistances(selectedIndex);
    }

    queue.innerHTML = items.map(function (item, index) {
      return [
        '<article class="music-track' + (index === 0 ? ' is-active' : '') + '" role="button" tabindex="0" data-index="' + index + '">',
        '<div class="track-cover">' + coverImg(item) + '</div>',
        '<div class="track-info"><strong>' + esc(item.title || '未命名音乐') + '</strong><span>' + esc(item.artist || item.year || '') + '</span></div>',
        '</article>'
      ].join('');
    }).join('');

    queue.querySelectorAll('.music-track').forEach(function (track) {
      track.addEventListener('click', function () {
        setSelected(Number(track.dataset.index) || 0);
      });
      track.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setSelected(Number(track.dataset.index) || 0);
      });
      track.addEventListener('mouseenter', function () {
        applyDistances(Number(track.dataset.index) || 0);
      });
    });

    queue.addEventListener('mouseleave', function () {
      applyDistances(selectedIndex);
    });

    feature.addEventListener('click', function (event) {
      var action = event.target.closest('[data-music-action]');
      if (!action) return;
      if (action.dataset.musicAction === 'prev') setSelected(selectedIndex - 1);
      if (action.dataset.musicAction === 'next') setSelected(selectedIndex + 1);
    });

    setSelected(0);
  }

  function updateMusicPalette(item) {
    if (window.updateMusicFluidPalette) {
      window.updateMusicFluidPalette(item);
      return;
    }
    document.dispatchEvent(new CustomEvent('music:coverchange', { detail: item }));
  }

  function renderFilm(items) {
    var movieList = document.getElementById('movieList');
    var tvList = document.getElementById('tvList');
    if (!movieList || !tvList) return;
    var movies = items.filter(function (item) { return item.category === 'movie'; });
    var tvs = items.filter(function (item) { return item.category === 'tv'; });
    movieList.innerHTML = movies.length ? movies.map(filmCard).join('') : emptyBlock('还没有电影收藏');
    tvList.innerHTML = tvs.length ? tvs.map(filmCard).join('') : emptyBlock('还没有电视剧收藏');
  }

  function renderBooks(items) {
    var shelf = document.getElementById('bookShelf');
    if (!shelf) return;
    shelf.innerHTML = items.length ? items.map(function (item) {
      return [
        '<article class="book-card">',
        '<div class="book-cover">' + coverImg(item) + '</div>',
        '<div><h2>' + esc(item.title || '未命名书籍') + '</h2>',
        '<p>' + esc(item.artist || '未填写作者') + '</p>',
        '<span>' + esc(item.year || '') + ' ' + stars(item.rating) + '</span></div>',
        '</article>'
      ].join('');
    }).join('') : emptyBlock('还没有书籍收藏');
  }

  function renderImages(items) {
    var gallery = document.getElementById('imageGallery');
    if (!gallery) return;
    gallery.innerHTML = items.length ? items.map(function (item) {
      return [
        '<figure class="image-tile">',
        coverImg(item),
        '<figcaption><strong>' + esc(item.title || '未命名图片') + '</strong><span>' + esc(item.artist || item.year || '') + '</span></figcaption>',
        '</figure>'
      ].join('');
    }).join('') : emptyBlock('还没有图片收藏');
  }

  function renderArticles(items) {
    var list = document.getElementById('articleList');
    if (!list) return;
    list.innerHTML = items.length ? items.map(function (item) {
      return [
        '<article class="article-row">',
        '<span class="article-date">' + formatDate(item.createdAt) + '</span>',
        '<div><h2>' + esc(item.title || '未命名文章') + '</h2>',
        '<p>' + esc(item.description || item.artist || '未填写摘要') + '</p>',
        renderTags(item.tags),
        '</div>',
        '</article>'
      ].join('');
    }).join('') : emptyBlock('还没有文章收藏');
  }

  function filmCard(item) {
    return [
      '<article class="film-card">',
      '<div class="film-poster">' + coverImg(item) + '</div>',
      '<div><span>' + esc(getCategoryLabel(item.category)) + '</span><h2>' + esc(item.title || '未命名影视') + '</h2>',
      '<p>' + esc(item.artist || item.year || '') + '</p>',
      '<strong>' + stars(item.rating) + '</strong></div>',
      '</article>'
    ].join('');
  }

  function coverImg(item) {
    var title = item.title || '?';
    if (item.coverUrl) {
      return '<img src="' + escAttr(item.coverUrl) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.textContent=\'' + escAttr(title.charAt(0) || '?') + '\'" />';
    }
    return '<span class="cover-letter">' + esc(title.charAt(0) || '?') + '</span>';
  }

  function renderTags(tags) {
    var normalized = Array.isArray(tags) ? tags.filter(Boolean).slice(0, 4) : [];
    if (!normalized.length) return '';
    return '<div class="article-tags">' + normalized.map(function (tag) {
      return '<span>' + esc(tag) + '</span>';
    }).join('') + '</div>';
  }

  function setLoading(page) {
    var target = document.querySelector('[data-page-loading="' + page + '"]');
    if (target) target.innerHTML = emptyBlock('加载中...');
  }

  function setError(page, message) {
    var target = document.querySelector('[data-page-loading="' + page + '"]');
    if (target) target.innerHTML = '<p class="collection-empty collection-error">' + esc(message) + '</p>';
  }

  function emptyBlock(message) {
    return '<p class="collection-empty">' + esc(message) + '</p>';
  }

  function getCategoryLabel(category) {
    return CATEGORY_LABELS[category] || category || '';
  }

  function stars(value) {
    var rating = Math.max(1, Math.min(5, Math.round((parseFloat(value) || 4) * 2) / 2));
    var out = '';
    for (var i = 1; i <= 5; i += 1) {
      if (rating >= i) {
        out += '★';
      } else if (rating >= i - 0.5) {
        out += '⯨';
      } else {
        out += '☆';
      }
    }
    return out;
  }

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function getTime(value) {
    if (!value) return 0;
    if (value.toDate) return value.toDate().getTime();
    return new Date(value).getTime() || 0;
  }

  function formatDate(value) {
    var time = getTime(value);
    if (!time) return '-';
    return new Date(time).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function escAttr(value) {
    return esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();
