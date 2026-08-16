var currentCat = '';
var searchQuery = '';
var bulkMode = false;
var selectedIds = [];
var allItems = [];
var editingId = null;
var deletingId = null;
var db = null;

var CATEGORIES = window.CurioVault.CATEGORIES;
var CAT_LABELS = window.CurioVault.CATEGORY_LABELS;

var modal = document.getElementById('modalOverlay');
var modalTitle = document.getElementById('modalTitle');
var modalForm = document.getElementById('modalForm');
var submitBtn = modalForm.querySelector('.btn-submit');
var tableBody = document.getElementById('tableBody');
var dashboardNote = document.getElementById('dashboardNote');
var searchInput = document.getElementById('searchInput');
var bulkBar = document.getElementById('bulkBar');
var bulkStatus = document.getElementById('bulkStatus');
var btnToggleBulk = document.getElementById('btnToggleBulk');
var btnSelectAll = document.getElementById('btnSelectAll');
var btnClearSelection = document.getElementById('btnClearSelection');
var btnBulkDelete = document.getElementById('btnBulkDelete');
var btnHealthRefresh = document.getElementById('btnHealthRefresh');
var healthFirestore = document.getElementById('healthFirestore');
var healthData = document.getElementById('healthData');
var healthFrontend = document.getElementById('healthFrontend');
var healthFirestoreStatus = document.getElementById('healthFirestoreStatus');
var healthDataStatus = document.getElementById('healthDataStatus');
var healthFrontendStatus = document.getElementById('healthFrontendStatus');
var healthFirestoreMsg = document.getElementById('healthFirestoreMsg');
var healthDataMsg = document.getElementById('healthDataMsg');
var healthFrontendMsg = document.getElementById('healthFrontendMsg');
var btnAutofill = document.getElementById('btnAutofill');
var autofillStatus = document.getElementById('autofillStatus');
var autofillPanel = document.getElementById('autofillPanel');
var durationGroup = document.getElementById('durationGroup');
var songIdGroup = document.getElementById('songIdGroup');
var autofillCandidates = [];
var autofillExcludedCandidates = [];

document.querySelectorAll('.cat-tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.cat-tab').forEach(function (item) {
      item.classList.remove('active');
    });
    tab.classList.add('active');
    currentCat = tab.dataset.cat;
    pruneSelection();
    renderTable();
  });
});

searchInput.addEventListener('input', function () {
  searchQuery = searchInput.value.trim().toLowerCase();
  pruneSelection();
  renderTable();
});

btnToggleBulk.addEventListener('click', function () {
  bulkMode = !bulkMode;
  if (!bulkMode) selectedIds = [];
  renderTable();
});

btnSelectAll.addEventListener('click', function () {
  selectedIds = getVisibleItems().map(function (item) { return item.id; });
  renderTable();
});

btnClearSelection.addEventListener('click', function () {
  selectedIds = [];
  renderTable();
});

btnBulkDelete.addEventListener('click', function () {
  if (selectedIds.length === 0) return;
  if (!confirm('确认从 Firestore 删除选中的 ' + selectedIds.length + ' 条收藏吗？')) return;

  btnBulkDelete.disabled = true;
  Promise.all(selectedIds.map(function (id) {
    return db.collection('items').doc(id).delete();
  })).then(function () {
    selectedIds = [];
    return loadItems();
  }).catch(function (error) {
    alert('批量删除失败：' + getErrorMessage(error));
    renderTable();
  });
});

if (btnHealthRefresh) {
  btnHealthRefresh.addEventListener('click', runHealthCheck);
}

if (btnAutofill) {
  btnAutofill.addEventListener('click', handleAutofill);
}

document.getElementById('mCat').addEventListener('change', syncMusicFields);

// 类别横铺选择：按钮组与隐藏 select 同步
var catOptions = document.querySelectorAll('.cat-option');
function syncCatOptions() {
  var value = document.getElementById('mCat').value;
  catOptions.forEach(function (btn) {
    var active = btn.dataset.value === value;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}
catOptions.forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.getElementById('mCat').value = btn.dataset.value;
    syncCatOptions();
    syncMusicFields();
  });
});

document.getElementById('btnAdd').addEventListener('click', function () {
  editingId = null;
  modalTitle.textContent = '添加作品';
  submitBtn.textContent = '保存到 Firestore';
  submitBtn.disabled = false;
  modalForm.reset();
  document.getElementById('mCat').value = currentCat || 'music';
  syncCatOptions();
  syncMusicFields();
  document.getElementById('mRating').value = '4';
  resetAutofillUi();
  openModal();
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);

modal.addEventListener('click', function (event) {
  if (event.target === modal) closeModal();
});

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && modal.classList.contains('open')) {
    closeModal();
  }
});

modalForm.addEventListener('submit', function (event) {
  event.preventDefault();

  if (!db) {
    alert('Firestore 尚未连接');
    return;
  }

  var data = readFormData();
  if (!data) return;

  submitBtn.textContent = '保存中...';
  submitBtn.disabled = true;

  var now = firebase.firestore.FieldValue.serverTimestamp();
  var action = editingId
    ? db.collection('items').doc(editingId).update(Object.assign({}, data, { updatedAt: now }))
    : db.collection('items').add(Object.assign({}, data, { createdAt: now, updatedAt: now }));

  action.then(function () {
    closeModal();
    submitBtn.textContent = '保存到 Firestore';
    submitBtn.disabled = false;
    return loadItems();
  }).catch(function (error) {
    submitBtn.textContent = '保存到 Firestore';
    submitBtn.disabled = false;
    alert('保存失败：' + getErrorMessage(error));
  });
});

document.getElementById('btnExport').addEventListener('click', function () {
  var data = getManagedItems().map(function (item) {
    return {
      category: item.category,
      title: item.title,
      artist: item.artist || '',
      coverUrl: item.coverUrl || '',
      description: item.description || '',
      link: item.link || '',
      neteaseSongId: item.neteaseSongId || item.songId || '',
      year: item.year || null,
      duration: item.duration || null,
      rating: item.rating || 4,
      tags: normalizeTags(item.tags),
      createdAt: timestampToDate(item.createdAt) ? timestampToDate(item.createdAt).toISOString() : null,
      updatedAt: timestampToDate(item.updatedAt) ? timestampToDate(item.updatedAt).toISOString() : null
    };
  });
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'curiovault-items.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById('btnImport').addEventListener('click', function () {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', function () {
  var file = this.files[0];
  if (!file) return;

  if (!db) {
    alert('Firestore 尚未连接');
    this.value = '';
    return;
  }

  var reader = new FileReader();
  reader.onload = function (event) {
    try {
      var importedItems = JSON.parse(event.target.result);
      if (!Array.isArray(importedItems)) throw new Error('JSON 必须是数组');

      importedItems.forEach(function (item, index) {
        if (!item.title || CATEGORIES.indexOf(item.category) === -1) {
          throw new Error('第 ' + (index + 1) + ' 条数据缺少标题或类别无效');
        }
      });

      importItems(importedItems);
    } catch (error) {
      alert('导入失败：' + error.message);
    }
  };
  reader.readAsText(file);
  this.value = '';
});

function initFirestore() {
  db = getHealthDb();
  return db;
}

function loadItems() {
  if (!db) {
    return loadItemsFromRest('Firebase SDK 不可用，正在使用 REST 兜底读取...');
  }

  tableBody.innerHTML = '<tr><td colspan="8" class="table-empty">正在从 Firestore 加载...</td></tr>';
  dashboardNote.textContent = '正在连接 Firestore...';

  return db.collection('items')
    .get()
    .then(function (snapshot) {
      allItems = snapshot.docs.map(normalizeDoc).filter(function (item) {
        return CATEGORIES.indexOf(item.category) !== -1;
      }).sort(function (a, b) {
        return (timestampToDate(b.createdAt) || new Date(0)) - (timestampToDate(a.createdAt) || new Date(0));
      });
      selectedIds = [];
      dashboardNote.textContent = '已连接 Firestore，数据实时来自 items 集合';
      renderTable();
    })
    .catch(function (error) {
      return loadItemsFromRest('SDK 读取失败，正在使用 REST 兜底读取...', error);
    });
}

function loadItemsFromRest(message, sdkError) {
  var restUrl = getFirestoreRestUrl();
  if (!restUrl) {
    renderLoadError(sdkError
      ? '读取 Firestore 失败：' + getErrorMessage(sdkError)
      : 'Firebase 配置未加载，无法读取数据');
    return Promise.resolve();
  }

  tableBody.innerHTML = '<tr><td colspan="8" class="table-empty">正在从 Firestore REST 加载...</td></tr>';
  dashboardNote.textContent = message;

  return fetch(restUrl)
    .then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!response.ok) {
          throw new Error(getRestErrorMessage(data) || 'REST 读取失败');
        }
        return data;
      });
    })
    .then(function (data) {
      allItems = (data.documents || []).map(normalizeRestDoc).filter(function (item) {
        return CATEGORIES.indexOf(item.category) !== -1;
      }).sort(function (a, b) {
        return (timestampToDate(b.createdAt) || new Date(0)) - (timestampToDate(a.createdAt) || new Date(0));
      });
      selectedIds = [];
      dashboardNote.textContent = sdkError
        ? '已通过 REST 兜底读取 items；保存和删除仍需要 Firebase SDK 正常加载'
        : '已通过 REST 读取 items';
      renderTable();
    })
    .catch(function (error) {
      renderLoadError(sdkError
        ? 'SDK 读取失败：' + getErrorMessage(sdkError) + '；REST 兜底也失败：' + getErrorMessage(error)
        : 'REST 读取失败：' + getErrorMessage(error));
    });
}

function importItems(importedItems) {
  var now = firebase.firestore.FieldValue.serverTimestamp();
  var batches = [];
  var batch = db.batch();
  var batchCount = 0;

  importedItems.forEach(function (item) {
    if (batchCount >= 450) {
      batches.push(batch);
      batch = db.batch();
      batchCount = 0;
    }

    var ref = db.collection('items').doc();
    batch.set(ref, {
      category: item.category,
      title: String(item.title).trim(),
      artist: item.artist || '',
      coverUrl: item.coverUrl || '',
      description: item.description || '',
      link: item.link || '',
      neteaseSongId: item.category === 'music' ? normalizeSongId(item.neteaseSongId || item.songId || extractNetEaseSongId(item.link)) : null,
      year: normalizeYear(item.year),
      duration: item.category === 'music' ? normalizeDuration(item.duration) : null,
      rating: clampRating(item.rating),
      tags: normalizeTags(item.tags),
      createdAt: normalizeImportDate(item.createdAt) || now,
      updatedAt: now
    });
    batchCount += 1;
  });
  if (batchCount > 0) batches.push(batch);

  dashboardNote.textContent = '正在导入 Firestore...';
  Promise.all(batches.map(function (entry) {
    return entry.commit();
  })).then(function () {
    dashboardNote.textContent = '导入成功，已写入 Firestore';
    return loadItems();
  }).catch(function (error) {
    alert('导入失败：' + getErrorMessage(error));
    dashboardNote.textContent = '导入失败';
  });
}

function normalizeImportDate(value) {
  if (!value) return null;
  var date = timestampToDate(value);
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function normalizeDoc(doc) {
  var data = doc.data() || {};
  return {
    id: doc.id,
    category: data.category || '',
    title: data.title || '',
    artist: data.artist || '',
    coverUrl: data.coverUrl || '',
    description: data.description || '',
    link: data.link || '',
    neteaseSongId: data.neteaseSongId || data.songId || '',
    year: data.year || null,
    duration: data.duration || null,
    rating: data.rating || 4,
    tags: normalizeTags(data.tags),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  };
}

function normalizeRestDoc(doc) {
  var data = decodeRestFields(doc.fields || {});
  return {
    id: getRestDocId(doc.name),
    category: data.category || '',
    title: data.title || '',
    artist: data.artist || '',
    coverUrl: data.coverUrl || '',
    description: data.description || '',
    link: data.link || '',
    neteaseSongId: data.neteaseSongId || data.songId || '',
    year: data.year || null,
    duration: data.duration || null,
    rating: data.rating || 4,
    tags: normalizeTags(data.tags),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  };
}

function decodeRestFields(fields) {
  return window.CurioVault.decodeRestFields(fields);
}

function decodeRestValue(value) {
  return window.CurioVault.decodeRestValue(value);
}

function getRestDocId(name) {
  return window.CurioVault.getRestDocId(name);
}

function getFirestoreRestUrl() {
  return window.CurioVault.getFirestoreRestUrl();
}

function getRestErrorMessage(data) {
  if (data && data.error && data.error.message) return data.error.message;
  return '';
}

function renderLoadError(message) {
  dashboardNote.textContent = message;
  tableBody.innerHTML = '<tr><td colspan="8" class="table-empty error">' + esc(message) + '</td></tr>';
  updateStats();
  updateBulkUi();
}

function readFormData() {
  var rating = clampRating(document.getElementById('mRating').value);
  var year = normalizeYear(document.getElementById('mYear').value);
  var title = document.getElementById('mTitle').value.trim();
  var category = document.getElementById('mCat').value;
  var duration = category === 'music' ? normalizeDuration(document.getElementById('mDuration').value) : null;
  var neteaseSongId = category === 'music' ? normalizeSongId(document.getElementById('mSongId').value) : null;

  if (!title) {
    alert('请填写标题');
    return null;
  }

  if (CATEGORIES.indexOf(category) === -1) {
    alert('请选择有效类别');
    return null;
  }

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    alert('推荐程度需要在 1 到 5 之间');
    return null;
  }

  if (year && year.length > 24) {
    alert('年份/年代请控制在 24 个字符以内');
    return null;
  }

  if (duration && duration.length > 24) {
    alert('音乐时长请控制在 24 个字符以内');
    return null;
  }

  return {
    category: category,
    title: title,
    artist: document.getElementById('mArtist').value.trim(),
    coverUrl: document.getElementById('mCover').value.trim(),
    description: document.getElementById('mDesc').value.trim(),
    link: document.getElementById('mLink').value.trim(),
    neteaseSongId: neteaseSongId,
    tags: parseTags(document.getElementById('mTags').value),
    year: year,
    duration: duration,
    rating: rating
  };
}

function normalizeYear(value) {
  if (value === null || value === undefined) return null;
  var year = String(value).trim();
  return year || null;
}

function normalizeDuration(value) {
  if (value === null || value === undefined) return null;
  var duration = String(value).trim();
  return duration || null;
}

function normalizeSongId(value) {
  var songId = cleanString(value);
  return songId || null;
}

function extractNetEaseSongId(link) {
  var value = cleanString(link);
  if (!value) return '';
  var match = value.match(new RegExp('[?&#]id=(\\d+)')) || value.match(new RegExp('song/(\\d+)')) || value.match(new RegExp('\\b(\\d{5,})\\b'));
  return match ? match[1] : '';
}

function cleanString(value) {
  return window.CurioVault.cleanString(value);
}

function openModal() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('mTitle').focus();
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function syncMusicFields() {
  var isMusic = document.getElementById('mCat').value === 'music';
  if (durationGroup) durationGroup.hidden = !isMusic;
  if (songIdGroup) songIdGroup.hidden = !isMusic;
  if (!isMusic) {
    document.getElementById('mDuration').value = '';
    document.getElementById('mSongId').value = '';
  }
}

function editItem(id) {
  var item = allItems.find(function (entry) { return entry.id === id; });
  if (!item) return;

  editingId = id;
  modalTitle.textContent = '编辑作品';
  document.getElementById('mCat').value = CATEGORIES.indexOf(item.category) === -1 ? 'music' : item.category;
  syncCatOptions();
  document.getElementById('mTitle').value = item.title || '';
  document.getElementById('mArtist').value = item.artist || '';
  var clueInput = document.getElementById('mClue');
  if (clueInput) clueInput.value = '';
  document.getElementById('mCover').value = item.coverUrl || '';
  document.getElementById('mDesc').value = item.description || '';
  document.getElementById('mTags').value = normalizeTags(item.tags).join(', ');
  document.getElementById('mLink').value = item.link || '';
  document.getElementById('mYear').value = item.year || '';
  document.getElementById('mDuration').value = item.duration || '';
  document.getElementById('mSongId').value = item.neteaseSongId || item.songId || extractNetEaseSongId(item.link) || '';
  syncMusicFields();
  document.getElementById('mRating').value = item.rating || 4;
  submitBtn.textContent = '保存到 Firestore';
  submitBtn.disabled = false;
  resetAutofillUi();
  openModal();
}

function handleAutofill() {
  autofillExcludedCandidates = [];
  requestAutofill(false);
}

function handleAutofillMore() {
  autofillExcludedCandidates = autofillExcludedCandidates.concat(autofillCandidates.map(getAutofillCandidateKey));
  requestAutofill(true);
}

function requestAutofill(isMore) {
  var title = document.getElementById('mTitle').value.trim();
  var artist = document.getElementById('mArtist').value.trim();
  var clueInput = document.getElementById('mClue');
  var clue = clueInput ? clueInput.value.trim() : '';
  var category = document.getElementById('mCat').value;

  if (!title && !clue) {
    setAutofillStatus('warn', '请输入标题或识别线索。');
    document.getElementById('mTitle').focus();
    return;
  }

  var endpoint = getAutofillEndpoint();
  if (!endpoint) {
    setAutofillStatus('error', '未配置智能填充接口。请先填写 Vercel API 地址。');
    return;
  }

  if (endpoint.indexOf('your-vercel-project') !== -1) {
    setAutofillStatus('error', '请先把 Vercel API 地址替换到 firebase-config.js。');
    return;
  }

  setAutofillLoading(true);
  setAutofillStatus('', isMore ? '正在换一批候选...' : getAutofillLoadingMessage(title, artist, clue));
  hideAutofillPanel();

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: category,
      title: title,
      artist: artist,
      clue: clue,
      excludedCandidates: autofillExcludedCandidates,
      current: {
        description: document.getElementById('mDesc').value.trim(),
        tags: parseTags(document.getElementById('mTags').value),
        year: document.getElementById('mYear').value.trim(),
        duration: document.getElementById('mDuration').value.trim(),
        neteaseSongId: document.getElementById('mSongId').value.trim()
      }
    })
  })
    .then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!response.ok) {
          throw new Error(data.error || data.message || '智能填充请求失败');
        }
        return data;
      });
    })
    .then(function (data) {
      handleAutofillResult(data);
    })
    .catch(function (error) {
      setAutofillStatus('error', '填充失败：' + getErrorMessage(error));
    })
    .finally(function () {
      setAutofillLoading(false);
    });
}

function handleAutofillResult(data) {
  var result = normalizeAutofillItem(data.item || data.result || data);
  var candidates = normalizeAutofillCandidates(data.candidates || result.candidates);
  var confidence = typeof result.confidence === 'number' ? result.confidence : 0;
  var needsMoreContext = Boolean(data.needsMoreContext || result.needsMoreContext);
  var hasTitleSuggestion = getSuggestedTitle(result) !== '';

  if (candidates.length > 1 || (needsMoreContext && candidates.length > 0)) {
    renderAutofillCandidates(candidates);
    setAutofillStatus('warn', '找到多个可能结果。请选择一个，或补充作者/导演后再试。');
    return;
  }

  if (needsMoreContext && !hasUsefulAutofillData(result) && !hasTitleSuggestion) {
    setAutofillStatus('warn', '暂时无法确认具体作品。可以补充作者/导演后再点一次。');
    return;
  }

  if (!hasUsefulAutofillData(result) && !hasTitleSuggestion) {
    setAutofillStatus('warn', '没有找到足够可靠的信息。可以补充作者/导演后再试。');
    return;
  }

  applyAutofillData(result);
  renderAutofillTitleSuggestion(result);

  var titleNote = hasTitleSuggestion ? '，并生成了可应用的建议标题' : '';
  if (needsMoreContext) {
    setAutofillStatus('warn', '已填充可用信息' + titleNote + '，但结果仍需确认。可以补充作者/导演后再试。');
    return;
  }
  if (confidence && confidence < 0.65) {
    setAutofillStatus('warn', '已填充可用信息' + titleNote + '，但匹配度偏低，建议确认后再保存。');
    return;
  }
  setAutofillStatus('ok', '已填充空字段' + titleNote + '。已填写的内容不会被覆盖。');
}

function normalizeAutofillItem(item) {
  item = item || {};
  return {
    title: cleanString(item.title),
    artist: cleanString(item.artist || item.creator || item.author || item.director),
    description: cleanString(item.description),
    tags: normalizeTags(item.tags),
    year: normalizeYear(item.year),
    duration: normalizeDuration(item.duration),
    neteaseSongId: normalizeSongId(item.neteaseSongId || item.songId || extractNetEaseSongId(item.link)),
    coverUrl: cleanString(item.coverUrl || item.cover || item.image || item.picUrl),
    link: cleanString(item.link || item.url || item.sourceUrl),
    confidence: Number(item.confidence) || 0,
    needsMoreContext: Boolean(item.needsMoreContext),
    candidates: item.candidates
  };
}

function getAutofillLoadingMessage(title, artist, clue) {
  if (title && artist && clue) return '正在用标题、作者/导演和识别线索查询...';
  if (title && artist) return '正在用标题和作者/导演信息查询...';
  if (title && clue) return '正在用标题和识别线索查询...';
  if (clue) return '正在用识别线索查询...';
  return '正在查询...';
}

function normalizeAutofillCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.map(normalizeAutofillItem).filter(function (item) {
    return item.title || item.artist || item.description || item.year || item.duration || item.neteaseSongId || item.coverUrl || item.link || item.tags.length;
  }).slice(0, 3);
}

function hasUsefulAutofillData(item) {
  return Boolean(item.artist || item.description || item.year || item.duration || item.neteaseSongId || item.coverUrl || item.link || item.tags.length);
}

function renderAutofillCandidates(candidates) {
  autofillCandidates = candidates;
  if (!autofillPanel) return;

  autofillPanel.hidden = false;
  autofillPanel.innerHTML = [
    '<p class="autofill-panel-title">请选择更接近的结果</p>',
    candidates.map(function (item, index) {
      var title = item.title || document.getElementById('mTitle').value.trim();
      var meta = [
        item.artist,
        item.year,
        item.duration,
        normalizeTags(item.tags).join(' / ')
      ].filter(Boolean).join(' · ');

      return [
        '<div class="autofill-candidate">',
        '<div><strong>' + esc(title) + '</strong><span>' + esc(meta || item.description || '暂无补充信息') + '</span></div>',
        '<button class="autofill-apply" type="button" data-autofill-index="' + index + '">应用</button>',
        '</div>'
      ].join('');
    }).join(''),
    '<button class="autofill-more" type="button" data-autofill-more="true"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i><span>换一批</span></button>'
  ].join('');

  autofillPanel.querySelectorAll('[data-autofill-index]').forEach(function (button) {
    button.addEventListener('click', function () {
      var item = autofillCandidates[parseInt(button.dataset.autofillIndex, 10)];
      applyAutofillData(item);
      renderAutofillTitleSuggestion(item);
      setAutofillStatus('ok', '已应用候选信息。已填写的内容不会被覆盖。');
    });
  });

  var moreButton = autofillPanel.querySelector('[data-autofill-more]');
  if (moreButton) {
    moreButton.addEventListener('click', handleAutofillMore);
  }
}

function getAutofillCandidateKey(item) {
  return {
    title: cleanString(item && item.title),
    artist: cleanString(item && item.artist),
    year: cleanString(item && item.year)
  };
}

function applyAutofillData(item) {
  fillEmptyField('mArtist', item.artist);
  fillEmptyField('mCover', item.coverUrl);
  fillEmptyField('mDesc', item.description);
  fillEmptyField('mLink', item.link);
  fillEmptyField('mYear', item.year);
  fillEmptyField('mDuration', item.duration);
  fillEmptyField('mSongId', item.neteaseSongId || item.songId || extractNetEaseSongId(item.link));

  var tags = normalizeTags(item.tags);
  if (tags.length && !document.getElementById('mTags').value.trim()) {
    document.getElementById('mTags').value = tags.join(', ');
  }
}

function renderAutofillTitleSuggestion(item) {
  var suggestedTitle = getSuggestedTitle(item);
  if (!suggestedTitle || !autofillPanel) {
    hideAutofillPanel();
    return;
  }

  autofillPanel.hidden = false;
  autofillPanel.innerHTML = [
    '<div class="autofill-title-suggestion">',
    '<div>',
    '<p class="autofill-panel-title">建议标题</p>',
    '<strong>' + esc(suggestedTitle) + '</strong>',
    '<span>标题不会自动覆盖，确认后再应用。</span>',
    '</div>',
    '<button class="autofill-apply" type="button" data-autofill-title="' + escAttr(suggestedTitle) + '">应用标题</button>',
    '</div>'
  ].join('');

  autofillPanel.querySelector('[data-autofill-title]').addEventListener('click', function (buttonEvent) {
    document.getElementById('mTitle').value = buttonEvent.currentTarget.dataset.autofillTitle;
    hideAutofillPanel();
    setAutofillStatus('ok', '已应用建议标题。');
  });
}

function getSuggestedTitle(item) {
  if (!item || !item.title) return '';
  var currentTitle = document.getElementById('mTitle').value.trim();
  var suggestedTitle = cleanString(item.title);
  if (!suggestedTitle || suggestedTitle === currentTitle) return '';
  return suggestedTitle;
}

function fillEmptyField(id, value) {
  var input = document.getElementById(id);
  if (!input || !value || input.value.trim()) return;
  input.value = value;
}

function getAutofillEndpoint() {
  if (typeof CURIOVAULT_AUTOFILL_ENDPOINT !== 'undefined' && CURIOVAULT_AUTOFILL_ENDPOINT) {
    return CURIOVAULT_AUTOFILL_ENDPOINT;
  }
  if (window.location.hostname.indexOf('vercel.app') !== -1) {
    return '/api/autofillCollectionItem';
  }
  return '';
}

function setAutofillLoading(isLoading) {
  if (!btnAutofill) return;
  btnAutofill.disabled = isLoading;
  btnAutofill.innerHTML = isLoading
    ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>查询中</span>'
    : '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>一键填充</span>';
}

function setAutofillStatus(type, message) {
  if (!autofillStatus) return;
  autofillStatus.className = 'autofill-status' + (type ? ' is-' + type : '');
  autofillStatus.textContent = message;
}

function resetAutofillUi() {
  autofillCandidates = [];
  autofillExcludedCandidates = [];
  hideAutofillPanel();
  setAutofillLoading(false);
  setAutofillStatus('', '输入标题或识别线索后可自动识别作者、描述、标签和年份。');
}

function hideAutofillPanel() {
  if (!autofillPanel) return;
  autofillPanel.hidden = true;
  autofillPanel.innerHTML = '';
}

function deleteItem(id) {
  if (!db) return;
  if (!confirm('确认从 Firestore 删除这条收藏吗？')) return;

  deletingId = id;
  renderTable();

  db.collection('items').doc(id).delete()
    .then(function () {
      deletingId = null;
      selectedIds = selectedIds.filter(function (itemId) { return itemId !== id; });
      return loadItems();
    })
    .catch(function (error) {
      deletingId = null;
      alert('删除失败：' + getErrorMessage(error));
      renderTable();
    });
}

function renderTable() {
  var items = getVisibleItems();
  updateStats();
  updateBulkUi();

  if (items.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" class="table-empty">' + getEmptyMessage() + '</td></tr>';
    return;
  }

  tableBody.innerHTML = items.map(function (item) {
    var title = item.title || '未命名作品';
    var initials = title.charAt(0);
    var catLabel = CAT_LABELS[item.category] || item.category || '-';
    var description = item.artist || item.description || '未填写描述';
    var isDeleting = deletingId === item.id;
    var checked = selectedIds.indexOf(item.id) !== -1;
    var tagsHtml = renderTags(item.tags);

    return [
      '<tr' + (checked ? ' class="row-selected"' : '') + '>',
      '<td data-label="选择"><label class="row-check" aria-label="选择 ' + escAttr(title) + '"><input type="checkbox" data-check="' + escAttr(item.id) + '"' + (checked ? ' checked' : '') + ' /><i class="fa-solid fa-check" aria-hidden="true"></i></label></td>',
      '<td data-label="封面"><div class="td-cover">' + renderCover(item.coverUrl, initials) + '</div></td>',
      '<td data-label="标题"><div class="td-title"><span class="td-title-main">' + esc(title) + '</span><span class="td-title-sub">' + esc(description) + '</span>' + tagsHtml + '</div></td>',
      '<td data-label="类别"><span class="td-cat">' + esc(catLabel) + '</span></td>',
      '<td data-label="年份">' + esc(item.year || '-') + '</td>',
      '<td data-label="推荐"><span class="td-stars">' + buildStars(item.rating) + '</span></td>',
      '<td data-label="添加时间" class="td-time">' + esc(formatDate(item.createdAt)) + '</td>',
      '<td data-label="操作"><div class="actions">',
      '<button class="btn-action" type="button" data-edit="' + escAttr(item.id) + '" title="编辑" aria-label="编辑 ' + escAttr(title) + '"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>',
      '<button class="btn-action danger" type="button" data-del="' + escAttr(item.id) + '" title="删除" aria-label="删除 ' + escAttr(title) + '"' + (isDeleting ? ' disabled' : '') + '><i class="fa-solid ' + (isDeleting ? 'fa-spinner fa-spin' : 'fa-trash') + '" aria-hidden="true"></i></button>',
      '</div></td>',
      '</tr>'
    ].join('');
  }).join('');

  tableBody.querySelectorAll('[data-edit]').forEach(function (button) {
    button.addEventListener('click', function () {
      editItem(button.dataset.edit);
    });
  });

  tableBody.querySelectorAll('[data-del]').forEach(function (button) {
    button.addEventListener('click', function () {
      deleteItem(button.dataset.del);
    });
  });

  tableBody.querySelectorAll('[data-check]').forEach(function (checkbox) {
    checkbox.addEventListener('change', function () {
      toggleSelected(checkbox.dataset.check, checkbox.checked);
    });
  });
}

function getManagedItems() {
  return allItems.filter(function (item) {
    return CATEGORIES.indexOf(item.category) !== -1;
  });
}

function getVisibleItems() {
  return getManagedItems().filter(function (item) {
    var matchCategory = currentCat ? item.category === currentCat : true;
    if (!matchCategory) return false;
    if (!searchQuery) return true;
    return getSearchText(item).indexOf(searchQuery) !== -1;
  });
}

function getSearchText(item) {
  return [
    item.title,
    item.artist,
    item.description,
    normalizeTags(item.tags).join(' '),
    item.year,
    CAT_LABELS[item.category]
  ].join(' ').toLowerCase();
}

function parseTags(value) {
  return window.CurioVault.parseTags(value, 6);
}

function normalizeTags(value) {
  return window.CurioVault.normalizeTags(value, 6);
}

function getEmptyMessage() {
  if (searchQuery) return '没有匹配的作品';
  if (currentCat) return '该分类暂无数据';
  return '暂无数据';
}

function updateStats() {
  var counts = { music: 0, movie: 0, tv: 0, books: 0, images: 0, articles: 0 };
  var managedItems = getManagedItems();
  var latestDate = null;

  managedItems.forEach(function (item) {
    counts[item.category] += 1;
    var created = timestampToDate(item.createdAt);
    if (created && (!latestDate || created > latestDate)) {
      latestDate = created;
    }
  });

  document.getElementById('statTotal').textContent = managedItems.length;
  document.getElementById('statMusic').textContent = counts.music;
  document.getElementById('statMovie').textContent = counts.movie;
  document.getElementById('statTv').textContent = counts.tv;
  document.getElementById('statBooks').textContent = counts.books;
  document.getElementById('statImages').textContent = counts.images;
  document.getElementById('statArticles').textContent = counts.articles;
  document.getElementById('statLatest').textContent = latestDate ? formatDate(latestDate) : '-';
}

function toggleSelected(id, selected) {
  if (selected) {
    if (selectedIds.indexOf(id) === -1) selectedIds.push(id);
  } else {
    selectedIds = selectedIds.filter(function (itemId) { return itemId !== id; });
  }
  updateBulkUi();
  renderTable();
}

function pruneSelection() {
  var visibleIds = getVisibleItems().map(function (item) { return item.id; });
  selectedIds = selectedIds.filter(function (id) {
    return visibleIds.indexOf(id) !== -1;
  });
}

function updateBulkUi() {
  document.body.classList.toggle('bulk-mode', bulkMode);
  bulkBar.hidden = !bulkMode;
  bulkStatus.textContent = '已选择 ' + selectedIds.length + ' 项';
  btnBulkDelete.disabled = selectedIds.length === 0 || !db;
  btnSelectAll.disabled = getVisibleItems().length === 0;
  btnToggleBulk.querySelector('span').textContent = bulkMode ? '退出批量' : '批量选择';
}

function runHealthCheck() {
  if (!healthFirestore || !healthData || !healthFrontend) return;

  setHealthState('firestore', 'checking', '检查中', '正在检查数据库连接...');
  setHealthState('data', 'checking', '检查中', '正在检查 items 字段和分类...');
  setHealthState('frontend', 'checking', '检查中', '正在检查前台页面资源...');

  if (btnHealthRefresh) btnHealthRefresh.disabled = true;

  Promise.allSettled([
    checkFirestoreHealth(),
    checkDataHealth(),
    checkFrontendHealth()
  ]).finally(function () {
    if (btnHealthRefresh) btnHealthRefresh.disabled = false;
  });
}

function getHealthDb() {
  if (typeof firebase === 'undefined') throw new Error('Firebase SDK 未加载');
  if (typeof FIREBASE_CONFIG === 'undefined') throw new Error('FIREBASE_CONFIG 未加载');
  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
  } catch (error) {
    if (!/already exists|already been created/i.test(error.message || '')) throw error;
  }
  if (!firebase.firestore) throw new Error('Firestore SDK 未加载');
  return firebase.firestore();
}

function checkFirestoreHealth() {
  var healthDb;
  try {
    healthDb = getHealthDb();
  } catch (error) {
    setHealthState('firestore', 'error', '异常', error.message);
    return Promise.resolve();
  }

  return healthDb.collection('items').limit(1).get()
    .then(function (snapshot) {
      var message = snapshot.empty ? 'items 集合可访问，目前暂无数据。' : 'items 集合可访问。';
      setHealthState('firestore', 'ok', '正常', message);
    })
    .catch(function (error) {
      setHealthState('firestore', 'error', '异常', '读取 items 失败：' + getErrorMessage(error));
    });
}

function checkDataHealth() {
  var healthDb;
  try {
    healthDb = getHealthDb();
  } catch (error) {
    setHealthState('data', 'error', '异常', error.message);
    return Promise.resolve();
  }

  return healthDb.collection('items').limit(20).get()
    .then(function (snapshot) {
      if (snapshot.empty) {
        setHealthState('data', 'warn', '需注意', 'items 集合为空，前台暂时没有可读取数据。');
        return;
      }

      var invalidCategory = 0;
      var legacyCategory = 0;
      var missingRequired = 0;
      snapshot.forEach(function (doc) {
        var data = doc.data() || {};
        if (data.category === 'film') legacyCategory += 1;
        if (CATEGORIES.indexOf(data.category) === -1) invalidCategory += 1;
        if (!data.title || !data.createdAt) missingRequired += 1;
      });

      if (legacyCategory || invalidCategory || missingRequired) {
        setHealthState('data', 'warn', '需注意', '旧分类 ' + legacyCategory + ' 条，未知分类 ' + invalidCategory + ' 条，缺少字段 ' + missingRequired + ' 条。');
        return;
      }

      setHealthState('data', 'ok', '正常', '抽样 ' + snapshot.size + ' 条数据，字段和分类看起来正常。');
    })
    .catch(function (error) {
      setHealthState('data', 'error', '异常', '检查数据结构失败：' + getErrorMessage(error));
    });
}

function checkFrontendHealth() {
  var resources = [
    '../collection/index.html',
    '../collection/music.html',
    '../collection/film.html',
    '../collection/books.html',
    '../collection/images.html',
    '../collection/articles.html',
    '../collection/js/list-loader.js'
  ];

  return Promise.all(resources.map(fetchHealthResource))
    .then(function (results) {
      var failed = results.filter(function (item) { return !item.ok; });
      var loader = results.find(function (item) {
        return item.url.indexOf('list-loader.js') !== -1;
      });

      if (failed.length) {
        setHealthState('frontend', 'error', '异常', '有 ' + failed.length + ' 个前台资源无法访问。');
        return;
      }

      var loaderText = loader ? loader.text : '';
      var supportsFilmAggregate = loaderText.indexOf('movie') !== -1 && loaderText.indexOf('tv') !== -1;

      if (!supportsFilmAggregate) {
        setHealthState('frontend', 'warn', '需注意', '前台列表脚本尚未聚合 movie/tv。');
        return;
      }

      setHealthState('frontend', 'ok', '正常', '前台页面和列表脚本均可访问。');
    })
    .catch(function (error) {
      setHealthState('frontend', 'error', '异常', '前台资源检查失败：' + getErrorMessage(error));
    });
}

function fetchHealthResource(url) {
  return fetch(url, { cache: 'no-store' })
    .then(function (response) {
      return response.text().then(function (text) {
        return { url: url, ok: response.ok, text: text };
      });
    })
    .catch(function (error) {
      return { url: url, ok: false, text: '', error: error };
    });
}

function setHealthState(type, state, label, message) {
  var map = {
    firestore: { item: healthFirestore, status: healthFirestoreStatus, message: healthFirestoreMsg },
    data: { item: healthData, status: healthDataStatus, message: healthDataMsg },
    frontend: { item: healthFrontend, status: healthFrontendStatus, message: healthFrontendMsg }
  };
  var target = map[type];
  if (!target || !target.item) return;

  target.item.dataset.healthState = state;
  target.status.innerHTML = '<i></i>' + esc(label);
  target.message.textContent = message;
}

function getErrorMessage(error) {
  return window.CurioVault.getErrorMessage(error);
}

function renderCover(url, fallback) {
  if (!url) return '<span class="cover-fallback">' + esc(fallback) + '</span>';
  return '<img src="' + escAttr(url) + '" alt="" onerror="this.parentElement.textContent=\'' + escAttr(fallback) + '\'" />';
}

function renderTags(tags) {
  var normalized = normalizeTags(tags);
  if (normalized.length === 0) return '';
  return '<span class="td-tags">' + normalized.map(function (tag) {
    return '<span class="td-tag">' + esc(tag) + '</span>';
  }).join('') + '</span>';
}

function buildStars(rating) {
  return window.CurioVault.stars(rating);
}

function clampRating(value) {
  var rating = parseFloat(value);
  if (!Number.isFinite(rating)) return 4;
  return Math.max(1, Math.min(5, Math.round(rating * 2) / 2));
}

function formatDate(timestamp) {
  var date = timestampToDate(timestamp);
  if (!date) return '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function timestampToDate(timestamp) {
  return window.CurioVault.toDate(timestamp);
}

function esc(value) {
  return window.CurioVault.esc(value);
}

function escAttr(value) {
  return window.CurioVault.escAttr(value);
}

function boot() {
  try {
    initFirestore();
  } catch (error) {
    db = null;
    dashboardNote.textContent = getErrorMessage(error);
  }
  loadItems();
  runHealthCheck();
}

boot();
