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
    var isTranslationVisible = false;
    var preloadedCovers = new Map();
    var lyricsCache = new Map();
    var pendingLyricsRequests = new Map();
    var hasScheduledCoverWarmup = false;
    var hoverCard = getMusicHoverCard();
    var playbackFrameId = 0;

    audio.addEventListener('ended', function () {
      stopPlaybackSync();
      playNextAfterEnded();
    });

    audio.addEventListener('pause', function () {
      isPlaying = false;
      stopPlaybackSync();
      updatePlaybackUi();
    });

    audio.addEventListener('play', function () {
      isPlaying = true;
      startPlaybackSync();
      updatePlaybackUi();
    });

    audio.addEventListener('timeupdate', updatePlaybackUi);
    audio.addEventListener('loadedmetadata', updatePlaybackUi);

    function renderSelectedMusic(item, animateInfo) {
      feature.innerHTML = [
        '<div class="music-player-content' + (isPlaying ? ' is-playing' : ' is-paused') + (animateInfo ? ' is-switching' : '') + '">',
        '<div class="music-player-cover">' + coverImg(item, { loading: 'eager' }) + '</div>',
        '<div class="music-player-meta">',
        '<h1>' + esc(item.title || '未命名音乐') + '</h1>',
        '<p class="music-player-artist"><span>' + esc(item.artist || item.description || '未填写艺术家') + '</span>' + iconTranslationButton(false, false) + '<button class="music-lyrics-toggle" type="button" data-music-action="lyrics" aria-label="歌词" aria-pressed="' + (isLyricsView ? 'true' : 'false') + '">' + iconLyrics() + '</button></p>',
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
      if (animateInfo) {
        animatePlayerTextSwitch();
        clearMusicSwitchingState();
      }
    }

    function clearMusicSwitchingState() {
      window.setTimeout(function () {
        var content = feature.querySelector('.music-player-content.is-switching');
        if (content) content.classList.remove('is-switching');
      }, 560);
    }

    function animatePlayerTextSwitch() {
      var gsap = getGsap();
      var title = feature.querySelector('.music-player-meta h1');
      var artist = feature.querySelector('.music-player-artist span');
      var targets = [title, artist].filter(Boolean);
      if (!targets.length) return;
      if (!gsap || prefersReducedMotion()) {
        targets.forEach(function (target) {
          target.style.opacity = '';
          target.style.transform = '';
          target.style.filter = '';
        });
        return;
      }
      gsap.killTweensOf(targets);
      gsap.set(targets, {
        autoAlpha: 0,
        y: 12,
        scale: 0.985,
        filter: 'blur(7px)',
        transformOrigin: 'left center'
      });
      gsap.to(targets, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        duration: 0.54,
        stagger: 0.065,
        ease: 'power3.out',
        overwrite: true,
        clearProps: 'transform,filter,opacity,visibility'
      });
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

    function playNextAfterEnded() {
      var nextIndex = findNextPlayableIndex(selectedIndex + 1);
      if (nextIndex === -1) {
        isPlaying = false;
        updatePlaybackUi();
        return;
      }
      isPlaying = true;
      setSelected(nextIndex);
    }

    function findNextPlayableIndex(startIndex) {
      for (var index = startIndex; index < items.length; index += 1) {
        if (getAudioSrc(items[index])) return index;
      }
      return -1;
    }

    function setSelected(index) {
      var nextIndex = Math.max(0, Math.min(items.length - 1, index));
      var animateInfo = feature.querySelector('.music-player-content') !== null && nextIndex !== selectedIndex;
      if (animateInfo) spawnTranslationButtonGhost();
      selectedIndex = nextIndex;
      isTranslationVisible = false;
      renderSelectedMusic(items[selectedIndex], animateInfo);
      updateMusicPalette(items[selectedIndex]);
      applyDistances(selectedIndex);
      updateLyricsToggle();
      updateTranslationToggle();
      loadSelectedAudio(isPlaying);
      preloadNearbyCovers(selectedIndex);
      preloadSelectedLyrics();
      scheduleCoverWarmup();
      if (isLyricsView) loadLyricsForSelected();
      updatePlaybackUi();
    }

    function spawnTranslationButtonGhost() {
      var button = feature.querySelector('[data-music-action="translation"]');
      if (!button || !button.classList.contains('is-visible')) return;
      var rect = button.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var ghost = button.cloneNode(true);
      ghost.classList.remove('is-visible');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.tabIndex = -1;
      ghost.style.position = 'fixed';
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.margin = '0';
      ghost.style.zIndex = '9999';
      ghost.style.pointerEvents = 'none';
      ghost.style.opacity = '0.72';
      ghost.style.transform = 'translate3d(0, 0, 0) scale(1)';
      ghost.style.transition = 'opacity 0.2s ease, transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)';
      document.body.appendChild(ghost);
      window.requestAnimationFrame(function () {
        ghost.style.opacity = '0';
        ghost.style.transform = 'translate3d(0, -2px, 0) scale(0.72)';
      });
      window.setTimeout(function () {
        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      }, 260);
    }

    queue.innerHTML = [
      '<div class="music-track-scroll">',
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
      if (musicAction === 'translation') {
        toggleTranslationView();
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
        stopPlaybackSync();
        updatePlaybackUi();
      });
    }

    function startPlaybackSync() {
      if (playbackFrameId || !window.requestAnimationFrame) return;
      playbackFrameId = window.requestAnimationFrame(syncPlaybackFrame);
    }

    function stopPlaybackSync() {
      if (!playbackFrameId || !window.cancelAnimationFrame) {
        playbackFrameId = 0;
        return;
      }
      window.cancelAnimationFrame(playbackFrameId);
      playbackFrameId = 0;
    }

    function syncPlaybackFrame() {
      playbackFrameId = 0;
      if (!isPlaying || audio.paused || audio.ended) return;
      updatePlaybackUi();
      startPlaybackSync();
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
      var playerContent = feature.querySelector('.music-player-content');
      if (playerContent) {
        playerContent.classList.toggle('is-playing', isPlaying);
        playerContent.classList.toggle('is-paused', !isPlaying);
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

    function toggleLyricsView() {
      isLyricsView = !isLyricsView;
      isTranslationVisible = false;
      lastLyricIndex = -1;
      hideMusicHoverCard(hoverCard);
      queue.classList.toggle('is-lyrics-view', isLyricsView);
      updateLyricsToggle();
      updateTranslationToggle();
      if (isLyricsView) loadLyricsForSelected();
    }

    function updateLyricsToggle() {
      var button = feature.querySelector('[data-music-action="lyrics"]');
      if (!button) return;
      button.setAttribute('aria-pressed', isLyricsView ? 'true' : 'false');
    }

    function toggleTranslationView() {
      if (!isLyricsView || !hasSelectedLyricTranslation()) return;
      isTranslationVisible = !isTranslationVisible;
      updateTranslationToggle();
    }

    function updateTranslationToggle() {
      var button = feature.querySelector('[data-music-action="translation"]');
      if (!button) return;
      var canShow = isLyricsView && hasSelectedLyricTranslation();
      if (!canShow) isTranslationVisible = false;
      button.setAttribute('aria-hidden', canShow ? 'false' : 'true');
      button.tabIndex = canShow ? 0 : -1;
      button.setAttribute('aria-pressed', isTranslationVisible ? 'true' : 'false');
      if (canShow) {
        if (!button.classList.contains('is-visible')) {
          window.requestAnimationFrame(function () {
            if (button.isConnected && isLyricsView && hasSelectedLyricTranslation()) {
              button.classList.add('is-visible');
            }
          });
        }
      } else {
        button.classList.remove('is-visible');
      }
      var shouldHideTranslation = !isTranslationVisible;
      var wasTranslationHidden = queue.classList.contains('is-translation-hidden');
      queue.classList.toggle('is-translation-hidden', shouldHideTranslation);
      if (isLyricsView && wasTranslationHidden !== shouldHideTranslation) {
        settleQueueLyricPositions(queue.querySelector('.music-lyrics-view'), { animate: false });
      }
    }

    function hasSelectedLyricTranslation() {
      return lyricsResultHasTranslation(getSelectedLyricsResult());
    }

    function lyricsResultHasTranslation(result) {
      return Boolean(result && Array.isArray(result.lines) && result.lines.some(function (line) {
        return line && String(line.translation || '').trim();
      }));
    }

    function getSelectedLyricsResult() {
      var key = getLyricsKey(items[selectedIndex]);
      return key ? lyricsCache.get(key) : null;
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
        updateTranslationToggle();
        prefetchAdjacentLyrics();
        return;
      }
      panel.innerHTML = renderQueueLyricsStatus('\u6b63\u5728\u52a0\u8f7d\u6b4c\u8bcd');
      lastLyricIndex = -1;
      updateTranslationToggle();
      prefetchAdjacentLyrics();
      fetchLyricsForItem(item).then(function (result) {
        if (!isLyricsView || getLyricsKey(items[selectedIndex]) !== key) return;
        lastLyricIndex = -1;
        renderQueueLyrics(panel, result, audio.currentTime || 0, getPlaybackDuration());
        updateTranslationToggle();
      });
    }

    function prefetchAdjacentLyrics() {
      if (!isLyricsView) return;
      prefetchLyricsAtIndex(selectedIndex - 1);
      prefetchLyricsAtIndex(selectedIndex + 1);
    }

    function prefetchLyricsAtIndex(index) {
      if (index < 0 || index >= items.length) return;
      var item = items[index];
      var key = getLyricsKey(item);
      if (!key || lyricsCache.has(key) || pendingLyricsRequests.has(key)) return;
      fetchLyricsForItem(item).then(function () {
        updateTranslationToggle();
      });
    }

    function preloadSelectedLyrics() {
      var item = items[selectedIndex];
      var key = getLyricsKey(item);
      if (!key || lyricsCache.has(key) || pendingLyricsRequests.has(key)) return;
      fetchLyricsForItem(item).then(function () {
        if (getLyricsKey(items[selectedIndex]) !== key) return;
        updateTranslationToggle();
      });
    }

    function fetchLyricsForItem(item) {
      var key = getLyricsKey(item);
      if (!key) return Promise.resolve({ lines: [], message: '\u6682\u65e0\u6b4c\u8bcd' });
      var cached = lyricsCache.get(key);
      if (cached) return Promise.resolve(cached);
      var pending = pendingLyricsRequests.get(key);
      if (pending) return pending;
      var endpoint = getLyricsEndpoint();
      if (!endpoint) {
        var unavailable = { lines: [], message: '\u6b4c\u8bcd\u63a5\u53e3\u672a\u8fde\u4e0a' };
        lyricsCache.set(key, unavailable);
        return Promise.resolve(unavailable);
      }
      pending = fetch(endpoint, {
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
        return result;
      }).catch(function (error) {
        var fallback = { lines: [], message: getLyricsErrorMessage(error) };
        lyricsCache.set(key, fallback);
        return fallback;
      }).finally(function () {
        pendingLyricsRequests.delete(key);
      });
      pendingLyricsRequests.set(key, pending);
      return pending;
    }

    function getLyricsErrorMessage(error) {
      var message = error && error.message ? String(error.message) : '';
      if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return '\u6b4c\u8bcd\u63a5\u53e3\u672a\u8fde\u4e0a';
      if (/No matching NetEase song/i.test(message)) return '\u6ca1\u627e\u5230\u7f51\u6613\u4e91\u6b4c\u66f2';
      if (/Lyrics unavailable/i.test(message)) return '\u6682\u65e0\u6b4c\u8bcd';
      return message || '\u6682\u65e0\u6b4c\u8bcd';
    }

    var lastLyricIndex = -1;
    var lyricLayoutFrameId = 0;
    var lyricLayoutRequestId = 0;
    var LYRIC_LINE_GUTTER = 34;
    var CURRENT_LYRIC_SCALE = 1.1;
    var LYRIC_SYNC_LEAD = 0.20;
    var LYRIC_INTERLUDE_REAL_GAP = 7;
    var LYRIC_INTERLUDE_INTRO_GAP = 4;
    var LYRIC_INTERLUDE_MIN_HOLD = 2.6;
    var LYRIC_INTERLUDE_MAX_HOLD = 5;
    var LYRIC_INTERLUDE_APPEAR_TIME = 0.4;
    var LYRIC_INTERLUDE_ENDING_TIME = 0.95;
    var LYRIC_INTERLUDE_PULSE_START = 0.42;

    function updateQueueLyrics(elapsed, duration) {
      if (!isLyricsView) return;
      var panel = queue.querySelector('.music-lyrics-view');
      var key = getLyricsKey(items[selectedIndex]);
      var result = key ? lyricsCache.get(key) : null;
      if (!panel || !result) return;
      var lines = getDisplayLyricLines(result.lines || []);
      if (!lines.length) return;
      var activeIndex = getActiveLyricIndex(lines, elapsed);
      if (activeIndex !== lastLyricIndex || !panel.querySelector('.queue-lyrics-lines:not(.queue-lyrics-status)')) {
        lastLyricIndex = activeIndex;
        renderQueueLyrics(panel, result, elapsed, duration);
      }
      updateInterludeProgress(panel, lines[activeIndex], elapsed);
    }

    function updateInterludeProgress(panel, activeLine, elapsed) {
      var element = panel && panel.querySelector('.queue-lyric-line.is-current.is-interlude');
      if (!element || !activeLine || activeLine.type !== 'interlude') return;
      var age = Math.max(0, elapsed - activeLine.time);
      var hasNextTime = Number.isFinite(activeLine.nextTime);
      var remaining = hasNextTime ? activeLine.nextTime - elapsed : Infinity;
      var interludeDuration = hasNextTime ? Math.max(0, activeLine.nextTime - activeLine.time) : 0;
      var startDuration = LYRIC_INTERLUDE_APPEAR_TIME + LYRIC_INTERLUDE_PULSE_START;
      var breathDuration = Math.max(0, interludeDuration - startDuration - LYRIC_INTERLUDE_ENDING_TIME);
      var breathAge = Math.max(0, age - startDuration);
      var dotWindow = breathDuration > 0 ? breathDuration / 3 : 0;
      var isEnding = remaining <= LYRIC_INTERLUDE_ENDING_TIME;
      element.classList.toggle('is-dot-ready', age >= LYRIC_INTERLUDE_APPEAR_TIME);
      setInterludeDotOpacity(element, 1, isEnding ? 1 : getInterludeBreathProgress(breathAge, dotWindow, 0));
      setInterludeDotOpacity(element, 2, isEnding ? 1 : getInterludeBreathProgress(breathAge, dotWindow, 1));
      setInterludeDotOpacity(element, 3, isEnding ? 1 : getInterludeBreathProgress(breathAge, dotWindow, 2));
      element.classList.toggle('is-interlude-ending', isEnding);
    }
    function setInterludeDotOpacity(element, dotNumber, progress) {
      var opacity = 0.18 + clamp01(progress) * 0.82;
      element.style.setProperty('--interlude-dot-' + dotNumber + '-opacity', opacity.toFixed(3));
    }

    function getInterludeBreathProgress(breathAge, dotWindow, dotIndex) {
      if (dotWindow <= 0) return 1;
      return smoothstep(clamp01((breathAge - dotWindow * dotIndex) / dotWindow));
    }

    function smoothstep(value) {
      return value * value * (3 - 2 * value);
    }

    function clamp01(value) {
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(1, value));
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
      var lines = getDisplayLyricLines(result.lines || []);
      if (!lines.length) {
        panel.innerHTML = renderQueueLyricsStatus(result.message || '\u6682\u65e0\u6b4c\u8bcd');
        return;
      }
      var activeIndex = getActiveLyricIndex(lines, elapsed);
      var previousLineStates = getCurrentLyricLineStates(panel);
      var lyricWindow = getLyricWindow(lines, activeIndex);
      var windowLines = lyricWindow.lines;
      var shouldUseGsap = Boolean(getGsap() && !prefersReducedMotion());
      panel.innerHTML = [
        '<div class="queue-lyrics-lines" style="--active-line:' + lyricWindow.activeViewIndex + '">',
        windowLines.map(function (line, index) {
          var distance = line.viewIndex - lyricWindow.activeViewIndex;
          var distanceAbs = Math.abs(distance);
          var previousState = previousLineStates.get(line.sourceIndex);
          var previousPhase = previousState && previousState.phase;
          var nextPhase = distance === 0 ? 'current' : distance < 0 ? 'before' : 'after';
          var initialPhase = nextPhase === 'current' && previousPhase && previousPhase !== 'current' ? previousPhase : nextPhase;
          var className = 'queue-lyric-line is-' + initialPhase + (shouldUseGsap ? ' is-gsap-animated' : '') + (line.type === 'interlude' ? ' is-interlude' : '') + (initialPhase !== nextPhase ? ' is-pending-current' : '');
          var primary = renderLyricPrimary(line);
          var previousY = previousState && previousState.y;
          var initialY = Number.isFinite(previousY) ? previousY : distance * 158;
          var targetScale = nextPhase === 'current' ? CURRENT_LYRIC_SCALE : (1 - Math.min(distanceAbs, 4) * 0.035);
          var targetOpacity = nextPhase === 'current' ? 1 : Math.max(0.22, 0.74 - distanceAbs * 0.13);
          var initialScale = previousState && Number.isFinite(previousState.scale) ? previousState.scale : (initialPhase === 'current' ? CURRENT_LYRIC_SCALE : targetScale);
          var initialOpacity = previousState && Number.isFinite(previousState.opacity) ? previousState.opacity : (initialPhase === 'current' ? 1 : targetOpacity);
          var lineStyle = [
            '--line-index:' + index,
            '--line-delay:' + ((8 - index) * 34) + 'ms',
            '--line-distance:' + distanceAbs,
            '--line-offset:' + distance,
            '--line-y:' + initialY + 'px',
            '--line-shift:0px',
            '--line-scale:' + initialScale.toFixed(3),
            '--line-opacity:' + initialOpacity.toFixed(2)
          ].join(';');
          return '<p class="' + className + '" data-source-index="' + line.sourceIndex + '" data-line-offset="' + distance + '" data-prev-y="' + initialY + '" data-prev-scale="' + initialScale.toFixed(3) + '" data-prev-opacity="' + initialOpacity.toFixed(2) + '" data-target-scale="' + targetScale.toFixed(3) + '" data-target-opacity="' + targetOpacity.toFixed(2) + '" style="' + lineStyle + '">' + primary + (line.translation ? '<span class="queue-lyric-translation">' + esc(line.translation) + '</span>' : '') + '</p>';
        }).join(''),
        '</div>'
      ].join('');
      panel.dataset.activeIndex = String(activeIndex);
      settleQueueLyricPositions(panel);
    }

    function getCurrentLyricLineStates(panel) {
      var states = new Map();
      if (!panel) return states;
      panel.querySelectorAll('.queue-lyric-line[data-source-index]').forEach(function (line) {
        var sourceIndex = Number(line.getAttribute('data-source-index'));
        var gsap = getGsap();
        var y = gsap && line.classList.contains('is-gsap-animated') ? Number(gsap.getProperty(line, 'y')) : parseFloat(line.style.getPropertyValue('--line-y'));
        var phase = line.classList.contains('is-current') ? 'current' : line.classList.contains('is-before') ? 'before' : 'after';
        var scale = gsap && line.classList.contains('is-gsap-animated') ? Number(gsap.getProperty(line, 'scale')) : parseFloat(line.style.getPropertyValue('--line-scale'));
        var opacity = gsap && line.classList.contains('is-gsap-animated') ? Number(gsap.getProperty(line, 'opacity')) : parseFloat(window.getComputedStyle(line).opacity);
        if (Number.isFinite(sourceIndex)) {
          states.set(sourceIndex, {
            y: Number.isFinite(y) ? y : 0,
            phase: phase,
            scale: Number.isFinite(scale) ? scale : 1,
            opacity: Number.isFinite(opacity) ? opacity : 1
          });
        }
      });
      return states;
    }

    function settleQueueLyricPositions(panel, options) {
      if (!panel || !window.requestAnimationFrame) return;
      var shouldAnimate = !options || options.animate !== false;
      lyricLayoutRequestId += 1;
      var requestId = lyricLayoutRequestId;
      if (lyricLayoutFrameId) window.cancelAnimationFrame(lyricLayoutFrameId);
      lyricLayoutFrameId = window.requestAnimationFrame(function () {
        if (requestId !== lyricLayoutRequestId) return;
        lyricLayoutFrameId = 0;
        var positionedLines = getMeasuredLyricLinePositions(panel);
        panel.offsetHeight;
        var gsap = getGsap();
        if (shouldAnimate && gsap && !prefersReducedMotion()) {
          animateQueueLyricPositions(gsap, positionedLines);
          return;
        }
        positionedLines.forEach(function (line) {
          if (gsap) gsap.killTweensOf(line.element);
          line.element.classList.remove('is-gsap-animated');
          line.element.style.setProperty('--line-y', line.y + 'px');
          line.element.style.opacity = '';
          line.element.style.transform = '';
          promotePendingCurrentLyric(line.element);
        });
      });
    }

    function animateQueueLyricPositions(gsap, positionedLines) {
      positionedLines.forEach(function (line) {
        var element = line.element;
        var state = getLyricAnimationState(element, line.y);
        var cascadeDelay = getLyricCascadeDelay(element);
        element.classList.add('is-gsap-animated');
        element.style.setProperty('--line-y', line.y + 'px');
        promotePendingCurrentLyric(element);
        gsap.killTweensOf(element);
        gsap.set(element, {
          y: state.fromY,
          scale: state.fromScale,
          opacity: state.fromOpacity,
          force3D: true
        });
        gsap.to(element, {
          y: line.y,
          scale: state.toScale,
          duration: state.isCurrent ? 0.50 : cascadeDelay ? 0.68 : 0.54,
          delay: cascadeDelay,
          ease: state.isCurrent ? 'power2.out' : cascadeDelay ? 'power3.out' : 'power4.out',
          overwrite: true,
          force3D: true
        });
        gsap.to(element, {
          opacity: state.toOpacity,
          duration: state.isCurrent ? 0.30 : 0.34,
          delay: cascadeDelay * 0.55,
          ease: state.isCurrent ? 'sine.out' : 'sine.out',
          overwrite: 'auto'
        });
      });
    }

    function getLyricCascadeDelay(element) {
      var offset = Number(element.getAttribute('data-line-offset'));
      if (!Number.isFinite(offset) || offset <= 0) return 0;
      return Math.min(offset, 5) * 0.045;
    }

    function getLyricAnimationState(element, targetY) {
      var isCurrent = element.classList.contains('is-current') || element.classList.contains('is-pending-current');
      var targetScale = isCurrent ? CURRENT_LYRIC_SCALE : getLyricTargetScale(element);
      var fromScale = readNumber(element.dataset.prevScale, isCurrent ? 1.04 : targetScale);
      if (isCurrent && fromScale > targetScale) fromScale = targetScale;
      return {
        isCurrent: isCurrent,
        fromY: readNumber(element.dataset.prevY, targetY),
        fromScale: fromScale,
        fromOpacity: readNumber(element.dataset.prevOpacity, isCurrent ? 0.62 : getLyricTargetOpacity(element)),
        toScale: targetScale,
        toOpacity: isCurrent ? 1 : getLyricTargetOpacity(element)
      };
    }

    function promotePendingCurrentLyric(element) {
      if (!element.classList.contains('is-pending-current')) return;
      element.classList.remove('is-before', 'is-after', 'is-pending-current');
      element.classList.add('is-current');
    }

    function getLyricTargetScale(element) {
      return readNumber(element.dataset.targetScale, readNumber(element.style.getPropertyValue('--line-scale'), 1));
    }

    function getLyricTargetOpacity(element) {
      return readNumber(element.dataset.targetOpacity, readNumber(element.style.getPropertyValue('--line-opacity'), 0.38));
    }

    function getGsap() {
      return window.gsap && typeof window.gsap.fromTo === 'function' ? window.gsap : null;
    }

    function prefersReducedMotion() {
      return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function readNumber(value, fallback) {
      var number = parseFloat(value);
      return Number.isFinite(number) ? number : fallback;
    }

    function getMeasuredLyricLinePositions(panel) {
      var lyricLines = Array.from(panel.querySelectorAll('.queue-lyric-line[data-line-offset]'));
      var currentIndex = lyricLines.findIndex(function (line) { return line.classList.contains('is-current') || line.classList.contains('is-pending-current'); });
      if (currentIndex < 0) return [];
      var positioned = lyricLines.map(function (line) { return { element: line, y: 0, height: getLyricLineHeight(line) }; });
      for (var after = currentIndex + 1; after < positioned.length; after += 1) {
        var previous = positioned[after - 1];
        positioned[after].y = previous.y + previous.height + LYRIC_LINE_GUTTER;
      }
      for (var before = currentIndex - 1; before >= 0; before -= 1) {
        var next = positioned[before + 1];
        positioned[before].y = next.y - LYRIC_LINE_GUTTER - positioned[before].height;
      }
      return positioned;
    }

    function getLyricLineHeight(line) {
      var height = Math.max(1, line.offsetHeight || line.getBoundingClientRect().height || 1);
      return line.classList.contains('is-current') || line.classList.contains('is-pending-current') ? height * CURRENT_LYRIC_SCALE : height;
    }

    function renderLyricPrimary(line) {
      if (line && line.type === 'interlude') {
        return '<span class="queue-lyric-primary queue-lyric-interlude" aria-hidden="true"><span></span><span></span><span></span></span>';
      }
      return '<span class="queue-lyric-primary">' + esc(line && line.text) + '</span>';
    }

    function getDisplayLyricLines(lines) {
      var displayLines = [];
      var lyricLines = lines.filter(function (line) { return line && line.text; });
      var firstLine = lyricLines[0];
      if (firstLine && Number.isFinite(firstLine.time) && firstLine.time >= LYRIC_INTERLUDE_INTRO_GAP) {
        displayLines.push({
          type: 'interlude',
          text: '',
          time: 0,
          nextTime: firstLine.time
        });
      }
      lyricLines.forEach(function (line, index) {
        displayLines.push(line);
        var nextLine = lyricLines[index + 1];
        if (!nextLine || !Number.isFinite(nextLine.time) || !Number.isFinite(line.time)) return;
        var interludeTime = getLyricInterludeStartTime(line, nextLine);
        if (!Number.isFinite(interludeTime)) return;
        displayLines.push({
          type: 'interlude',
          text: '',
          time: interludeTime,
          nextTime: nextLine.time
        });
      });
      return displayLines;
    }

    function getLyricInterludeStartTime(line, nextLine) {
      var textLength = String(line.text || '').replace(/\s+/g, '').length;
      var hold = Math.min(LYRIC_INTERLUDE_MAX_HOLD, LYRIC_INTERLUDE_MIN_HOLD + textLength * 0.08);
      var startTime = line.time + hold;
      if (nextLine.time - startTime < LYRIC_INTERLUDE_REAL_GAP) return NaN;
      return startTime;
    }

    function renderQueueLyricsStatus(message) {
      return '<div class="queue-lyrics-lines queue-lyrics-status"><p class="queue-lyric-line is-current"><span class="queue-lyric-primary">' + esc(message) + '</span></p></div>';
    }

    function getActiveLyricIndex(lines, elapsed) {
      var index = 0;
      for (var i = 0; i < lines.length; i += 1) {
        if (lines[i].time > elapsed + LYRIC_SYNC_LEAD) break;
        index = i;
      }
      return index;
    }

    function getLyricWindow(lines, activeIndex) {
      var visibleLines = lines.map(function (line, index) {
        return Object.assign({ sourceIndex: index }, line);
      }).filter(function (line) {
        return line.type !== 'interlude' || line.sourceIndex === activeIndex;
      });
      var activeViewIndex = visibleLines.findIndex(function (line) { return line.sourceIndex === activeIndex; });
      if (activeViewIndex < 0) activeViewIndex = 0;
      var start = Math.max(0, activeViewIndex - 4);
      var end = Math.min(visibleLines.length, start + 9);
      start = Math.max(0, end - 9);
      return {
        activeViewIndex: activeViewIndex - start,
        lines: visibleLines.slice(start, end).map(function (line, offset) {
          return Object.assign({ viewIndex: offset }, line);
        })
      };
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

  function iconTranslationButton(isVisible, isPressed) {
    return '<button class="music-translation-toggle' + (isVisible ? ' is-visible' : '') + '" type="button" data-music-action="translation" aria-label="Toggle translation" aria-pressed="' + (isPressed ? 'true' : 'false') + '" aria-hidden="' + (isVisible ? 'false' : 'true') + '" tabindex="' + (isVisible ? '0' : '-1') + '">' + iconTranslation() + '</button>';
  }

  function iconTranslation() {
    return '<svg class="track-translation-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5.6h8.2M9.1 3.5v2.1m2.9 0c-.5 2.9-2.2 5.1-5.6 6.8m1.8-4.8c.7 1.8 2 3.3 3.9 4.5M14.8 18.7l3.5-8.4 3.5 8.4m-5.6-2.2h4.2" /></svg>';
  }

  function iconLyrics() {
    return '<svg class="track-lyrics-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="lyrics-bubble" d="M5.7 4.8h12.6c1.15 0 2.1.95 2.1 2.1v7.5c0 1.15-.95 2.1-2.1 2.1h-6.8l-4.2 3.25c-.38.3-.94.02-.94-.46V16.5H5.7c-1.15 0-2.1-.95-2.1-2.1V6.9c0-1.15.95-2.1 2.1-2.1z" /><path class="lyrics-quote" d="M8.25 8.55h2.45c.33 0 .6.27.6.6v2.05c0 .33-.27.6-.6.6H8.25c-.33 0-.6-.27-.6-.6V9.15c0-.33.27-.6.6-.6zm5 0h2.45c.33 0 .6.27.6.6v2.05c0 .33-.27.6-.6.6h-2.45c-.33 0-.6-.27-.6-.6V9.15c0-.33.27-.6.6-.6z" /></svg>';
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
