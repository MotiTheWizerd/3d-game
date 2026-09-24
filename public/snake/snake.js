const canvas = document.getElementById('board');
const ctx    = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl  = document.getElementById('best');
const startBtn = document.getElementById('startBtn');

const GRID  = 20;
const CELL  = canvas.width / GRID; // 20px
const SPEED = 120; // ms per tick

let snake, dir, nextDir, food, score, best, interval, running;

// ---- helpers ----

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function placeFood() {
    let pos;
    do {
        pos = { x: rand(0, GRID - 1), y: rand(0, GRID - 1) };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    food = pos;
}

function updateScore(val) {
    scoreEl.textContent = val;
    scoreEl.classList.add('bump');
    setTimeout(() => scoreEl.classList.remove('bump'), 150);
}

// ---- drawing ----

function drawGrid() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i <= GRID; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL, 0);
        ctx.lineTo(i * CELL, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * CELL);
        ctx.lineTo(canvas.width, i * CELL);
        ctx.stroke();
    }
}

function drawSnake() {
    snake.forEach((seg, i) => {
        const ratio = 1 - (i / snake.length) * 0.4; // head is brightest
        const g = Math.round(255 * ratio);
        ctx.fillStyle = i === 0 ? '#00ff88' : `rgba(0, ${g}, ${Math.round(100 * ratio)}, ${0.8 + ratio * 0.2})`;

        const pad = i === 0 ? 1 : 2;
        ctx.beginPath();
        ctx.roundRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 4);
        ctx.fill();

        // eyes on head
        if (i === 0) {
            ctx.fillStyle = '#0f0c29';
            const eyeR = 2.5;
            const cx = seg.x * CELL + CELL / 2;
            const cy = seg.y * CELL + CELL / 2;
            const offsets = {
                UP:    [-4, -4], DOWN: [-4, 4], LEFT: [-4, -4], RIGHT: [4, -4]
            }[dir];
            // Simple two-dot eyes based on direction
            ctx.beginPath();
            ctx.arc(cx + (offsets ? offsets[0] : 0), cy + (offsets ? offsets[1] : 0), eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx + (offsets ? offsets[0] : 0) + 6, cy + (offsets ? offsets[1] : 0), eyeR, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function drawFood() {
    ctx.save();
    const pulse = 1 + Math.sin(Date.now() / 200) * 0.08;
    const cx = food.x * CELL + CELL / 2;
    const cy = food.y * CELL + CELL / 2;
    const r  = (CELL / 2 - 4) * pulse;

    // Glow
    ctx.shadowColor = '#ff4757';
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = '#ff4757';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Shine highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function render() {
    drawGrid();
    drawFood();
    drawSnake();
}

// ---- game logic ----

function move() {
    dir = nextDir;
    const head = { ...snake[0] };

    if      (dir === 'UP')    head.y--;
    else if (dir === 'DOWN')  head.y++;
    else if (dir === 'LEFT')  head.x--;
    else if (dir === 'RIGHT') head.x++;

    // Wall collision
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) return gameOver();

    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) return gameOver();

    snake.unshift(head);

    // Eat food?
    if (head.x === food.x && head.y === food.y) {
        score++;
        updateScore(score);
        if (score > best) {
            best = score;
            bestEl.textContent = best;
        }
        placeFood();
    } else {
        snake.pop();
    }

    render();
}

function gameOver() {
    clearInterval(interval);
    running = false;
    startBtn.textContent = 'Play Again';
    startBtn.style.background = 'linear-gradient(135deg, #ff4757, #cc3647)';

    // Flash effect
    ctx.fillStyle = 'rgba(255, 71, 87, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function initGame() {
    const mid = Math.floor(GRID / 2);
    snake = [
        { x: mid,     y: mid },
        { x: mid - 1, y: mid },
        { x: mid - 2, y: mid },
    ];
    dir  = 'RIGHT';
    nextDir = 'RIGHT';
    score = 0;
    scoreEl.textContent = '0';
    placeFood();
    render();
}

function startGame() {
    if (running) return;
    running = true;
    startBtn.textContent = 'Playing...';
    startBtn.disabled = true;
    startBtn.style.opacity = '0.6';
    initGame();
    interval = setInterval(move, SPEED);
}

// ---- events ----

document.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    const opposites = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

    if ((key === 'arrowup'    || key === 'w') && opposites[dir] !== 'UP')    nextDir = 'UP';
    if ((key === 'arrowdown'  || key === 's') && opposites[dir] !== 'DOWN')  nextDir = 'DOWN';
    if ((key === 'arrowleft'  || key === 'a') && opposites[dir] !== 'LEFT')  nextDir = 'LEFT';
    if ((key === 'arrowright' || key === 'd') && opposites[dir] !== 'RIGHT') nextDir = 'RIGHT';

    if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)) {
        e.preventDefault();
        if (!running && startBtn.textContent !== 'Playing...') startGame();
    }
});

startBtn.addEventListener('click', () => {
    startBtn.disabled = false;
    startBtn.textContent = 'Start Game';
    startBtn.style.background = '';
    startBtn.style.opacity = '';
    startGame();
});

// Polyfill roundRect for older browsers
if (!ctx.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (typeof r === 'number') r = [r, r, r, r];
        this.moveTo(x + r[0], y);
        this.arcTo(x + w, y,     x + w, y + h, r[1]);
        this.arcTo(x + w, y + h, x,     y + h, r[2]);
        this.arcTo(x,     y + h, x,     y,     r[3]);
        this.arcTo(x,     y,     x + w, y,     r[0]);
        this.closePath();
    };
}

// Initial render
initGame();
