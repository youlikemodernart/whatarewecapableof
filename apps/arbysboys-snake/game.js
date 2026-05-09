(() => {
  'use strict';

  const GRID_COLS = 11;
  const GRID_ROWS = 11;
  const MAX_INPUT_QUEUE = 2;
  const SWIPE_THRESHOLD = 24;
  const STORAGE_PREFIX = 'abs-v2';

  const Scene = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game-over'
  };

  const Direction = {
    up: { x: 0, y: -1, angle: -Math.PI / 2 },
    down: { x: 0, y: 1, angle: Math.PI / 2 },
    left: { x: -1, y: 0, angle: Math.PI },
    right: { x: 1, y: 0, angle: 0 }
  };

  const assetManifest = {
    head: 'assets/snake-head.png',
    food: 'assets/beef-n-cheddar.png',
    growth: 'assets/curly-snake-growth.png'
  };

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const overlay = document.getElementById('overlay');
  const overlayKicker = document.getElementById('overlay-kicker');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayCopy = document.getElementById('overlay-copy');
  const primaryAction = document.getElementById('primary-action');
  const pauseButton = document.getElementById('pause-button');
  const soundButton = document.getElementById('sound-button');
  const motionButton = document.getElementById('motion-button');
  const speedButton = document.getElementById('speed-button');

  const storage = safeStorage();
  const systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const assets = {};

  let assetsLoaded = false;
  let scene = Scene.MENU;
  let snake = [];
  let direction = 'right';
  let visualDirection = 'right';
  let inputQueue = [];
  let food = { x: 7, y: 6 };
  let score = 0;
  let highScore = readNumber(`${STORAGE_PREFIX}-high-score`, 0);
  let soundEnabled = readBoolean('abs-sound', true);
  let reducedMotion = readBoolean('abs-reduced-motion', systemReducedMotion);
  let speedMode = storage?.getItem('abs-speed-mode') || 'normal';
  let tickInterval = calculateTickInterval(0);
  let lastTimestamp = 0;
  let accumulator = 0;
  let layout = { width: 360, height: 360, cell: 40, offsetX: 0, offsetY: 0, pixelRatio: 1 };
  let audioCtx = null;
  let pointerStart = null;
  let eatEffects = [];
  let directionPulse = 0;
  let deathMarker = null;
  let shakeTime = 0;

  highScoreEl.textContent = String(highScore);
  scoreEl.textContent = '0';
  syncButtons();
  resizeCanvas();
  resetGame();
  setScene(Scene.MENU);
  preloadAssets();
  requestAnimationFrame(loop);

  window.addEventListener('resize', resizeCanvas);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && scene === Scene.PLAYING) {
      setScene(Scene.PAUSED, 'Interrupted');
    }
  });

  primaryAction.addEventListener('click', () => {
    unlockAudio();
    if (scene === Scene.PAUSED) {
      setScene(Scene.PLAYING);
    } else {
      startRun();
    }
  });

  pauseButton.addEventListener('click', () => {
    unlockAudio();
    if (scene === Scene.PLAYING) {
      setScene(Scene.PAUSED);
    } else if (scene === Scene.PAUSED) {
      setScene(Scene.PLAYING);
    }
  });

  soundButton.addEventListener('click', () => {
    unlockAudio();
    soundEnabled = !soundEnabled;
    writeBoolean('abs-sound', soundEnabled);
    syncButtons();
    if (soundEnabled) playTone('click');
  });

  motionButton.addEventListener('click', () => {
    reducedMotion = !reducedMotion;
    writeBoolean('abs-reduced-motion', reducedMotion);
    syncButtons();
  });

  speedButton.addEventListener('click', () => {
    speedMode = speedMode === 'normal' ? 'relaxed' : 'normal';
    storage?.setItem('abs-speed-mode', speedMode);
    tickInterval = calculateTickInterval(score);
    syncButtons();
  });

  document.addEventListener('keydown', (event) => {
    const key = event.key;
    const dir = keyToDirection(key);

    if (dir) {
      event.preventDefault();
      unlockAudio();
      if (scene === Scene.PLAYING) queueDirection(dir);
      return;
    }

    if (key === ' ' || key === 'Enter') {
      event.preventDefault();
      unlockAudio();
      if (scene === Scene.PAUSED) setScene(Scene.PLAYING);
      else if (scene === Scene.MENU || scene === Scene.GAME_OVER) startRun();
      return;
    }

    if (key === 'Escape') {
      event.preventDefault();
      if (scene === Scene.PLAYING) setScene(Scene.PAUSED);
      else if (scene === Scene.PAUSED) setScene(Scene.PLAYING);
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    canvas.setPointerCapture?.(event.pointerId);
    pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!event.isPrimary) return;
    unlockAudio();

    if (!pointerStart || pointerStart.id !== event.pointerId) return;

    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    const distance = Math.hypot(dx, dy);
    pointerStart = null;

    if (scene !== Scene.PLAYING) {
      if (distance < SWIPE_THRESHOLD) startRun();
      return;
    }

    if (distance < SWIPE_THRESHOLD) return;

    const next = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');

    queueDirection(next);
  });

  canvas.addEventListener('pointercancel', () => {
    pointerStart = null;
  });

  async function preloadAssets() {
    const entries = Object.entries(assetManifest);
    await Promise.all(entries.map(async ([name, src]) => {
      try {
        assets[name] = await loadImage(src);
      } catch {
        assets[name] = null;
      }
    }));
    assetsLoaded = true;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function loop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    let delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    delta = Math.min(delta, 250);

    if (scene === Scene.PLAYING) {
      accumulator += delta;
      while (accumulator >= tickInterval) {
        updateTick();
        accumulator -= tickInterval;
      }
    } else {
      accumulator = 0;
    }

    render(delta);
    requestAnimationFrame(loop);
  }

  function startRun() {
    resetGame();
    setScene(Scene.PLAYING);
    playTone('start');
    canvas.focus({ preventScroll: true });
  }

  function resetGame() {
    const cy = Math.min(GRID_ROWS - 3, Math.max(4, Math.floor(GRID_ROWS * 0.72)));
    const cx = 4;
    snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
      { x: cx - 3, y: cy }
    ];
    direction = 'right';
    visualDirection = 'right';
    inputQueue = [];
    score = 0;
    tickInterval = calculateTickInterval(score);
    eatEffects = [];
    directionPulse = 0;
    deathMarker = null;
    shakeTime = 0;
    spawnFood({ prefer: { x: GRID_COLS - 3, y: Math.max(1, cy - 2) } });
    syncScore();
  }

  function updateTick() {
    applyQueuedDirection();

    const vector = Direction[direction];
    const head = snake[0];
    const nextHead = { x: head.x + vector.x, y: head.y + vector.y };
    const willEat = sameCell(nextHead, food);

    const wallCollision = nextHead.x < 0 || nextHead.x >= GRID_COLS || nextHead.y < 0 || nextHead.y >= GRID_ROWS;
    const collisionBody = willEat ? snake : snake.slice(0, -1);
    const bodyCollision = collisionBody.some((cell) => sameCell(cell, nextHead));

    if (wallCollision || bodyCollision) {
      deathMarker = clampToBoard(nextHead);
      endRun();
      return;
    }

    snake.unshift(nextHead);

    if (willEat) {
      score += 1;
      tickInterval = calculateTickInterval(score);
      eatEffects.push({ x: food.x, y: food.y, age: 0 });
      spawnFood();
      syncScore();
      playTone('eat');
      if (!reducedMotion && navigator.vibrate) navigator.vibrate(28);
    } else {
      snake.pop();
    }
  }

  function endRun() {
    if (score > highScore) {
      highScore = score;
      writeNumber(`${STORAGE_PREFIX}-high-score`, highScore);
    }
    syncScore();
    shakeTime = reducedMotion ? 0 : 220;
    playTone('death');
    setScene(Scene.GAME_OVER);
  }

  function applyQueuedDirection() {
    while (inputQueue.length) {
      const next = inputQueue.shift();
      if (!isOpposite(next, direction)) {
        direction = next;
        visualDirection = next;
        return;
      }
    }
  }

  function queueDirection(next) {
    const base = inputQueue.length ? inputQueue[inputQueue.length - 1] : direction;
    if (isOpposite(next, base)) return;
    if (inputQueue.length >= MAX_INPUT_QUEUE) return;
    inputQueue.push(next);
    visualDirection = next;
    directionPulse = reducedMotion ? 0 : 120;
    playTone('turn');
  }

  function spawnFood(options = {}) {
    const occupied = new Set(snake.map(cellKey));
    if (options.prefer && !occupied.has(cellKey(options.prefer))) {
      food = { ...options.prefer };
      return;
    }

    const empty = [];
    for (let y = 0; y < GRID_ROWS; y += 1) {
      for (let x = 0; x < GRID_COLS; x += 1) {
        const key = `${x},${y}`;
        if (!occupied.has(key)) empty.push({ x, y });
      }
    }

    if (!empty.length) {
      setScene(Scene.GAME_OVER);
      return;
    }

    food = empty[Math.floor(Math.random() * empty.length)];
  }

  function calculateTickInterval(points) {
    if (speedMode === 'relaxed') {
      return Math.max(125, 280 - Math.floor(points * 4));
    }
    return Math.max(100, 230 - Math.floor(points * 5));
  }

  function setScene(nextScene, reason = '') {
    scene = nextScene;
    pauseButton.textContent = scene === Scene.PAUSED ? 'Resume' : 'Pause';

    if (scene === Scene.MENU) {
      showOverlay('V2 prototype', 'Eat the Beef \'N Cheddars.', 'Swipe to steer the curly fry. Every sandwich makes it longer. Walls and your own tail end the run.', 'Tap to Play', 'hero');
    } else if (scene === Scene.PAUSED) {
      showOverlay(reason || 'Paused', 'Hold the curly fry.', 'Tap resume when you are ready to keep chasing sandwiches.', 'Resume', 'compact');
    } else if (scene === Scene.GAME_OVER) {
      const best = score >= highScore && score > 0 ? 'New best fry.' : `Best fry: ${highScore}.`;
      showOverlay('Drive-through closed', 'The curly fry crashed.', `Beef \'N Cheddars eaten: ${score}. ${best}`, 'Run It Back', 'compact');
    } else {
      hideOverlay();
    }
  }

  function showOverlay(kicker, title, copy, action, mode = 'compact') {
    overlay.dataset.mode = mode;
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    primaryAction.textContent = action;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const size = Math.max(260, Math.floor(Math.min(rect.width, rect.height || rect.width)));

    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const cell = size / GRID_COLS;
    layout = {
      width: size,
      height: size,
      cell,
      offsetX: 0,
      offsetY: 0,
      boardWidth: size,
      boardHeight: size,
      pixelRatio: dpr
    };
  }

  function render(delta) {
    ctx.setTransform(layout.pixelRatio, 0, 0, layout.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);

    let shakeX = 0;
    let shakeY = 0;
    if (shakeTime > 0 && !reducedMotion) {
      shakeTime = Math.max(0, shakeTime - delta);
      const amount = (shakeTime / 220) * 5;
      shakeX = (Math.random() * 2 - 1) * amount;
      shakeY = (Math.random() * 2 - 1) * amount;
    }

    if (directionPulse > 0) {
      directionPulse = Math.max(0, directionPulse - delta);
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBoard();
    drawFood();
    drawSnake();
    drawEffects(delta);
    if (deathMarker) drawDeathMarker();
    if (!assetsLoaded) drawLoadingMark();
    ctx.restore();
  }

  function drawBoard() {
    const { cell } = layout;
    ctx.fillStyle = '#fff7ef';
    ctx.fillRect(0, 0, layout.width, layout.height);

    for (let y = 0; y < GRID_ROWS; y += 1) {
      for (let x = 0; x < GRID_COLS; x += 1) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#ead4c5' : '#f7ede4';
        ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
        if ((x + y) % 2 === 0) drawBoysWatermark(x, y);
      }
    }

    ctx.strokeStyle = '#d40000';
    ctx.lineWidth = Math.max(4, cell * 0.08);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, layout.width - ctx.lineWidth, layout.height - ctx.lineWidth);
  }

  function drawBoysWatermark(col, row) {
    const { cell } = layout;
    ctx.save();
    ctx.translate(col * cell + cell * 0.5, row * cell + cell * 0.54);
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#bf785c';
    ctx.font = `900 ${cell * 0.22}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Boys', 0, cell * 0.04);
    ctx.strokeStyle = '#bf785c';
    ctx.lineWidth = Math.max(1, cell * 0.025);
    ctx.beginPath();
    ctx.arc(-cell * 0.06, -cell * 0.15, cell * 0.12, Math.PI * 1.05, Math.PI * 1.95);
    ctx.arc(cell * 0.08, -cell * 0.15, cell * 0.11, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, cell * 0.16, cell * 0.18, 0.1, Math.PI * 0.95);
    ctx.stroke();
    ctx.restore();
  }

  function drawFood() {
    const rect = cellRect(food);
    const s = layout.cell;
    const size = s * 1.26;
    const x = rect.x + s * 0.5;
    const y = rect.y + s * 0.52;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#7a260f';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.32, s * 0.36, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (assets.food) {
      drawImageCentered(assets.food, x, y, size, size);
    } else {
      drawFallbackSandwich(x, y, s);
    }
    ctx.restore();
  }

  function drawSnake() {
    for (let i = snake.length - 1; i >= 0; i -= 1) {
      const part = snake[i];
      if (i === 0) continue;
      drawFryBody(part, i);
    }
    drawHead();
  }

  function drawFryBody(cellPos, index) {
    const rect = cellRect(cellPos);
    const s = layout.cell;
    const cx = rect.x + s * 0.5;
    const cy = rect.y + s * 0.5;
    const radius = s * 0.36;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((index % 4) * 0.12);

    ctx.lineWidth = Math.max(3, s * 0.1);
    ctx.strokeStyle = '#060100';
    ctx.fillStyle = '#ff9400';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const gradient = ctx.createRadialGradient(-radius * 0.45, -radius * 0.52, radius * 0.1, 0, 0, radius);
    gradient.addColorStop(0, '#ffc04a');
    gradient.addColorStop(0.55, '#ff9400');
    gradient.addColorStop(1, '#e86d00');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.88, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 196, 46, 0.8)';
    ctx.lineWidth = Math.max(2, s * 0.04);
    ctx.beginPath();
    ctx.arc(-radius * 0.12, -radius * 0.06, radius * 0.66, Math.PI * 1.08, Math.PI * 1.72);
    ctx.stroke();

    ctx.restore();
  }

  function drawHead() {
    const head = snake[0];
    const rect = cellRect(head);
    const s = layout.cell;
    const cx = rect.x + s * 0.5;
    const cy = rect.y + s * 0.5;
    const pulse = directionPulse > 0 ? 1 + (directionPulse / 120) * 0.08 : 1;
    const size = s * 1.45 * pulse;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Direction[visualDirection].angle);
    if (assets.head) {
      ctx.drawImage(assets.head, -size * 0.5, -size * 0.5, size, size);
    } else {
      drawFallbackHead(s * pulse);
    }
    ctx.restore();
  }

  function drawFallbackHead(size) {
    const r = size * 0.38;
    ctx.fillStyle = '#ff9400';
    ctx.strokeStyle = '#050100';
    ctx.lineWidth = Math.max(3, size * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawEye(size * 0.1, -size * 0.12, size);
    drawEye(size * 0.26, size * 0.03, size);
    ctx.fillStyle = '#050100';
    ctx.beginPath();
    ctx.arc(size * 0.1, size * 0.13, size * 0.13, 0, Math.PI);
    ctx.fill();
  }

  function drawEye(x, y, s) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + s * 0.03, y, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFallbackSandwich(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#5a1b0f';
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.fillStyle = '#d28734';
    roundedRect(ctx, -s * 0.34, -s * 0.24, s * 0.68, s * 0.28, s * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f6c21a';
    roundedRect(ctx, -s * 0.33, -s * 0.02, s * 0.66, s * 0.1, s * 0.04);
    ctx.fill();
    ctx.fillStyle = '#9d4430';
    roundedRect(ctx, -s * 0.32, s * 0.08, s * 0.64, s * 0.16, s * 0.07);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects(delta) {
    eatEffects = eatEffects.filter((effect) => effect.age < 240);
    for (const effect of eatEffects) {
      effect.age += delta;
      const t = effect.age / 240;
      const rect = cellRect(effect);
      const s = layout.cell;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#d40000';
      ctx.lineWidth = Math.max(3, s * 0.08);
      ctx.beginPath();
      ctx.arc(rect.x + s * 0.5, rect.y + s * 0.5, s * (0.25 + t * 0.65), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawDeathMarker() {
    const rect = cellRect(deathMarker);
    const s = layout.cell;
    ctx.save();
    ctx.strokeStyle = '#d40000';
    ctx.lineWidth = Math.max(4, s * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rect.x + s * 0.25, rect.y + s * 0.25);
    ctx.lineTo(rect.x + s * 0.75, rect.y + s * 0.75);
    ctx.moveTo(rect.x + s * 0.75, rect.y + s * 0.25);
    ctx.lineTo(rect.x + s * 0.25, rect.y + s * 0.75);
    ctx.stroke();
    ctx.restore();
  }

  function drawLoadingMark() {
    ctx.save();
    ctx.fillStyle = 'rgba(212, 0, 0, 0.86)';
    roundedRect(ctx, layout.width * 0.28, layout.height * 0.44, layout.width * 0.44, layout.height * 0.12, 18);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${layout.cell * 0.28}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading fry', layout.width * 0.5, layout.height * 0.5);
    ctx.restore();
  }

  function drawImageCentered(img, x, y, width, height) {
    ctx.drawImage(img, x - width / 2, y - height / 2, width, height);
  }

  function cellRect(cell) {
    return {
      x: layout.offsetX + cell.x * layout.cell,
      y: layout.offsetY + cell.y * layout.cell
    };
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function keyToDirection(key) {
    switch (key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        return 'up';
      case 'ArrowDown':
      case 's':
      case 'S':
        return 'down';
      case 'ArrowLeft':
      case 'a':
      case 'A':
        return 'left';
      case 'ArrowRight':
      case 'd':
      case 'D':
        return 'right';
      default:
        return null;
    }
  }

  function isOpposite(a, b) {
    return (a === 'up' && b === 'down')
      || (a === 'down' && b === 'up')
      || (a === 'left' && b === 'right')
      || (a === 'right' && b === 'left');
  }

  function sameCell(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function cellKey(cell) {
    return `${cell.x},${cell.y}`;
  }

  function clampToBoard(cell) {
    return {
      x: Math.min(GRID_COLS - 1, Math.max(0, cell.x)),
      y: Math.min(GRID_ROWS - 1, Math.max(0, cell.y))
    };
  }

  function syncScore() {
    scoreEl.textContent = String(score);
    highScoreEl.textContent = String(highScore);
  }

  function syncButtons() {
    soundButton.textContent = soundEnabled ? 'Sound On' : 'Sound Off';
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    motionButton.textContent = reducedMotion ? 'Reduced Motion' : 'Motion On';
    motionButton.setAttribute('aria-pressed', String(!reducedMotion));
    speedButton.textContent = speedMode === 'normal' ? 'Normal' : 'Relaxed';
    speedButton.setAttribute('aria-pressed', String(speedMode === 'relaxed'));
  }

  function unlockAudio() {
    if (!soundEnabled) return;
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  function playTone(kind) {
    if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;

    const settings = {
      start: [220, 0.08, 'triangle', 0.025],
      turn: [330, 0.035, 'square', 0.012],
      eat: [640, 0.09, 'sine', 0.035],
      death: [88, 0.18, 'sawtooth', 0.04],
      click: [420, 0.05, 'triangle', 0.02]
    }[kind];

    if (!settings) return;

    const [frequency, duration, type, volume] = settings;
    const now = audioCtx.currentTime;
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (kind === 'eat') oscillator.frequency.exponentialRampToValueAtTime(860, now + duration);
    if (kind === 'death') oscillator.frequency.exponentialRampToValueAtTime(44, now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function safeStorage() {
    try {
      const key = '__abs_test__';
      window.localStorage.setItem(key, key);
      window.localStorage.removeItem(key);
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function readNumber(key, fallback) {
    const value = storage?.getItem(key);
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function writeNumber(key, value) {
    try {
      storage?.setItem(key, String(value));
    } catch {}
  }

  function readBoolean(key, fallback) {
    const value = storage?.getItem(key);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }

  function writeBoolean(key, value) {
    try {
      storage?.setItem(key, String(value));
    } catch {}
  }
})();
