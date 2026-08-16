// Shared Firestore data layer and page-specific renderers.
(function () {
  window.CollectionData = {
    initFirebase: initFirebase,
    loadItems: loadItems,
    getTime: function (value) { return window.CurioVault.getTime(value); },
    esc: function (value) { return window.CurioVault.esc(value); },
    escAttr: function (value) { return window.CurioVault.escAttr(value); },
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
        return window.CurioVault.getTime(b.createdAt) - window.CurioVault.getTime(a.createdAt);
      });
    });
  }

  function bootPageRenderer() {
    var page = document.body.dataset.collectionPage;
    var config = {
      music: {
        categories: ['music'],
        render: renderMusicPage
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

  function renderMusicPage(items) {
    if (window.CollectionMusic && typeof window.CollectionMusic.renderMusic === 'function') {
      window.CollectionMusic.renderMusic(items);
      return;
    }
    setError('music', '音乐页脚本加载失败');
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
        '<div><h2>' + window.CurioVault.esc(item.title || '未命名书籍') + '</h2>',
        '<p>' + window.CurioVault.esc(item.artist || '未填写作者') + '</p>',
        '<span>' + window.CurioVault.esc(item.year || '') + ' ' + window.CurioVault.stars(item.rating) + '</span></div>',
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
        '<figcaption><strong>' + window.CurioVault.esc(item.title || '未命名图片') + '</strong><span>' + window.CurioVault.esc(item.artist || item.year || '') + '</span></figcaption>',
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
        '<div><h2>' + window.CurioVault.esc(item.title || '未命名文章') + '</h2>',
        '<p>' + window.CurioVault.esc(item.description || item.artist || '未填写摘要') + '</p>',
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
      '<div><span>' + window.CurioVault.esc(getCategoryLabel(item.category)) + '</span><h2>' + window.CurioVault.esc(item.title || '未命名影视') + '</h2>',
      '<p>' + window.CurioVault.esc(item.artist || item.year || '') + '</p>',
      '<strong>' + window.CurioVault.stars(item.rating) + '</strong></div>',
      '</article>'
    ].join('');
  }

  function coverImg(item) {
    var title = item.title || '?';
    if (item.coverUrl) {
      return '<img src="' + window.CurioVault.escAttr(item.coverUrl) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.textContent=\'' + window.CurioVault.escAttr(title.charAt(0) || '?') + '\'" />';
    }
    return '<span class="cover-letter">' + window.CurioVault.esc(title.charAt(0) || '?') + '</span>';
  }

  function renderTags(tags) {
    var normalized = Array.isArray(tags) ? tags.filter(Boolean).slice(0, 4) : [];
    if (!normalized.length) return '';
    return '<div class="article-tags">' + normalized.map(function (tag) {
      return '<span>' + window.CurioVault.esc(tag) + '</span>';
    }).join('') + '</div>';
  }

  function setLoading(page) {
    var target = document.querySelector('[data-page-loading="' + page + '"]');
    if (target) target.innerHTML = emptyBlock('加载中...');
  }

  function setError(page, message) {
    var target = document.querySelector('[data-page-loading="' + page + '"]');
    if (target) target.innerHTML = '<p class="collection-empty collection-error">' + window.CurioVault.esc(message) + '</p>';
  }

  function emptyBlock(message) {
    return '<p class="collection-empty">' + window.CurioVault.esc(message) + '</p>';
  }

  function getCategoryLabel(category) {
    return window.CurioVault.CATEGORY_LABELS[category] || category || '';
  }

  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function formatDate(value) {
    var time = window.CurioVault.getTime(value);
    if (!time) return '-';
    return new Date(time).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }
})();
