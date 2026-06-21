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
      feature.innerHTML = emptyBlock('\u8fd8\u6ca1\u6709\u97f3\u4e50\u6536\u85cf');
      queue.innerHTML = '';
      return;
    }

    var selectedIndex = 0;
    var audio = new Audio();
    var isPlaying = false;
    var isLyricsView = false;
    var preloadedCovers = new Map();
    var lyricsCache = new Map();
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
        '<p class="music-player-artist"><span>' + esc(item.artist || item.description || '未填写艺术家') + '</span><button class="music-lyrics-toggle" type="button" data-music-action="lyrics" aria-label="歌词" aria-pressed="' + (isLyricsView ? 'true' : 'false') + '">' + iconLyrics() + '</button></p>',
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

    function getNearestTrackIndex(event) {
      var tracks = Array.prototype.slice.call(queue.querySelectorAll('.music-track'));
      if (!tracks.length) return -1;
      var bestIndex = -1;
      var bestDistance = Infinity;
      tracks.forEach(function (track) {
        var rect = track.getBoundingClientRect();
        var centerY = rect.top + rect.height / 2;
        var distance = Math.abs(event.clientY - centerY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = Number(track.dataset.index) || 0;
        }
      });
      return bestIndex;
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
      if (!card || !item || isLyricsView) return;
      card.classList.remove('is-switching');
      card.innerHTML = renderMusicHoverCard(item);
      fitHoverTags(card);
      card.classList.add('is-visible');
      card.setAttribute('aria-hidden', 'false');
      moveMusicHoverCard(card, event);
      card.offsetWidth;
      card.classList.add('is-switching');
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
      updateLyricsToggle();
      loadSelectedAudio(isPlaying);
      preloadNearbyCovers(selectedIndex);
      scheduleCoverWarmup();
      if (isLyricsView) loadLyricsForSelected();
      updatePlaybackUi();
    }

    queue.innerHTML = [
      '<div class="music-track-list">',
      items.map(function (item, index) {
        return [
          '<article class="music-track' + (index === 0 ? ' is-active' : '') + '" role="button" tabindex="0" data-index="' + index + '" style="--row:' + Math.min(index, 10) + ';--row-delay:' + ((10 - Math.min(index, 10)) * 28) + 'ms">',
          '<div class="track-cover">' + coverImg(item) + '</div>',
          '<div class="track-info"><strong>' + esc(item.title || '未命名音乐') + '</strong><span>' + esc(item.artist || item.year || '') + '</span></div>',
          '<time class="track-duration">' + esc(formatDuration(item.duration)) + '</time>',
          '</article>'
        ].join('');
      }).join(''),
      '</div>',
      '<div class="music-lyrics-view" aria-live="polite">' + renderQueueLyricsStatus('歌词') + '</div>'
    ].join('');

    queue.querySelectorAll('.music-track').forEach(function (track) {
      track.addEventListener('click', function () {
        setSelected(Number(track.dataset.index) || 0);
      });
      track.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setSelected(Number(track.dataset.index) || 0);
      });
    });

    var hoverIndex = -1;
    queue.addEventListener('mousemove', function (event) {
      if (isLyricsView) return;
      var index = getNearestTrackIndex(event);
      if (index < 0) return;
      applyDistances(index);
      if (index !== hoverIndex) {
        hoverIndex = index;
        showMusicHoverCard(hoverCard, items[index], event);
      } else {
        moveMusicHoverCard(hoverCard, event);
      }
    });

    queue.addEventListener('mouseleave', function () {
      hoverIndex = -1;
      applyDistances(selectedIndex);
      hideMusicHoverCard(hoverCard);
    });

    feature.addEventListener('click', function (event) {
      var action = event.target.closest('[data-music-action]');
      if (!action) return;
      var musicAction = action.dataset.musicAction;
      if (musicAction === 'lyrics') {
        toggleLyricsView();
        return;
      }
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
      if (colonMatch) return String(Math.max(0, Math.floor(Number(colonMatch[1]) || 0))) + ':' + padTime(Number(colonMatch[2]));
      var textMatch = raw.match(/(\d+)\s*(?:分|m|min|minute|minutes)\s*(\d{1,2})?\s*(?:秒|s|sec|second|seconds)?/i);
      if (textMatch) return String(Math.max(0, Math.floor(Number(textMatch[1]) || 0))) + ':' + padTime(Number(textMatch[2] || 0));
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

    var loadedSrc = '';

    function loadSelectedAudio(shouldPlay) {
      var src = getAudioSrc(items[selectedIndex]);
      if (!src) {
        audio.removeAttribute('src');
        loadedSrc = '';
        audio.load();
        isPlaying = false;
        return;
      }
      if (loadedSrc !== src) {
        audio.src = src;
        loadedSrc = src;
        audio.load();
      }
      if (shouldPlay) playAudio();
    }

    function togglePlayback() {
      var src = getAudioSrc(items[selectedIndex]);
      if (!src) return;
      if (loadedSrc !== src) loadSelectedAudio(false);
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
      updateQueueLyrics(elapsed, duration);
    }

    var savedQueueScroll = 0;

    function toggleLyricsView() {
      isLyricsView = !isLyricsView;
      lastLyricIndex = -1;
      hideMusicHoverCard(hoverCard);
      if (isLyricsView) {
        savedQueueScroll = queue.scrollTop;
        queue.scrollTop = 0;
        queue.classList.add('is-lyrics-view');
      } else {
        queue.scrollTop = savedQueueScroll;
        queue.classList.remove('is-lyrics-view');
      }
      updateLyricsToggle();
      if (isLyricsView) {
        loadLyricsForSelected();
      }
    }

    function updateLyricsToggle() {
      var button = feature.querySelector('[data-music-action="lyrics"]');
      if (button) button.setAttribute('aria-pressed', isLyricsView ? 'true' : 'false');
    }

    function loadLyricsForSelected() {
      var item = items[selectedIndex];
      var panel = queue.querySelector('.music-lyrics-view');
      var key = getLyricsKey(item);
      if (!panel || !key) return;
      var cached = lyricsCache.get(key);
      if (cached) {
        lastLyricIndex = -1;
        renderQueueLyrics(panel, cached, audio.currentTime || 0, getPlaybackDuration());
        return;
      }
      panel.innerHTML = renderQueueLyricsStatus('\u6b63\u5728\u52a0\u8f7d\u6b4c\u8bcd');
      lastLyricIndex = -1;
      fetch(getLyricsEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title || '', artist: item.artist || '', link: item.link || '', songId: item.neteaseSongId || item.songId || '' })
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok || data.ok === false) throw new Error(data.error || 'Lyrics unavailable');
          return data;
        });
      }).then(function (data) {
        var result = normalizeLyricsResult(data);
        lyricsCache.set(key, result);
        if (isLyricsView) { lastLyricIndex = -1; renderQueueLyrics(panel, result, audio.currentTime || 0, getPlaybackDuration()); }
      }).catch(function (error) {
        var fallback = { lines: [], message: getLyricsErrorMessage(error) };
        lyricsCache.set(key, fallback);
        if (isLyricsView) { lastLyricIndex = -1; renderQueueLyrics(panel, fallback, audio.currentTime || 0, getPlaybackDuration()); }
      });
    }

    function getLyricsErrorMessage(error) {
      var message = error && error.message ? String(error.message) : '';
      if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return '\u6b4c\u8bcd\u63a5\u53e3\u672a\u8fde\u4e0a';
      if (/No matching NetEase song/i.test(message)) return '\u6ca1\u627e\u5230\u7f51\u6613\u4e91\u6b4c\u66f2';
      if (/Lyrics unavailable/i.test(message)) return '\u6682\u65e0\u6b4c\u8bcd';
      return message || '\u6682\u65e0\u6b4c\u8bcd';
    }

    var lastLyricIndex = -1;

    function updateQueueLyrics(elapsed, duration) {
      if (!isLyricsView) return;
      var panel = queue.querySelector('.music-lyrics-view');
      var key = getLyricsKey(items[selectedIndex]);
      var result = key ? lyricsCache.get(key) : null;
      if (!panel || !result) return;
      var lines = result.lines || [];
      if (!lines.length) return;
      var activeIndex = getActiveLyricIndex(lines, elapsed);
      if (activeIndex !== lastLyricIndex || !panel.querySelector('.queue-lyrics-lines:not(.queue-lyrics-status)')) {
        lastLyricIndex = activeIndex;
        renderQueueLyrics(panel, result, elapsed, duration);
      }
    }

    function normalizeLyricsResult(data) {
      var lines = Array.isArray(data.lines) ? data.lines : parseLyrics(data.lyric || '');
      return { songId: data.songId || '', lines: lines.filter(function (line) { return line && line.text; }), message: data.message || '' };
    }

    function parseLyrics(raw) {
      return String(raw || '').split(/\r?\n/).reduce(function (lines, row) {
        var matches = row.match(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g);
        var text = row.replace(/\[[^\]]+\]/g, '').trim();
        if (!matches || !text) return lines;
        matches.forEach(function (stamp) {
          var parts = stamp.match(/\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/);
          if (!parts) return;
          var ms = Number('0.' + (parts[3] || '0')) || 0;
          lines.push({ time: Number(parts[1]) * 60 + Number(parts[2]) + ms, text: text });
        });
        return lines;
      }, []).sort(function (a, b) { return a.time - b.time; });
    }

    function renderQueueLyrics(panel, result, elapsed, duration) {
      var lines = result.lines || [];
      if (!lines.length) {
        panel.innerHTML = renderQueueLyricsStatus(result.message || '\u6682\u65e0\u6b4c\u8bcd');
        return;
      }
      var activeIndex = getActiveLyricIndex(lines, elapsed);
      var windowLines = getLyricWindow(lines, activeIndex);
      panel.innerHTML = [
        '<div class="queue-lyrics-lines" style="--active-line:' + activeIndex + '">',
        windowLines.map(function (line, index) {
          var distance = line.sourceIndex - activeIndex;
          var distanceAbs = Math.abs(distance);
          var className = 'queue-lyric-line' + (distance === 0 ? ' is-current' : distance < 0 ? ' is-before' : ' is-after');
          var primary = renderLyricPrimary(line.text, distance === 0);
          var lineStyle = [
            '--line-index:' + index,
            '--line-delay:' + ((8 - index) * 34) + 'ms',
            '--line-distance:' + distanceAbs,
            '--line-shift:' + (distanceAbs * -3) + 'px',
            '--line-scale:' + (1 - Math.min(distanceAbs, 4) * 0.035).toFixed(3),
            '--line-opacity:' + Math.max(0.22, 0.74 - distanceAbs * 0.13).toFixed(2)
          ].join(';');
          return '<p class="' + className + '" style="' + lineStyle + '">' + primary + (line.translation ? '<span class="queue-lyric-translation">' + esc(line.translation) + '</span>' : '') + '</p>';
        }).join(''),
        '</div>'
      ].join('');
    }

    function renderLyricPrimary(text, isCurrent) {
      if (!isCurrent) return '<span class="queue-lyric-primary">' + esc(text) + '</span>';
      return '<span class="queue-lyric-primary">' + splitLyricTokens(text).map(function (token, index) {
        return '<span class="queue-lyric-word" style="--word-index:' + index + ';--word-delay:' + (index * 18) + 'ms">' + esc(token) + '</span>';
      }).join('') + '</span>';
    }

    function splitLyricTokens(text) {
      var value = String(text || '');
      if (!value.trim()) return [''];
      if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(value)) return Array.from(value);
      return value.split(/(\s+)/);
    }

    function renderQueueLyricsStatus(message) {
      return '<div class="queue-lyrics-lines queue-lyrics-status"><p class="queue-lyric-line is-current"><span class="queue-lyric-primary">' + esc(message) + '</span></p></div>';
    }

    function getActiveLyricIndex(lines, elapsed) {
      var index = 0;
      for (var i = 0; i < lines.length; i += 1) {
        if (lines[i].time > elapsed + 0.12) break;
        index = i;
      }
      return index;
    }

    function getLyricWindow(lines, activeIndex) {
      var start = Math.max(0, activeIndex - 4);
      var end = Math.min(lines.length, start + 9);
      start = Math.max(0, end - 9);
      return lines.slice(start, end).map(function (line, offset) {
        return Object.assign({ sourceIndex: start + offset }, line);
      });
    }

    function getLyricsKey(item) {
      if (!item) return '';
      return [item.neteaseSongId || item.songId || extractNetEaseSongId(item.link), item.title || '', item.artist || ''].filter(Boolean).join('|').toLowerCase();
    }

    function getLyricsEndpoint() {
      if (typeof CURIOVAULT_LYRICS_ENDPOINT !== 'undefined' && CURIOVAULT_LYRICS_ENDPOINT) {
        return CURIOVAULT_LYRICS_ENDPOINT;
      }
      if (window.location.hostname.indexOf('vercel.app') !== -1) {
        return '/api/musicLyrics';
      }
      return '';
    }

    function extractNetEaseSongId(link) {
      var value = String(link || '');
      var match = value.match(/[?&#]id=(\d+)/) || value.match(/song\/(\d+)/);
      return match ? match[1] : '';
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
          window.setTimeout(function () { preloadCover(item); }, index * 120);
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
      img.onload = function () { preloadedCovers.set(src, 'loaded'); };
      img.onerror = function () { preloadedCovers.delete(src); };
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
      var src = getCoverSrc(item);
      requestId += 1;
      var current = requestId;

      if (!src) { clearFluidOrbs(); return; }

      /* Pick the inactive layer to receive new cover */
      var incoming = (activeLayer === layerA) ? layerB : layerA;
      var outgoing = activeLayer;

      var img = new Image();
      function applyCover() {
        if (current !== requestId) return;
        /* Set new background on incoming orbs */
        var orbs = incoming.querySelectorAll('.fluid-orb');
        orbs.forEach(function (orb) {
          orb.style.backgroundImage = cssImageUrl(src);
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

  function cssImageUrl(src) {
    return 'url("' + String(src).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
  }
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

  function iconLyrics() {
    return '<svg class="track-lyrics-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5.5 5.8h13v2h-13v-2zm0 5.1h9.4v2H5.5v-2zm0 5.1h6.8v2H5.5v-2z" /></svg>';
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






