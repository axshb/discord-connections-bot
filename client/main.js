import './style.css';

let activeWords = [];
let selectedWords = [];
let mistakesRemaining = 4;
let solvedCategories = [];

const app = document.querySelector('#app');

async function init() {
  const today = new Date().toISOString().split('T')[0];
  const res = await fetch(`/api/connections/${today}`);
  const data = await res.json();

  const colors = ['var(--yellow)', 'var(--green)', 'var(--blue)', 'var(--purple)'];
  activeWords = data.categories.flatMap((cat, i) => 
    cat.cards.map(card => ({
      content: card.content,
      category: cat.title,
      level: i,
      color: colors[i],
      members: cat.cards.map(c => c.content).join(', ')
    }))
  ).sort(() => Math.random() - 0.5);

  setupUI();
}

function setupUI() {
  app.innerHTML = `
    <div id="toast">One away...</div>
    <h1 style="margin-bottom: 40px;">Connections</h1>
    <div class="grid" id="game-grid"></div>
    <div class="mistakes-container">
      Mistakes remaining: 
      <div class="dots" id="mistake-dots">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>
    </div>
    <div style="display:flex; gap:15px; justify-content:center;">
      <button id="shuffle-btn">Shuffle</button>
      <button id="submit-btn" disabled>Submit</button>
    </div>
  `;
  
  drawGrid();
  
  document.getElementById('shuffle-btn').onclick = () => {
    activeWords.sort(() => Math.random() - 0.5);
    drawGrid();
  };

  document.getElementById('submit-btn').onclick = checkGuess;
}

function drawGrid() {
  const grid = document.getElementById('game-grid');
  grid.innerHTML = '';

  solvedCategories.forEach(cat => {
    const row = document.createElement('div');
    row.className = 'solved-row';
    row.style.background = cat.color;
    row.innerHTML = `<h3>${cat.title}</h3><p>${cat.members}</p>`;
    grid.appendChild(row);
  });

  activeWords.forEach(word => {
    const card = document.createElement('div');
    card.className = `word-card ${selectedWords.includes(word) ? 'selected' : ''}`;
    card.textContent = word.content;
    card.onclick = () => {
      if (selectedWords.includes(word)) {
        selectedWords = selectedWords.filter(w => w !== word);
      } else if (selectedWords.length < 4) {
        selectedWords.push(word);
      }
      drawGrid();
      document.getElementById('submit-btn').disabled = selectedWords.length !== 4;
    };
    grid.appendChild(card);
  });
}

function checkGuess() {
  const counts = {};
  selectedWords.forEach(w => counts[w.category] = (counts[w.category] || 0) + 1);
  const maxMatch = Math.max(...Object.values(counts));

  if (maxMatch === 4) {
    const match = selectedWords[0];
    solvedCategories.push({
      title: match.category,
      members: match.members,
      color: match.color
    });
    activeWords = activeWords.filter(w => !selectedWords.some(s => s.content === w.content));
    selectedWords = [];
    drawGrid();
    if (activeWords.length === 0) setTimeout(() => alert("Excellent!"), 200);
  } else {
    // Handling a mistake
    mistakesRemaining--;
    updateDots();
    
    if (maxMatch === 3) showToast("One away...");
    
    const grid = document.getElementById('game-grid');
    grid.classList.add('shake');
    
    setTimeout(() => {
      grid.classList.remove('shake');
      // Unselect all on error like real NYT
      selectedWords = [];
      drawGrid();
      document.getElementById('submit-btn').disabled = true;
    }, 400);

    if (mistakesRemaining === 0) setTimeout(() => alert("Game Over!"), 500);
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(() => t.style.opacity = '0', 2000);
}

function updateDots() {
  const dots = document.querySelectorAll('.dot');
  // Reverse fill the dots
  for (let i = 0; i < 4; i++) {
    if (i < (4 - mistakesRemaining)) {
      dots[3 - i].classList.add('lost');
    }
  }
}

init();