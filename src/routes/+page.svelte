<script lang="ts">
  import { onMount } from 'svelte';

  let activeWords = $state<any[]>([]);
  let selectedWords = $state<any[]>([]);
  let solvedCategories = $state<any[]>([]);
  let mistakesRemaining = $state(4);
  
  let toastMessage = $state("");
  let showToast = $state(false);
  let isShaking = $state(false);
  let gameOver = $state(false);
  let gameWon = $state(false);

  onMount(async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`/api/connections/${today}`);
    const data = await res.json();
    
    const colors = ['#f9df6d', '#a0c35a', '#b0c4ef', '#ba69ac'];
    activeWords = data.categories.flatMap((cat: any, i: number) => 
      cat.cards.map((card: any) => ({
        content: card.content,
        category: cat.title,
        color: colors[i],
        members: cat.cards.map((c: any) => c.content).join(', ')
      }))
    ).sort(() => Math.random() - 0.5);
  });

  function triggerToast(msg: string) {
    console.log("Toast triggered:", msg); // Debug check
    toastMessage = msg;
    showToast = true;
    setTimeout(() => { showToast = false; }, 2000);
  }

  function toggleSelect(word: any) {
    if (gameOver || gameWon) return;
    if (selectedWords.includes(word)) {
      selectedWords = selectedWords.filter(w => w !== word);
    } else if (selectedWords.length < 4) {
      selectedWords.push(word);
    }
  }

  function checkGuess() {
    const counts: Record<string, number> = {};
    selectedWords.forEach(w => counts[w.category] = (counts[w.category] || 0) + 1);
    const maxMatch = Math.max(...Object.values(counts));
    
    if (maxMatch === 4) {
      const match = selectedWords[0];
      solvedCategories.push({ ...match });
      activeWords = activeWords.filter(w => !selectedWords.some(s => s.content === w.content));
      selectedWords = [];
      if (activeWords.length === 0) gameWon = true;
    } else {
      mistakesRemaining--;
      isShaking = true;
      
      // Fixed: Ensure toast fires before we clear selectedWords
      if (maxMatch === 3) triggerToast("One away...");
      
      setTimeout(() => {
        isShaking = false;
        selectedWords = []; // Clear selection after the shake
        if (mistakesRemaining === 0) gameOver = true;
      }, 400);
    }
  }
</script>

<div id="game-container">
  {#if showToast}
    <div class="toast-popup">{toastMessage}</div>
  {/if}

  <h1>Connections</h1>

  <div class="grid" class:shake={isShaking}>
    {#each solvedCategories as cat}
      <div class="solved-row" style:background={cat.color}>
        <h3>{cat.category}</h3>
        <p>{cat.members}</p>
      </div>
    {/each}

    {#each activeWords as word}
      <button 
        class="word-card" 
        class:selected={selectedWords.includes(word)}
        onclick={() => toggleSelect(word)}
      >
        {word.content}
      </button>
    {/each}
  </div>

  {#if !gameOver && !gameWon}
    <div class="mistakes-container">
      Mistakes remaining: 
      <div class="dots">
        {#each Array(4) as _, i}
          <div class="dot" class:lost={i >= mistakesRemaining}></div>
        {/each}
      </div>
    </div>

    <div class="controls">
      <button onclick={() => activeWords = activeWords.sort(() => Math.random() - 0.5)}>Shuffle</button>
      <button disabled={selectedWords.length !== 4} onclick={checkGuess}>Submit</button>
    </div>
  {:else}
    <div class="end-screen">
      <h2>{gameWon ? "Excellent!" : "Better luck next time..."}</h2>
      <button onclick={() => window.location.reload()}>Next Day</button>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    background-color: #000;
    color: #fff;
    font-family: 'Franklin Gothic Medium', Arial, sans-serif;
    margin: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    overflow: hidden;
  }

  #game-container {
    width: 90vw;
    max-width: 600px;
    text-align: center;
    position: relative;
  }

  /* Fixed Toast Styling */
  .toast-popup {
    position: fixed;
    top: 10%;
    left: 50%;
    transform: translateX(-50%);
    background: #fff;
    color: #000;
    padding: 12px 24px;
    border-radius: 5px;
    font-weight: bold;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin: 24px 0;
  }

  .shake { animation: shake 0.4s ease-in-out; }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    75% { transform: translateX(10px); }
  }

  .word-card {
    all: unset;
    background: #333;
    aspect-ratio: 1.5 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-weight: 700;
    font-size: clamp(0.6rem, 2.5vw, 1rem);
    cursor: pointer;
    text-transform: uppercase;
    box-sizing: border-box;
    transition: background 0.1s;
  }

  .word-card.selected { background: #5a594e; }

  .solved-row {
    grid-column: span 4;
    min-height: 80px;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    color: #000;
    margin-bottom: 4px;
    padding: 10px;
  }

  .solved-row h3 { margin: 0; text-transform: uppercase; font-size: 1.1rem; }
  .solved-row p { margin: 5px 0 0 0; font-size: 0.9rem; }

  .mistakes-container { display: flex; align-items: center; justify-content: center; margin-bottom: 20px; }
  .dots { display: inline-flex; gap: 10px; margin-left: 10px; }
  .dot { width: 14px; height: 14px; background: #5a594e; border-radius: 50%; transition: background 0.3s; }
  .dot.lost { background: #1a1a1a; }

  .controls button, .end-screen button {
    all: unset;
    border: 1px solid white;
    padding: 14px 28px;
    border-radius: 35px;
    font-weight: bold;
    cursor: pointer;
    margin: 0 5px;
  }

  button:disabled { opacity: 0.2; cursor: not-allowed; }
</style>