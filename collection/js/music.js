// Music collection page renderer and fluid background.
(function () {
  window.CollectionMusic = {
    renderMusic: renderMusic
  };

  var coverPaletteCache = new Map();

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
    var audio = new Audio();
    var isPlaying = false;
    var preloadedCovers = new Map();
    var hasScheduledCoverWarmup = false;
    var hoverCard = getMusicHoverCard();

    audio.addEventListener('ended', function () {
      isPlaying = false;
      updatePlaybackUi();
    });

    audio.addEventListener('pause', function () {
      isPlaying = false;
      updatePlaybackUi();
    });

    audio.addEventListener('play', function () {
      isPlaying = true;
      updatePlaybackUi();
    });

    audio.addEventListener('timeupdate', updatePlaybackUi);
    audio.addEventListener('loadedmetadata', updatePlaybackUi);

    function renderSelectedMusic(item, animateInfo) {
      feature.innerHTML = [
        '<div class="music-player-content' + (animateInfo ? ' is-switching' : '') + '">',
        '<div class="music-player-cover">' + coverImg(item, { loading: 'eager' }) + '</div>',
        '<div class="music-player-meta">',
        '<h1>' + esc(item.title || '未命名音乐') + '</h1>',
        '<p>' + esc(item.artist || item.description || '未填写艺术家') + '</p>',
        '</div>',
        '<div class="music-player-controls" aria-label="音乐控制">',
        '<button class="music-panel-btn" type="button" data-music-action="prev" aria-label="上一首">' + iconPrev() + '</button>',
        '<button class="music-panel-btn music-panel-play" type="button" data-music-action="toggle" aria-label="播放">' + iconPlay() + '</button>',
        '<button class="music-panel-btn" type="button" data-music-action="next" aria-label="下一首">' + iconNext() + '</button>',
        '</div>',
        '<div class="music-player-progress" role="slider" tabindex="0" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="music-player-progress-track"><span class="music-player-progress-fill"></span></span></div>',
        '<div class="music-player-time" aria-live="off"><time data-time-current>00:00</time><time data-time-remaining>-00:00</time></div>',
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

    function getMusicHoverCard() {
      var card = document.querySelector('.music-hover-card');
      if (card) return card;
      card = document.createElement('aside');
      card.className = 'music-hover-card';
      card.setAttribute('aria-hidden', 'true');
      document.body.appendChild(card);
      return card;
    }

    function showMusicHoverCard(card, item, event) {
      if (!card || !item) return;
      card.innerHTML = renderMusicHoverCard(item);
      fitHoverTags(card);
      card.classList.add('is-visible');
      card.setAttribute('aria-hidden', 'false');
      moveMusicHoverCard(card, event);
    }

    function fitHoverTags(card) {
      var row = card.querySelector('.music-hover-tags-inline');
      if (!row) return;
      var year = row.querySelector('.music-hover-year');
      var tags = Array.prototype.slice.call(row.querySelectorAll('.music-hover-tag'));
      tags.forEach(function (tag) { tag.hidden = false; });

      var styles = window.getComputedStyle(row);
      var gap = parseFloat(styles.columnGap || styles.gap) || 0;
      var used = year ? year.offsetWidth + gap : 0;
      var rowWidth = row.clientWidth;

      tags.forEach(function (tag) {
        var nextWidth = used + tag.offsetWidth;
        if (nextWidth > rowWidth) {
          tag.hidden = true;
          return;
        }
        used = nextWidth + gap;
      });
    }

    function moveMusicHoverCard(card, event) {
      if (!card || !event) return;
      var gap = 18;
      var width = card.offsetWidth || 320;
      var height = card.offsetHeight || 220;
      var x = event.clientX + gap;
      var y = event.clientY + gap;
      if (x + width > window.innerWidth - 14) x = event.clientX - width - gap;
      if (y + height > window.innerHeight - 14) y = event.clientY - height - gap;
      card.style.left = Math.max(14, x) + 'px';
      card.style.top = Math.max(14, y) + 'px';
    }

    function hideMusicHoverCard(card) {
      if (!card) return;
      card.classList.remove('is-visible');
      card.setAttribute('aria-hidden', 'true');
    }

    function renderMusicHoverCard(item) {
      var artist = item.artist || '未填写歌手';
      var tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 3) : [];
      return [
        '<div class="music-hover-cover">' + coverImg(item, { loading: 'eager' }) + '</div>',
        '<div class="music-hover-main">',
        '<h3>' + esc(item.title || '未命名音乐') + '</h3>',
        '<p class="music-hover-artist">' + esc(artist) + '</p>',
        renderHoverStars(item.rating),
        renderHoverTagLine(item.year, tags),
        '</div>',
        '<p class="music-hover-desc">' + esc(item.description || '暂无歌曲简介') + '</p>'
      ].join('');
    }

    function renderHoverTagLine(year, tags) {
      if (!year && !tags.length) return '';
      return [
        '<div class="music-hover-meta music-hover-tags-inline">',
        year ? '<span class="music-hover-year">' + esc(year) + ' ·</span>' : '',
        tags.map(function (tag) { return '<span class="music-hover-tag">' + esc(tag) + '</span>'; }).join(''),
        '</div>'
      ].join('');
    }

    function renderHoverStars(value) {
      var rating = Math.max(0, Math.min(5, Math.round((parseFloat(value) || 4) * 2) / 2));
      var stars = '';
      for (var i = 1; i <= 5; i += 1) {
        stars += '<span class="' + (rating >= i ? 'is-full' : rating >= i - 0.5 ? 'is-half' : '') + '">★</span>';
      }
      return '<div class="music-hover-stars" aria-label="推荐 ' + escAttr(rating) + ' / 5">' + stars + '</div>';
    }

    function setSelected(index) {
      var nextIndex = Math.max(0, Math.min(items.length - 1, index));
      var animateInfo = feature.querySelector('.music-player-content') !== null && nextIndex !== selectedIndex;
      selectedIndex = nextIndex;
      renderSelectedMusic(items[selectedIndex], animateInfo);
      updateMusicPalette(items[selectedIndex]);
      applyDistances(selectedIndex);
      loadSelectedAudio(isPlaying);
      preloadNearbyCovers(selectedIndex);
      scheduleCoverWarmup();
      updatePlaybackUi();
    }

    queue.innerHTML = items.map(function (item, index) {
      return [
        '<article class="music-track' + (index === 0 ? ' is-active' : '') + '" role="button" tabindex="0" data-index="' + index + '">',
        '<div class="track-cover">' + coverImg(item) + '</div>',
        '<div class="track-info"><strong>' + esc(item.title || '未命名音乐') + '</strong><span>' + esc(item.artist || item.year || '') + '</span></div>',
        '<time class="track-duration">' + esc(formatDuration(item.duration)) + '</time>',
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
      track.addEventListener('mouseenter', function (event) {
        var index = Number(track.dataset.index) || 0;
        applyDistances(index);
        showMusicHoverCard(hoverCard, items[index], event);
      });
      track.addEventListener('mousemove', function (event) {
        moveMusicHoverCard(hoverCard, event);
      });
      track.addEventListener('mouseleave', function () {
        hideMusicHoverCard(hoverCard);
      });
    });

    queue.addEventListener('mouseleave', function () {
      applyDistances(selectedIndex);
      hideMusicHoverCard(hoverCard);
    });

    feature.addEventListener('click', function (event) {
      var action = event.target.closest('[data-music-action]');
      if (!action) return;
      var musicAction = action.dataset.musicAction;
      if (musicAction === 'toggle') {
        var willPlay = audio.paused;
        togglePlayback();
        animateControlButton(action, willPlay ? 'is-toggle-play' : 'is-toggle-pause');
        return;
      }
      animateControlButton(action);
      if (musicAction === 'prev') {
        window.setTimeout(function () { setSelected(selectedIndex - 1); }, 170);
      }
      if (musicAction === 'next') {
        window.setTimeout(function () { setSelected(selectedIndex + 1); }, 170);
      }
    });

    function animateControlButton(button, modeClass) {
      button.classList.remove('is-clicking', 'is-toggle-play', 'is-toggle-pause');
      button.offsetWidth;
      if (modeClass) button.classList.add(modeClass);
      button.classList.add('is-clicking');
      window.setTimeout(function () {
        if (button.isConnected) button.classList.remove('is-clicking', 'is-toggle-play', 'is-toggle-pause');
      }, 320);
    }

    feature.addEventListener('pointerdown', handleProgressPointerDown);

    function handleProgressPointerDown(event) {
      var bar = event.target.closest('.music-player-progress');
      if (!bar || !getAudioSrc(items[selectedIndex])) return;
      var duration = getPlaybackDuration();
      if (!duration) return;

      event.preventDefault();
      bar.classList.add('is-dragging');
      bar.setPointerCapture(event.pointerId);
      seekFromPointer(bar, event.clientX, duration);

      function handleMove(moveEvent) {
        seekFromPointer(bar, moveEvent.clientX, duration);
      }

      function handleUp(upEvent) {
        bar.classList.remove('is-dragging');
        bar.releasePointerCapture(upEvent.pointerId);
        bar.removeEventListener('pointermove', handleMove);
        bar.removeEventListener('pointerup', handleUp);
        bar.removeEventListener('pointercancel', handleUp);
      }

      bar.addEventListener('pointermove', handleMove);
      bar.addEventListener('pointerup', handleUp);
      bar.addEventListener('pointercancel', handleUp);
    }

    function seekFromPointer(bar, clientX, duration) {
      var rect = bar.getBoundingClientRect();
      var ratio = rect.width ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
      audio.currentTime = ratio * duration;
      updatePlaybackUi();
    }

    function getPlaybackDuration() {
      return Number.isFinite(audio.duration) ? audio.duration : getDurationSeconds(items[selectedIndex]);
    }

    function getAudioSrc(item) {
      return item && typeof item.link === 'string' ? item.link.trim() : '';
    }

    function formatDuration(value) {
      if (value === null || value === undefined) return '';
      var raw = String(value).trim();
      if (!raw) return '';

      if (/^\d+$/.test(raw)) return secondsToTime(Number(raw));

      var colonMatch = raw.match(/^(\d{1,3}):(\d{1,2})$/);
      if (colonMatch) {
        return String(Math.max(0, Math.floor(Number(colonMatch[1]) || 0))) + ':' + padTime(Number(colonMatch[2]));
      }

      var textMatch = raw.match(/(\d+)\s*(?:分|m|min|minute|minutes)\s*(\d{1,2})?\s*(?:秒|s|sec|second|seconds)?/i);
      if (textMatch) {
        return String(Math.max(0, Math.floor(Number(textMatch[1]) || 0))) + ':' + padTime(Number(textMatch[2] || 0));
      }

      return raw;
    }

    function secondsToTime(totalSeconds) {
      var safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
      var minutes = Math.floor(safeSeconds / 60);
      var seconds = safeSeconds % 60;
      return String(minutes) + ':' + padTime(seconds);
    }

    function getDurationSeconds(item) {
      if (!item || item.duration === null || item.duration === undefined) return 0;
      var raw = String(item.duration).trim();
      if (!raw) return 0;
      if (/^\d+$/.test(raw)) return Number(raw);

      var colonMatch = raw.match(/^(\d{1,3}):(\d{1,2})$/);
      if (colonMatch) return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);

      var textMatch = raw.match(/(\d+)\s*(?:分|m|min|minute|minutes)\s*(\d{1,2})?\s*(?:秒|s|sec|second|seconds)?/i);
      if (textMatch) return Number(textMatch[1]) * 60 + Number(textMatch[2] || 0);

      return 0;
    }

    function padTime(value) {
      return String(Math.max(0, Math.floor(value || 0))).padStart(2, '0');
    }

    function loadSelectedAudio(shouldPlay) {
      var src = getAudioSrc(items[selectedIndex]);
      if (!src) {
        audio.removeAttribute('src');
        audio.load();
        isPlaying = false;
        return;
      }
      if (audio.src !== src) {
        audio.src = src;
        audio.load();
      }
      if (shouldPlay) playAudio();
    }

    function togglePlayback() {
      var src = getAudioSrc(items[selectedIndex]);
      if (!src) return;
      if (audio.src !== src) loadSelectedAudio(false);
      if (audio.paused) {
        playAudio();
        return;
      }
      audio.pause();
      isPlaying = false;
      updatePlaybackUi();
    }

    function playAudio() {
      isPlaying = true;
      updatePlaybackUi();
      audio.play().catch(function () {
        isPlaying = false;
        updatePlaybackUi();
      });
    }

    function updatePlaybackUi() {
      var playBtn = feature.querySelector('[data-music-action="toggle"]');
      var progress = feature.querySelector('.music-player-progress-fill');
      var currentTime = feature.querySelector('[data-time-current]');
      var remainingTime = feature.querySelector('[data-time-remaining]');
      var hasAudio = Boolean(getAudioSrc(items[selectedIndex]));
      if (playBtn) {
        var iconState = isPlaying ? 'pause' : 'play';
        playBtn.disabled = !hasAudio;
        playBtn.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
        if (playBtn.dataset.iconState !== iconState) {
          playBtn.innerHTML = isPlaying ? iconPause() : iconPlay();
          playBtn.dataset.iconState = iconState;
        }
      }
      var duration = getPlaybackDuration();
      var elapsed = Math.max(0, audio.currentTime || 0);
      if (progress) {
        var ratio = duration ? Math.max(0, Math.min(1, elapsed / duration)) : 0;
        progress.style.width = (ratio * 100).toFixed(2) + '%';
        var progressBar = progress.closest('.music-player-progress');
        if (progressBar) progressBar.setAttribute('aria-valuenow', Math.round(ratio * 100));
      }
      if (currentTime) currentTime.textContent = secondsToTime(elapsed);
      if (remainingTime) remainingTime.textContent = '-' + secondsToTime(Math.max(0, duration - elapsed));
    }

    function preloadNearbyCovers(centerIndex) {
      [0, 1, -1, 2, -2].forEach(function (offset) {
        preloadCover(items[centerIndex + offset]);
      });
    }

    function scheduleCoverWarmup() {
      if (hasScheduledCoverWarmup) return;
      hasScheduledCoverWarmup = true;

      var run = function () {
        items.forEach(function (item, index) {
          window.setTimeout(function () {
            preloadCover(item);
          }, index * 120);
        });
      };

      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(run, { timeout: 1200 });
        return;
      }
      window.setTimeout(run, 400);
    }
    function preloadCover(item) {
      var src = getCoverSrc(item);
      if (!src || preloadedCovers.has(src)) return;

      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        preloadedCovers.set(src, 'loaded');
      };
      img.onerror = function () {
        preloadedCovers.delete(src);
      };
      preloadedCovers.set(src, img);
      img.src = src;
    }
    setSelected(0);
  }

  function updateMusicPalette(item) {
    if (window.updateMusicFluidPalette) {
      window.updateMusicFluidPalette(item);
      return;
    }
    document.dispatchEvent(new CustomEvent('music:coverchange', { detail: item }));
  }

  /* ── Album-cover fluid background (amll-style, double-buffer) ── */
  function initMusicFluidBackground() {
    var body = document.body;
    if (!body || !body.classList.contains('page-music')) return;

    var layerA = document.getElementById('musicFluidLayerA');
    var layerB = document.getElementById('musicFluidLayerB');
    if (!layerA || !layerB) return;

    var activeLayer = layerA;
    var requestId = 0;

    /* ── Public API ── */
    window.updateMusicFluidPalette = function (item) {
      var src = item && typeof item.coverUrl === 'string' ? item.coverUrl.trim() : '';
      requestId += 1;
      var current = requestId;

      if (!src) { clearFluidOrbs(); return; }

      /* Pick the inactive layer to receive new cover */
      var incoming = (activeLayer === layerA) ? layerB : layerA;
      var outgoing = activeLayer;

      var img = new Image();
      img.crossOrigin = 'anonymous';
      function applyCover() {
        if (current !== requestId) return;
        /* Set new background on incoming orbs */
        var orbs = incoming.querySelectorAll('.fluid-orb');
        orbs.forEach(function (orb) {
          orb.style.backgroundImage = 'url(' + escAttr(src) + ')';
        });
        incoming.offsetHeight;
        orbs.forEach(function (orb) { orb.classList.add('loaded'); });

        /* Fade out old layer */
        var oldOrbs = outgoing.querySelectorAll('.fluid-orb');
        oldOrbs.forEach(function (orb) { orb.classList.remove('loaded'); });

        /* Swap active */
        activeLayer = incoming;
      }
      img.onload = applyCover;
      img.onerror = function () {
        if (current === requestId) clearFluidOrbs();
      };
      img.src = src;
      if (img.complete) applyCover();

      /* Extract dominant colour for page background */
      extractCoverPalette(src).then(function (palette) {
        if (current !== requestId) return;
        var base = palette.base || tintMusicColor(palette.colors[0]);
        body.style.setProperty('--music-fluid-base', rgbString(base));
      }).catch(function () {});
    };

    document.addEventListener('music:coverchange', function (event) {
      window.updateMusicFluidPalette(event.detail || {});
    });
  }

  function clearFluidOrbs() {
    document.querySelectorAll('.fluid-orb').forEach(function (orb) {
      orb.style.backgroundImage = '';
      orb.classList.remove('loaded');
    });
    var body = document.body;
    if (body) body.style.setProperty('--music-fluid-base', '#f8f3ff');
  }

  /* ── Cover palette extraction (reused for base colour) ── */
  function extractCoverPalette(src) {
    if (coverPaletteCache.has(src)) return coverPaletteCache.get(src);

    var palettePromise = new Promise(function (resolve, reject) {
      var image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          var size = 48;
          canvas.width = size;
          canvas.height = size;
          var ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(image, 0, 0, size, size);
          resolve(buildPaletteFromPixels(ctx.getImageData(0, 0, size, size).data));
        } catch (e) { reject(e); }
      };
      image.onerror = reject;
      image.src = src;
    }).catch(function (error) {
      coverPaletteCache.delete(src);
      throw error;
    });

    coverPaletteCache.set(src, palettePromise);
    return palettePromise;
  }
  function buildPaletteFromPixels(data) {
    var buckets = [];
    for (var i = 0; i < data.length; i += 16) {
      var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 160) continue;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var sat = max === 0 ? 0 : (max - min) / max;
      var bri = (r + g + b) / 3;
      if (bri < 32 || bri > 238 || sat < 0.12) continue;
      buckets.push({ rgb: boostMusicColor([r, g, b]), score: sat * 90 + Math.abs(bri - 150) * -0.12 + max * 0.08 });
    }
    buckets.sort(function (a, b) { return b.score - a.score; });
    var colors = [];
    buckets.forEach(function (b) {
      if (colors.length >= 4) return;
      if (colors.every(function (c) { return colorDistance(c, b.rgb) > 62; })) colors.push(b.rgb);
    });
    if (colors.length === 0) throw new Error('No usable cover colours');
    while (colors.length < 4) colors.push(deriveCoverColor(colors[0], colors.length));
    return { colors: colors, base: tintMusicColor(colors[0]) };
  }

  function boostMusicColor(rgb) {
    return rgb.map(function (v) { return Math.max(30, Math.min(248, Math.round(v * 0.86 + 36))); });
  }
  function tintMusicColor(rgb) {
    return rgb.map(function (v) { return Math.round(v * 0.38 + 255 * 0.62); });
  }
  function colorDistance(a, b) {
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  function deriveCoverColor(rgb, index) {
    var mixes = [[255, 255, 255, 0.24], [0, 0, 0, 0.18], [255 - rgb[0], 255 - rgb[1], 255 - rgb[2], 0.16]];
    var mix = mixes[(index - 1) % mixes.length];
    return rgb.map(function (v, i) { return Math.max(24, Math.min(255, Math.round(v * (1 - mix[3]) + mix[i] * mix[3]))); });
  }
  function rgbString(rgb) { return 'rgb(' + rgb.join(', ') + ')'; }

  initMusicFluidBackground();

  function iconPlay() {
    return '<svg class="music-panel-icon music-panel-icon-play" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M12 9.8c0-1.5 1.7-2.4 2.9-1.5l9.2 6.2c1.1.7 1.1 2.3 0 3l-9.2 6.2c-1.2.8-2.9 0-2.9-1.5V9.8z" /></svg>';
  }

  function iconPause() {
    return '<svg class="music-panel-icon music-panel-icon-play" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="9.5" y="8" width="5" height="16" rx="2" /><rect x="17.5" y="8" width="5" height="16" rx="2" /></svg>';
  }
  function iconPrev() {
    return '<svg class="music-panel-icon music-panel-icon-flow" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path class="icon-flow-out icon-flow-a" d="M14.8 9.7c0-1.25-1.42-1.96-2.42-1.22l-8.1 6.02c-.9.67-.9 2.03 0 2.7l8.1 6.02c1 .74 2.42.03 2.42-1.22V9.7z" /><path class="icon-flow-out icon-flow-b" d="M24.8 9.7c0-1.25-1.42-1.96-2.42-1.22l-8.1 6.02c-.9.67-.9 2.03 0 2.7l8.1 6.02c1 .74 2.42.03 2.42-1.22V9.7z" /><path class="icon-flow-in icon-flow-a" d="M14.8 9.7c0-1.25-1.42-1.96-2.42-1.22l-8.1 6.02c-.9.67-.9 2.03 0 2.7l8.1 6.02c1 .74 2.42.03 2.42-1.22V9.7z" /><path class="icon-flow-in icon-flow-b" d="M24.8 9.7c0-1.25-1.42-1.96-2.42-1.22l-8.1 6.02c-.9.67-.9 2.03 0 2.7l8.1 6.02c1 .74 2.42.03 2.42-1.22V9.7z" /></svg>';
  }

  function iconNext() {
    return '<svg class="music-panel-icon music-panel-icon-flow" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path class="icon-flow-out icon-flow-a" d="M17.2 9.7c0-1.25 1.42-1.96 2.42-1.22l8.1 6.02c.9.67.9 2.03 0 2.7l-8.1 6.02c-1 .74-2.42.03-2.42-1.22V9.7z" /><path class="icon-flow-out icon-flow-b" d="M7.2 9.7c0-1.25 1.42-1.96 2.42-1.22l8.1 6.02c.9.67.9 2.03 0 2.7l-8.1 6.02c-1 .74-2.42.03-2.42-1.22V9.7z" /><path class="icon-flow-in icon-flow-a" d="M17.2 9.7c0-1.25 1.42-1.96 2.42-1.22l8.1 6.02c.9.67.9 2.03 0 2.7l-8.1 6.02c-1 .74-2.42.03-2.42-1.22V9.7z" /><path class="icon-flow-in icon-flow-b" d="M7.2 9.7c0-1.25 1.42-1.96 2.42-1.22l8.1 6.02c.9.67.9 2.03 0 2.7l-8.1 6.02c-1 .74-2.42.03-2.42-1.22V9.7z" /></svg>';
  }
  function getCoverSrc(item) {
    return item && typeof item.coverUrl === 'string' ? item.coverUrl.trim() : '';
  }

  function coverImg(item, options) {
    var title = item.title || '?';
    var src = getCoverSrc(item);
    var loading = options && options.loading === 'eager' ? 'eager' : 'lazy';
    if (src) {
      return '<img src="' + escAttr(src) + '" alt="" loading="' + loading + '" decoding="async" onerror="this.parentElement.textContent=\'' + escAttr(title.charAt(0) || '?') + '\'" />';
    }
    return '<span class="cover-letter">' + esc(title.charAt(0) || '?') + '</span>';
  }


  function emptyBlock(message) {
    return '<p class="collection-empty">' + esc(message) + '</p>';
  }
  function esc(value) {
    if (window.CollectionData && typeof window.CollectionData.esc === 'function') {
      return window.CollectionData.esc(value);
    }
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function escAttr(value) {
    if (window.CollectionData && typeof window.CollectionData.escAttr === 'function') {
      return window.CollectionData.escAttr(value);
    }
    return esc(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
})();





