// Shared front-end shell: navigation, mobile menu, and home background.
(function () {
  var NAV_ITEMS = [
    { href: 'index.html', label: '首页', icon: 'fa-house' },
    { href: 'music.html', label: '音乐', icon: 'fa-music' },
    { href: 'film.html', label: '影视', icon: 'fa-film' },
    { href: 'books.html', label: '书籍', icon: 'fa-book' },
    { href: 'images.html', label: '图片', icon: 'fa-image' },
    { href: 'articles.html', label: '文章', icon: 'fa-newspaper' }
  ];

  applyDefaultTheme();
  renderSiteNav();
  bindNavbar();
  bindPageTransitions();
  bindCards();
  initMusicPlayer();
  initHomeData();

  function applyDefaultTheme() {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.removeItem('xiao-xi-theme');
  }

  function renderSiteNav() {
    var mount = document.getElementById('siteNav');
    if (!mount) return;

    var current = getCurrentPage();
    var links = NAV_ITEMS.map(function (item) {
      var active = item.href === current ? ' class="active"' : '';
      return '<li><a href="' + item.href + '"' + active + '><i class="fa-solid ' + item.icon + '"></i> ' + item.label + '</a></li>';
    }).join('');

    mount.innerHTML = [
      '<nav id="navbar">',
      '<div class="nav-pill">',
      '<a href="index.html" class="nav-brand">Xiao Xi</a>',
      '<ul class="nav-links" id="navbarNav">' + links + '</ul>',
      '</div>',
      '<div class="nav-actions">',
      '<button class="hamburger" id="menuToggle" aria-label="菜单">',
      '<span class="hamburger-line"></span>',
      '<span class="hamburger-line"></span>',
      '<span class="hamburger-line"></span>',
      '</button>',
      '</div>',
      '</nav>'
    ].join('');
  }

  function bindNavbar() {
    var navbar = document.getElementById('navbar');
    var menuToggle = document.getElementById('menuToggle');
    var navbarNav = document.getElementById('navbarNav');

    if (navbar) {
      window.addEventListener('scroll', function () {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
      });
    }


    if (menuToggle && navbarNav) {
      menuToggle.addEventListener('click', function () {
        navbarNav.classList.toggle('nav-open');
        menuToggle.classList.toggle('active');
        document.body.classList.toggle('nav-menu-open');
      });

      navbarNav.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
          navbarNav.classList.remove('nav-open');
          menuToggle.classList.remove('active');
          document.body.classList.remove('nav-menu-open');
        });
      });
    }
  }

  function getCurrentPage() {
    var file = window.location.pathname.split('/').pop();
    return file || 'index.html';
  }

  function bindPageTransitions() {
    var prefetched = {};
    document.querySelectorAll('#navbarNav a[href$=".html"]').forEach(function (link) {
      link.addEventListener('mouseenter', function () {
        prefetchPage(link.href, prefetched);
      });
      link.addEventListener('touchstart', function () {
        prefetchPage(link.href, prefetched);
      }, { passive: true });
    });

    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href]');
      if (!link) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== '_self') return;

      var url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (!/\.html$/.test(url.pathname)) return;
      if (url.pathname === window.location.pathname && url.hash === window.location.hash) return;

      event.preventDefault();
      document.body.classList.add('page-leaving');
      window.setTimeout(function () {
        window.location.href = url.href;
      }, 120);
    });
  }

  function prefetchPage(href, prefetched) {
    if (prefetched[href]) return;
    prefetched[href] = true;
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    document.head.appendChild(link);
  }

  function bindCards() {
    document.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('mousemove', function (event) {
        var rect = card.getBoundingClientRect();
        var x = ((event.clientX - rect.left) / rect.width) * 100;
        var y = ((event.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mouse-x', x + '%');
        card.style.setProperty('--mouse-y', y + '%');
      });
    });
  }

  function initHomeData() {
    if (!document.body.classList.contains('page-home')) return;

    var feature = document.getElementById('recentFeature');
    var activity = document.getElementById('recentActivity');
    var filmstrip = document.getElementById('recentFilmstrip');
    if (feature && activity && filmstrip) {
      feature.innerHTML = '<p class="collection-empty">正在读取最近收藏...</p>';
      renderRecentActivityLoading(activity);
      filmstrip.innerHTML = '';
    }

    window.CurioVault.loadAllItems().then(function (items) {
      renderHomeStats(items);
      renderCategoryShowcase(items);
      renderRecentCollection(items);
      renderCoverBg(items);
    });
  }

  function renderHomeStats(items) {
    var stats = document.getElementById('homeStats');
    if (!stats) return;

    var counts = {
      total: 0,
      music: 0,
      film: 0,
      books: 0,
      images: 0,
      articles: 0
    };

    (items || []).forEach(function (item) {
      var category = item.category;
      counts.total += 1;
      if (category === 'movie' || category === 'tv') counts.film += 1;
      else if (Object.prototype.hasOwnProperty.call(counts, category)) counts[category] += 1;
    });

    Object.keys(counts).forEach(function (key) {
      var target = stats.querySelector('[data-home-count="' + key + '"]');
      if (target) target.textContent = counts[key];
    });
  }

  function renderCategoryShowcase(items) {
    var showcase = document.getElementById('categoryShowcase');
    if (!showcase) return;

    var groups = {
      music: { count: 0, covers: [] },
      film: { count: 0, covers: [] },
      books: { count: 0, covers: [] },
      images: { count: 0, covers: [] },
      articles: { count: 0, covers: [] }
    };

    (items || []).forEach(function (item) {
      var key = item.category === 'movie' || item.category === 'tv' ? 'film' : item.category;
      var coverUrl = typeof item.coverUrl === 'string' ? item.coverUrl.trim() : '';
      if (!Object.prototype.hasOwnProperty.call(groups, key)) return;

      groups[key].count += 1;
      if (coverUrl && groups[key].covers.indexOf(coverUrl) === -1) {
        groups[key].covers.push(coverUrl);
      }
    });

    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      var countTarget = showcase.querySelector('[data-showcase-count="' + key + '"]');
      var card = showcase.querySelector('[data-showcase-card="' + key + '"]');
      var stack = card ? card.querySelector('.showcase-cover-stack') : null;

      if (countTarget) countTarget.textContent = group.count + ' 件收藏';
      if (!stack) return;

      stack.innerHTML = '';
      pickShowcaseCovers(group.covers, key).forEach(function (src, index) {
        var img = document.createElement('img');
        var placement = getShowcaseCoverPlacement(key, index);
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.style.setProperty('--cover-left', placement.left + 'px');
        img.style.setProperty('--cover-top', placement.top + 'px');
        img.style.setProperty('--cover-rotate', placement.rotate + 'deg');
        img.style.setProperty('--cover-hover-x', placement.hoverX + 'px');
        img.style.setProperty('--cover-hover-y', placement.hoverY + 'px');
        img.style.setProperty('--cover-hover-rotate', placement.hoverRotate + 'deg');
        img.onerror = function () {
          this.remove();
        };
        stack.appendChild(img);
      });
    });
  }

  function renderRecentCollection(items) {
    var section = document.getElementById('recentCollection');
    var feature = document.getElementById('recentFeature');
    var activity = document.getElementById('recentActivity');
    var filmstrip = document.getElementById('recentFilmstrip');
    if (!section || !feature || !filmstrip) return;

    renderRecentItems(feature, filmstrip, activity, items || []);
  }

  function renderRecentItems(feature, filmstrip, activity, sourceItems) {
    var allItems = (sourceItems || []).slice();
    var items = allItems.slice().sort(function (a, b) {
      return window.CurioVault.getTime(b.createdAt) - window.CurioVault.getTime(a.createdAt);
    }).slice(0, 8);

    renderRecentActivity(activity, allItems);

    if (!items.length) {
      feature.innerHTML = '<p class="collection-empty">还没有最近收藏</p>';
      filmstrip.innerHTML = '';
      return;
    }

    renderRecentFeature(feature, items[0]);
    renderRecentFilmstrip(filmstrip, items.slice(1));
  }

  function renderRecentActivityLoading(target) {
    if (!target) return;
    target.innerHTML = [
      '<div class="activity-head">',
      '<h3>收藏活跃图</h3>',
      '<p class="activity-summary">正在计算新增记录...</p>',
      '</div>',
      '<p class="collection-empty activity-empty">正在读取活跃记录...</p>'
    ].join('');
  }

  function renderRecentActivityError(target) {
    if (!target) return;
    target.innerHTML = [
      '<div class="activity-head">',
      '<h3>收藏活跃图</h3>',
      '<p class="activity-summary">过去一年新增收藏</p>',
      '</div>',
      '<p class="collection-empty activity-empty">活跃图加载失败</p>'
    ].join('');
  }

  function renderRecentActivity(target, sourceItems) {
    if (!target) return;

    var today = startOfLocalDay(new Date());
    var end = new Date(today);
    var rangeStart = new Date(today);
    rangeStart.setFullYear(rangeStart.getFullYear() - 1);
    rangeStart.setDate(rangeStart.getDate() + 1);

    var gridStart = getMonday(rangeStart);
    var dayCounts = {};
    var total = 0;

    (sourceItems || []).forEach(function (item) {
      var date = getItemActivityDate(item);
      if (!date || date < rangeStart || date > end) return;
      var key = formatActivityKey(date);
      dayCounts[key] = (dayCounts[key] || 0) + 1;
      total += 1;
    });

    var days = [];
    for (var cursor = new Date(gridStart); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      var cellDate = new Date(cursor);
      var inRange = cellDate >= rangeStart && cellDate <= end;
      var count = inRange ? (dayCounts[formatActivityKey(cellDate)] || 0) : 0;
      days.push({
        date: cellDate,
        count: count,
        level: inRange ? getActivityLevel(count) : 0,
        muted: !inRange
      });
    }

    var weekCount = Math.ceil(days.length / 7);
    var monthLabels = getActivityMonthLabels(days);
    var cellColumns = 'repeat(' + weekCount + ', 8px)';

    target.innerHTML = [
      '<div class="activity-head">',
      '<h3>收藏活跃图</h3>',
      '<p class="activity-summary">' + (total ? '过去一年新增 ' + total + ' 件收藏' : '过去一年还没有新增收藏') + '</p>',
      '</div>',
      '<div class="activity-scroll" tabindex="0" aria-label="过去一年新增收藏热力图">',
      '<div class="activity-months" style="grid-template-columns: ' + escAttr(cellColumns) + ';">',
      monthLabels.map(function (label) {
        return '<span style="grid-column:' + label.week + ';">' + esc(label.text) + '</span>';
      }).join(''),
      '</div>',
      '<div class="activity-body">',
      '<div class="activity-weekdays" aria-hidden="true"><span></span><span>周一</span><span></span><span>周三</span><span></span><span>周五</span><span></span></div>',
      '<div class="activity-grid" style="grid-template-columns: ' + escAttr(cellColumns) + ';">',
      days.map(renderActivityCell).join(''),
      '</div>',
      '</div>',
      '</div>',
      '<div class="activity-foot">',
      '<span>少</span>',
      '<span class="activity-dot" data-level="0"></span>',
      '<span class="activity-dot" data-level="1"></span>',
      '<span class="activity-dot" data-level="2"></span>',
      '<span class="activity-dot" data-level="3"></span>',
      '<span class="activity-dot" data-level="4"></span>',
      '<span>多</span>',
      '</div>'
    ].join('');

    scrollActivityToLatest(target);
  }

  function scrollActivityToLatest(target) {
    var scroller = target && target.querySelector('.activity-scroll');
    if (!scroller) return;
    window.requestAnimationFrame(function () {
      scroller.scrollLeft = scroller.scrollWidth;
    });
  }

  function renderActivityCell(day) {
    var label = formatActivityKey(day.date) + '：新增 ' + day.count + ' 件收藏';
    return [
      '<span class="activity-cell' + (day.muted ? ' is-muted' : '') + '"',
      ' data-level="' + day.level + '"',
      ' title="' + escAttr(label) + '"',
      ' aria-label="' + escAttr(label) + '"></span>'
    ].join('');
  }

  function getItemActivityDate(item) {
    var time = window.CurioVault.getTime(item && (item.createdAt || item.updatedAt));
    if (!time) return null;
    return startOfLocalDay(new Date(time));
  }

  function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function getMonday(date) {
    var start = startOfLocalDay(date);
    var day = start.getDay();
    var offset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + offset);
    return start;
  }

  function formatActivityKey(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function getActivityLevel(count) {
    if (count >= 4) return 4;
    if (count >= 3) return 3;
    if (count >= 2) return 2;
    if (count >= 1) return 1;
    return 0;
  }

  function getActivityMonthLabels(days) {
    var labels = [];
    var seen = {};
    days.forEach(function (day, index) {
      var monthKey = day.date.getFullYear() + '-' + day.date.getMonth();
      if (seen[monthKey] || day.date.getDate() > 7) return;
      seen[monthKey] = true;
      labels.push({
        week: Math.floor(index / 7) + 1,
        text: (day.date.getMonth() + 1) + '月'
      });
    });
    return labels;
  }

  function renderRecentCover(item) {
    var title = item.title || '?';
    var letter = title.charAt(0) || '?';
    if (item.coverUrl) {
      return '<img src="' + escAttr(item.coverUrl) + '" alt="" loading="lazy" decoding="async" data-letter="' + escAttr(letter) + '" onerror="var s=document.createElement(\'span\');s.className=\'recent-cover-letter\';s.textContent=this.dataset.letter || \'?\';this.parentNode.replaceChild(s,this);" />';
    }
    return '<span class="recent-cover-letter">' + esc(letter) + '</span>';
  }

  function renderRecentFeature(target, item) {
    target.innerHTML = [
      '<a class="recent-feature-card recent-feature-' + escAttr(getDisplayCategory(item.category)) + '" href="' + getItemPageHref(item.category) + '">',
      '<div class="recent-feature-cover">' + renderRecentCover(item) + '</div>',
      '<div class="recent-feature-info">',
      '<h3 class="recent-title-' + escAttr(getDisplayCategory(item.category)) + '">' + esc(item.title || '未命名收藏') + '</h3>',
      '<p>' + esc(item.description || item.artist || '暂无描述') + '</p>',
      '<div class="recent-meta">',
      '<span>' + esc(item.artist || '未填写作者') + '</span>',
      '<span>' + esc(item.year || formatRecentDate(item.createdAt)) + '</span>',
      '</div>',
      '</div>',
      '</a>'
    ].join('');
  }

  function renderRecentFilmstrip(target, items) {
    target.innerHTML = items.map(function (item) {
      return [
        '<a class="recent-strip-item recent-strip-' + escAttr(getDisplayCategory(item.category)) + '" href="' + getItemPageHref(item.category) + '">',
        '<div class="recent-strip-cover">' + renderRecentCover(item) + '</div>',
        '<strong class="recent-strip-title">' + esc(item.title || '未命名收藏') + '</strong>',
        '<span class="recent-strip-author">' + esc(item.artist || '未填写作者') + '</span>',
        '<span class="recent-strip-year">' + esc(item.year || formatRecentDate(item.createdAt)) + '</span>',
        '</a>'
      ].join('');
    }).join('');
  }

  function getItemPageHref(category) {
    if (category === 'music') return 'music.html';
    if (category === 'movie' || category === 'tv') return 'film.html';
    if (category === 'books') return 'books.html';
    if (category === 'images') return 'images.html';
    if (category === 'articles') return 'articles.html';
    return 'index.html';
  }

  function getDisplayCategory(category) {
    return category === 'movie' || category === 'tv' ? 'film' : (category || 'unknown');
  }

  function getCategoryLabelForDisplay(category) {
    if (category === 'movie' || category === 'tv') return '影视';
    return window.CurioVault.CATEGORY_LABELS[category] || '收藏';
  }

  function formatRecentDate(value) {
    var time = window.CurioVault.getTime(value);
    if (!time) return '';
    return new Date(time).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  function pickShowcaseCovers(covers, groupKey) {
    if (!covers.length) return [];
    return covers
      .map(function (src) {
        return { src: src, score: hashString(groupKey + ':' + src + ':' + getShowcaseSeed()) };
      })
      .sort(function (a, b) {
        return a.score - b.score;
      })
      .slice(0, 4)
      .map(function (item) {
        return item.src;
      });
  }

  function getShowcaseSeed() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }

  function getShowcaseCoverPlacement(groupKey, index) {
    var seed = hashString(groupKey + ':' + index);
    var base = [
      { left: 10, top: 12, rotate: -9, hoverX: -4, hoverY: -3, hoverRotate: -11 },
      { left: 43, top: 2, rotate: 4, hoverX: 0, hoverY: -6, hoverRotate: 6 },
      { left: 72, top: 12, rotate: 11, hoverX: 5, hoverY: -3, hoverRotate: 13 },
      { left: 58, top: 14, rotate: -3, hoverX: 2, hoverY: 4, hoverRotate: -5 }
    ][index] || { left: 36, top: 10, rotate: 0, hoverX: 0, hoverY: -3, hoverRotate: 0 };

    return {
      left: base.left + seededRange(seed, -4, 5),
      top: base.top + seededRange(seed >> 3, -4, 4),
      rotate: base.rotate + seededRange(seed >> 6, -3, 3),
      hoverX: base.hoverX + seededRange(seed >> 9, -2, 2),
      hoverY: base.hoverY + seededRange(seed >> 12, -2, 2),
      hoverRotate: base.hoverRotate + seededRange(seed >> 15, -3, 3)
    };
  }

  function hashString(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRange(seed, min, max) {
    var value = Math.abs(Math.sin(seed || 1) * 10000);
    return Math.floor((value - Math.floor(value)) * (max - min + 1)) + min;
  }

  function renderCoverBg(items) {
    var container = document.getElementById('coverTilesBg');
    var sceneWrapper = document.getElementById('sceneWrapper');
    if (!container || !sceneWrapper) return;

    var covers = [];
    var state = null;
    var raf = null;
    var speedMultiplier = 0.6;

    function randInt(max) { return Math.floor(Math.random() * max); }

    function createCoverPicker() {
      var recent = [];
      var maxRecent = Math.min(covers.length - 1, 8);
      return function () {
        if (covers.length === 0) return '';
        var pool = covers.filter(function (url) { return recent.indexOf(url) === -1; });
        if (pool.length === 0) {
          recent = [];
          pool = covers;
        }
        var pick = pool[randInt(pool.length)];
        recent.push(pick);
        if (recent.length > maxRecent) recent.shift();
        return pick;
      };
    }

    function extractCoverUrls(items) {
      var seen = {};
      var urls = [];
      (items || []).forEach(function (item) {
        var url = window.CurioVault.getCoverSrc(item);
        if (!url || seen[url]) return;
        seen[url] = true;
        urls.push(url);
      });
      return urls.slice(0, 60);
    }

    function createPreloadQueue(picker, size, tileW) {
      var queue = [];
      var loading = 0;
      function loadOne() {
        if (loading >= size) return;
        loading += 1;
        var src = picker();
        if (!src) {
          loading -= 1;
          return;
        }
        var probe = new Image();
        probe.onload = function () {
          queue.push({ src: src, height: Math.round(tileW * probe.naturalHeight / probe.naturalWidth) || tileW });
          loading -= 1;
          if (queue.length < size) loadOne();
        };
        probe.onerror = function () {
          queue.push({ src: src, height: tileW });
          loading -= 1;
          if (queue.length < size) loadOne();
        };
        probe.src = src;
      }
      for (var i = 0; i < size; i += 1) loadOne();
      return {
        take: function () {
          if (queue.length > 0) {
            var item = queue.shift();
            if (queue.length < size) loadOne();
            return item;
          }
          return { src: picker(), height: tileW };
        }
      };
    }

    function bootTiles() {
      stopTiles();
      if (covers.length === 0) {
        container.innerHTML = '';
        return;
      }
      var tileW = 180;
      var vh = window.innerHeight;
      var numCols = Math.floor(window.innerWidth / tileW) + 2;
      var imgsPerCol = Math.ceil(vh / tileW) + 1;
      var panel = document.createElement('div');
      var colStates = [];
      panel.className = 'cover-tiles-panel';

      for (var c = 0; c < numCols; c += 1) {
        var col = document.createElement('div');
        var dir = c % 2 === 0 ? -1 : 1;
        var speed = 6 + Math.random() * 12;
        var startY = -(Math.random() * tileW * 2);
        var picker = createCoverPicker();
        var preloadQ = createPreloadQueue(picker, 2, tileW);

        col.className = 'cover-tile-col';
        col.style.transform = 'translateY(' + startY + 'px)';

        for (var r = 0; r < imgsPerCol; r += 1) {
          appendTile(col, preloadQ.take());
        }

        colStates.push({ el: col, y: startY, speed: speed, dir: dir, preloadQ: preloadQ });
        panel.appendChild(col);
      }

      container.innerHTML = '';
      container.appendChild(panel);
      state = { cols: colStates, vh: vh, lastT: performance.now() };
      raf = requestAnimationFrame(tick);
    }

    function appendTile(col, info, before) {
      var img = document.createElement('img');
      img.src = info.src;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = function () {
        this.style.display = 'none';
        this.style.height = '0';
      };
      if (before) col.insertBefore(img, col.firstChild);
      else col.appendChild(img);
    }

    function stopTiles() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      state = null;
    }

    function tick(now) {
      if (!state) return;
      var dt = Math.min((now - state.lastT) / 1000, 0.1) * speedMultiplier;
      state.lastT = now;

      state.cols.forEach(function (cs) {
        var children = cs.el.children;
        if (children.length === 0) return;
        cs.y += cs.speed * cs.dir * dt;

        if (cs.dir < 0) {
          while (children.length > 1 && cs.y + children[0].offsetHeight <= 0) {
            cs.y += children[0].offsetHeight;
            children[0].remove();
          }
          if (children.length > 0 && cs.y + children[children.length - 1].offsetTop < state.vh) {
            appendTile(cs.el, cs.preloadQ.take());
          }
        } else {
          while (children.length > 1 && cs.y + children[children.length - 1].offsetTop >= state.vh) {
            children[children.length - 1].remove();
          }
          if (children.length > 0 && cs.y + children[0].offsetTop + children[0].offsetHeight > 0) {
            var next = cs.preloadQ.take();
            appendTile(cs.el, next, true);
            cs.y -= next.height;
          }
        }
        cs.el.style.transform = 'translateY(' + cs.y + 'px)';
      });

      raf = requestAnimationFrame(tick);
    }

    sceneWrapper.style.transform = 'scale(1)';
    sceneWrapper.style.width = '100%';
    sceneWrapper.style.height = '100%';

    covers = extractCoverUrls(items);
    if (covers.length === 0) {
      stopTiles();
      container.innerHTML = '';
      return;
    }
    bootTiles();

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(bootTiles, 300);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && raf) {
        cancelAnimationFrame(raf);
        raf = null;
      } else if (state && !raf) {
        state.lastT = performance.now();
        raf = requestAnimationFrame(tick);
      }
    });
  }
  function initMusicPlayer() {
    var playBtn = document.querySelector('.music-play');
    var coverImg = document.querySelector('.music-cover img');
    var cover = document.querySelector('.music-cover');
    if (!playBtn || !coverImg || !cover) return;

    var audio = new Audio();
    audio.src = 'assets/time_machine.mp3';
    audio.volume = 0.8;
    audio.loop = true;
    var playIcon = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M19.5 14.598c2-1.155 2-4.041 0-5.196l-9-5.196C8.5 3.05 6 4.494 6 6.804v10.392c0 2.31 2.5 3.753 4.5 2.598z" clip-rule="evenodd"/></svg>';
    var pauseIcon = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M4 7a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zm12-3a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3z" clip-rule="evenodd"/></svg>';
    var playing = false;

    playBtn.addEventListener('click', function () {
      if (playing) {
        audio.pause();
        coverImg.classList.add('paused');
        cover.classList.remove('spinning');
        playBtn.innerHTML = playIcon;
        playing = false;
      } else {
        audio.play().catch(function () {});
        coverImg.classList.remove('paused');
        coverImg.classList.add('spinning');
        cover.classList.add('spinning');
        playBtn.innerHTML = pauseIcon;
        playing = true;
      }
    });
  }

  function esc(value) {
    return window.CurioVault.esc(value);
  }

  function escAttr(value) {
    return window.CurioVault.escAttr(value);
  }

  function getErrorMessage(error) {
    return window.CurioVault.getErrorMessage(error);
  }
})();
