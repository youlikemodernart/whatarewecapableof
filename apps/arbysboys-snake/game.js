(() => {
  'use strict';

  const GRID_COLS = 17;
  const GRID_ROWS = 19;
  const MAX_INPUT_QUEUE = 2;
  const SWIPE_THRESHOLD = 24;

  const Scene = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game-over'
  };

  const Direction = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
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

  let scene = Scene.MENU;
  let snake = [];
  let direction = 'right';
  let visualDirection = 'right';
  let inputQueue = [];
  let food = { x: 12, y: 9 };
  let score = 0;
  let highScore = readNumber('abs-high-score', 0);
  let soundEnabled = readBoolean('abs-sound', true);
  let reducedMotion = readBoolean('abs-reduced-motion', systemReducedMotion);
  let speedMode = storage?.getItem('abs-speed-mode') || 'normal';
  let tickInterval = calculateTickInterval(0);
  let lastTimestamp = 0;
  let accumulator = 0;
  let layout = { width: 340, height: 380, cell: 20, offsetX: 0, offsetY: 0, pixelRatio: 1 };
  let audioCtx = null;
  let pointerStart = null;
  let eatEffects = [];
  let deathMarker = null;
  let shakeTime = 0;

  highScoreEl.textContent = String(highScore);
  scoreEl.textContent = '0';
  syncButtons();
  resizeCanvas();
  resetGame();
  setScene(Scene.MENU);
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
    canvas.setPointerCapture?.(event.pointerId);
    pointerStart = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
  });

  canvas.addEventListener('pointerup', (event) => {
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
    const cy = Math.floor(GRID_ROWS / 2);
    const cx = Math.floor(GRID_COLS / 2);
    snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy }
    ];
    direction = 'right';
    visualDirection = 'right';
    inputQueue = [];
    score = 0;
    tickInterval = calculateTickInterval(score);
    eatEffects = [];
    deathMarker = null;
    shakeTime = 0;
    spawnFood();
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
    } else {
      snake.pop();
    }
  }

  function endRun() {
    if (score > highScore) {
      highScore = score;
      writeNumber('abs-high-score', highScore);
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
    playTone('turn');
  }

  function spawnFood() {
    const occupied = new Set(snake.map(cellKey));
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
      return Math.max(105, 190 - Math.floor(points * 2));
    }
    return Math.max(75, 150 - Math.floor(points * 2.5));
  }

  function setScene(nextScene, reason = '') {
    scene = nextScene;
    pauseButton.textContent = scene === Scene.PAUSED ? 'Resume' : 'Pause';

    if (scene === Scene.MENU) {
      showOverlay('Tap to begin', 'Secure the sauces.', 'Swipe to turn. Eat the sauce packets. Do not run into your own curly ambition.', 'Tap to Play');
    } else if (scene === Scene.PAUSED) {
      showOverlay(reason || 'Paused', 'Hold the sauce.', 'Tap resume when you are ready to keep the line moving.', 'Resume');
    } else if (scene === Scene.GAME_OVER) {
      const best = score >= highScore && score > 0 ? 'New best run.' : `Best run: ${highScore}.`;
      showOverlay('Drive-through closed', 'The line collapsed.', `Sauces secured: ${score}. ${best}`, 'Run It Back');
    } else {
      hideOverlay();
    }
  }

  function showOverlay(kicker, title, copy, action) {
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
    const cssWidth = Math.max(260, Math.floor(rect.width));
    const cssHeight = Math.max(290, Math.floor(rect.height));

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cell = Math.min(cssWidth / GRID_COLS, cssHeight / GRID_ROWS);
    const boardWidth = cell * GRID_COLS;
    const boardHeight = cell * GRID_ROWS;

    layout = {
      width: cssWidth,
      height: cssHeight,
      cell,
      offsetX: (cssWidth - boardWidth) / 2,
      offsetY: (cssHeight - boardHeight) / 2,
      boardWidth,
      boardHeight,
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
      const amount = (shakeTime / 220) * 6;
      shakeX = (Math.random() * 2 - 1) * amount;
      shakeY = (Math.random() * 2 - 1) * amount;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBoard();
    drawFood();
    drawSnake();
    drawEffects(delta);
    if (deathMarker) drawDeathMarker();
    ctx.restore();
  }

  function drawBoard() {
    const { cell, offsetX, offsetY } = layout;
    ctx.fillStyle = '#fff1d4';
    roundedRect(ctx, offsetX, offsetY, layout.boardWidth, layout.boardHeight, 18);
    ctx.fill();

    for (let y = 0; y < GRID_ROWS; y += 1) {
      for (let x = 0; x < GRID_COLS; x += 1) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#f8dfae' : '#f0cd93';
        ctx.fillRect(offsetX + x * cell, offsetY + y * cell, cell + 0.5, cell + 0.5);
      }
    }

    ctx.strokeStyle = '#2d120d';
    ctx.lineWidth = 4;
    roundedRect(ctx, offsetX + 2, offsetY + 2, layout.boardWidth - 4, layout.boardHeight - 4, 18);
    ctx.stroke();
  }

  function drawFood() {
    const { x, y } = cellRect(food);
    const s = layout.cell;
    ctx.save();
    ctx.translate(x + s * 0.5, y + s * 0.5);
    ctx.rotate(-0.12);
    ctx.fillStyle = '#f8f0e2';
    roundedRect(ctx, -s * 0.34, -s * 0.24, s * 0.68, s * 0.48, s * 0.12);
    ctx.fill();
    ctx.fillStyle = '#b32822';
    roundedRect(ctx, -s * 0.24, -s * 0.15, s * 0.48, s * 0.3, s * 0.08);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake() {
    const { cell } = layout;
    for (let i = snake.length - 1; i >= 0; i -= 1) {
      const part = snake[i];
      const rect = cellRect(part);
      const pad = i === 0 ? cell * 0.12 : cell * 0.18;
      ctx.fillStyle = i === 0 ? '#b32822' : '#f2a93b';
      roundedRect(ctx, rect.x + pad, rect.y + pad, cell - pad * 2, cell - pad * 2, cell * 0.22);
      ctx.fill();

      if (i > 0) {
        ctx.fillStyle = '#be701f';
        ctx.globalAlpha = 0.4;
        ctx.fillRect(rect.x + cell * 0.25, rect.y + cell * 0.48, cell * 0.5, cell * 0.1);
        ctx.globalAlpha = 1;
      }
    }

    drawHeadDetails();
  }

  function drawHeadDetails() {
    const head = snake[0];
    const rect = cellRect(head);
    const s = layout.cell;
    const centerX = rect.x + s * 0.5;
    const centerY = rect.y + s * 0.5;
    const look = Direction[visualDirection];
    const eyeOffsetX = look.y !== 0 ? s * 0.16 : 0;
    const eyeOffsetY = look.x !== 0 ? s * 0.16 : 0;
    const forwardX = look.x * s * 0.16;
    const forwardY = look.y * s * 0.16;

    drawEye(centerX - eyeOffsetX + forwardX, centerY - eyeOffsetY + forwardY, s);
    drawEye(centerX + eyeOffsetX + forwardX, centerY + eyeOffsetY + forwardY, s);
  }

  function drawEye(x, y, s) {
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#24110d';
    ctx.beginPath();
    ctx.arc(x, y, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEffects(delta) {
    eatEffects = eatEffects.filter((effect) => effect.age < 180);
    for (const effect of eatEffects) {
      effect.age += delta;
      const t = effect.age / 180;
      const rect = cellRect(effect);
      const s = layout.cell;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#b32822';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rect.x + s * 0.5, rect.y + s * 0.5, s * (0.25 + t * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawDeathMarker() {
    const rect = cellRect(deathMarker);
    const s = layout.cell;
    ctx.save();
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = Math.max(3, s * 0.12);
    ctx.beginPath();
    ctx.moveTo(rect.x + s * 0.25, rect.y + s * 0.25);
    ctx.lineTo(rect.x + s * 0.75, rect.y + s * 0.75);
    ctx.moveTo(rect.x + s * 0.75, rect.y + s * 0.25);
    ctx.lineTo(rect.x + s * 0.25, rect.y + s * 0.75);
    ctx.stroke();
    ctx.restore();
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
      eat: [620, 0.09, 'sine', 0.035],
      death: [90, 0.18, 'sawtooth', 0.04],
      click: [420, 0.05, 'triangle', 0.02]
    }[kind];

    if (!settings) return;

    const [frequency, duration, type, volume] = settings;
    const now = audioCtx.currentTime;
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (kind === 'death') oscillator.frequency.exponentialRampToValueAtTime(45, now + duration);

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
