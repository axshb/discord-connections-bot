<script lang="ts">
  import { onMount } from 'svelte';

  // Using import.meta.env to match your VITE_ prefix
  const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

  let activeWords = $state<any[]>([]);
  let selectedWords = $state<any[]>([]);
  let solvedCategories = $state<any[]>([]);
  let mistakesRemaining = $state(4);
  
  let toastMessage = $state("");
  let showToast = $state(false);
  let isShaking = $state(false);
  let gameOver = $state(false);
  let gameWon = $state(false);
  
  let userName = $state("A Player");
  let currentChannelId = $state("");

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // 1. Discord Authentication & Context
    if (urlParams.has('frame_id')) {
      try {
        const { DiscordSDK } = await import('@discord/embedded-app-sdk');
        const discordSdk = new DiscordSDK(CLIENT_ID);
        await discordSdk.ready();
        
        // Capture the channel ID we are playing in
        currentChannelId = discordSdk.channelId;

        const auth = await discordSdk.commands.authorize({
          client_id: CLIENT_ID,
          scope: ['identify'],
          response_type: 'code',
          prompt: 'none',
        });

        const response = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${auth.code}` }
        });
        const user = await response.json();
        userName = user.global_name || user.username;
      } catch (e) { 
        console.error("Discord Auth Failed", e); 
      }
    }

    // 2. Fetch NYT Data
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

  async function sendScore(won: boolean) {
    const scoreStr = won ? "🟨🟩🟦🟪 WIN" : "⬛ LOSS";
    const details = solvedCategories.map(c => `Category: ${c.category}`).join('\n');
    
    await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: userName,
        score: scoreStr,
        details: details,
        channelId: currentChannelId
      })
    });
  }

  function triggerToast(msg: string) {
    toastMessage = msg;
    showToast = true;
    setTimeout(() => showToast = false, 2000);
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
      if (activeWords.length === 0) {
        gameWon = true;
        sendScore(true);
      }
    } else {
      mistakesRemaining--;
      isShaking = true;
      if (maxMatch === 3) triggerToast("One away...");
      setTimeout(() => {
        isShaking = false;
        selectedWords = [];
        if (mistakesRemaining === 0) {
          gameOver = true;
          sendScore(false);
        }
      }, 400);
    }
  }
</script>

<div id="game-container">
  {#if showToast}<div class="toast">{toastMessage}</div>{/if}

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
      Mistakes: 
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
      <h2>{gameWon ? "Excellent!" : "Game Over"}</h2>
      <p>Result shared in channel.</p>
      <button onclick={() => window.location.reload()}>Play Again</button>
    </div>
  {/if}
</div>

<style>
  :global(body) { 
    background: #000; 
    color: #fff; 
    font-family: 'Franklin Gothic Medium', Arial, sans-serif; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    min-height: 100vh; 
    margin: 0; 
  }
  
  #game-container { width: 90vw; max-width: 600px; text-align: center; position: relative; }
  
  .toast { 
    position: fixed; 
    top: 10%; 
    left: 50%; 
    transform: translateX(-50%); 
    background: #fff; 
    color: #000; 
    padding: 12px 24px; 
    border-radius: 5px; 
    font-weight: bold; 
    z-index: 100; 
  }
  
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
  
  .word-card { 
    all: unset; 
    background: #333; 
    aspect-ratio: 1.5 / 1; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    border-radius: 6px; 
    font-weight: 700; 
    cursor: pointer; 
    text-transform: uppercase; 
    font-size: clamp(0.7rem, 2vw, 1rem);
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
  
  .mistakes-container { margin-bottom: 20px; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .dots { display: inline-flex; gap: 10px; }
  .dot { width: 14px; height: 14px; background: #5a594e; border-radius: 50%; }
  .dot.lost { background: #1a1a1a; }
  
  .controls button, .end-screen button { 
    background: transparent; 
    color: #fff; 
    border: 1px solid #fff; 
    padding: 14px 28px; 
    border-radius: 35px; 
    cursor: pointer; 
    font-weight: bold;
  }
  
  button:disabled { opacity: 0.2; }
  
  .shake { animation: shake 0.4s ease-in-out; }
  @keyframes shake { 
    0%, 100% { transform: translateX(0); } 
    25% { transform: translateX(-10px); } 
    75% { transform: translateX(10px); } 
  }
</style>