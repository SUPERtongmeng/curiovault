// Shared browser utilities and Firestore data helpers for CurioVault.
// Exposed as window.CurioVault so admin / collection / music pages can reuse one copy.
(function () {
  var CATEGORIES = ['music', 'movie', 'tv', 'books', 'images', 'articles'];
  var CATEGORY_LABELS = {
    music: '音乐',
    movie: '电影',
    tv: '电视剧',
    books: '书籍',
    images: '图片',
    articles: '文章'
  };

  window.CurioVault = {
    CATEGORIES: CATEGORIES,
    CATEGORY_LABELS: CATEGORY_LABELS,
    esc: esc,
    escAttr: escAttr,
    getErrorMessage: getErrorMessage,
    cleanString: cleanString,
    stars: stars,
    toDate: toDate,
    getTime: getTime,
    getFirestoreRestUrl: getFirestoreRestUrl,
    decodeRestFields: decodeRestFields,
    decodeRestValue: decodeRestValue,
    getRestDocId: getRestDocId,
    getCoverSrc: getCoverSrc,
    normalizeImageSource: normalizeImageSource,
    getFirstImageSource: getFirstImageSource,
    normalizeTags: normalizeTags,
    parseTags: parseTags,
    loadAllItems: loadAllItems
  };

  function esc(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function escAttr(value) {
    return esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getErrorMessage(error) {
    if (!error) return '未知错误';
    return error.message || String(error);
  }

  function cleanString(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function stars(value) {
    var rating = parseFloat(value);
    if (!Number.isFinite(rating)) rating = 4;
    rating = Math.max(1, Math.min(5, Math.round(rating * 2) / 2));
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

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value.toDate) return value.toDate();
    var parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getTime(value) {
    var date = toDate(value);
    return date ? date.getTime() : 0;
  }

  function getFirestoreRestUrl() {
    if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.projectId || !FIREBASE_CONFIG.apiKey) {
      return '';
    }
    return 'https://firestore.googleapis.com/v1/projects/'
      + encodeURIComponent(FIREBASE_CONFIG.projectId)
      + '/databases/(default)/documents/items?key='
      + encodeURIComponent(FIREBASE_CONFIG.apiKey)
      + '&pageSize=1000';
  }

  function decodeRestFields(fields) {
    var output = {};
    Object.keys(fields).forEach(function (key) {
      output[key] = decodeRestValue(fields[key]);
    });
    return output;
  }

  function decodeRestValue(value) {
    if (!value) return null;
    if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
    if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
    if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
    if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
    if (value.arrayValue) {
      return (value.arrayValue.values || []).map(decodeRestValue);
    }
    if (value.mapValue) return decodeRestFields(value.mapValue.fields || {});
    return null;
  }

  function getRestDocId(name) {
    var parts = String(name || '').split('/');
    return parts[parts.length - 1] || '';
  }

  function getCoverSrc(item) {
    if (!item) return '';
    var direct = [
      item.coverUrl,
      item.cover,
      item.coverImgUrl,
      item.imageUrl,
      item.image,
      item.picUrl,
      item.imgUrl,
      item.artworkUrl,
      item.thumbnail,
      item.poster
    ];
    for (var i = 0; i < direct.length; i += 1) {
      var url = normalizeImageSource(direct[i]);
      if (url) return url;
    }
    var collections = [item.images, item.imageUrls, item.covers, item.pictures];
    for (var j = 0; j < collections.length; j += 1) {
      var found = getFirstImageSource(collections[j]);
      if (found) return found;
    }
    if (item.album) {
      return normalizeImageSource(item.album.coverUrl || item.album.cover || item.album.coverImgUrl || item.album.picUrl || item.album.imageUrl || item.album.image);
    }
    return '';
  }

  function getFirstImageSource(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var url = normalizeImageSource(value[i]);
        if (url) return url;
      }
      return '';
    }
    return normalizeImageSource(value);
  }

  function normalizeImageSource(value) {
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return '';
    return normalizeImageSource(value.url || value.src || value.href || value.coverUrl || value.cover || value.coverImgUrl || value.imageUrl || value.image || value.picUrl || value.imgUrl || value.downloadURL);
  }

  function normalizeTags(value, max) {
    var limit = typeof max === 'number' ? max : 6;
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map(function (tag) { return String(tag).trim(); })
        .filter(Boolean)
        .filter(function (tag, index, list) { return list.indexOf(tag) === index; })
        .slice(0, limit);
    }
    return parseTags(value, limit);
  }

  function parseTags(value, max) {
    if (!value) return [];
    return normalizeTags(String(value).split(/[,，]/), typeof max === 'number' ? max : 6);
  }

  function initFirestore() {
    if (typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined') {
      return null;
    }
    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      return firebase.firestore();
    } catch (error) {
      if (!/already exists|already been created/i.test(error.message || '')) {
        console.warn('Firebase init failed:', error);
        return null;
      }
      return firebase.firestore();
    }
  }

  function loadAllItems() {
    var db = initFirestore();
    if (db) {
      return db.collection('items')
        .get()
        .then(function (snapshot) {
          return snapshot.docs.map(function (doc) {
            var data = doc.data() || {};
            data.id = doc.id;
            return data;
          });
        })
        .catch(function (error) {
          console.warn('loadAllItems SDK read failed:', error);
          return loadItemsFromRest();
        });
    }
    return loadItemsFromRest();
  }

  function loadItemsFromRest() {
    var restUrl = getFirestoreRestUrl();
    if (!restUrl) return Promise.resolve([]);
    return fetch(restUrl)
      .then(function (response) {
        return response.json().catch(function () {
          return {};
        }).then(function (data) {
          if (!response.ok) {
            throw new Error((data.error && data.error.message) || 'REST 读取失败');
          }
          return data;
        });
      })
      .then(function (data) {
        return (data.documents || []).map(function (doc) {
          var item = decodeRestFields(doc.fields || {});
          item.id = getRestDocId(doc.name);
          return item;
        });
      })
      .catch(function (error) {
        console.warn('loadAllItems REST read failed:', error);
        return [];
      });
  }
})();
