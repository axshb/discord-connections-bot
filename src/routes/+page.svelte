<script lang="ts">
  import { onMount } from 'svelte';

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
  let userId = $state("");
  let interactionToken = $state("");
  let guildId = $state("");
  let channelId = $state("");
  let loading = $state(true);
  let error = $state("");

  let guessGrid = $state<string[]>([]);

  const categoryEmojis = ['🟨', '🟩', '🟦', '🟪'];

  async function saveState() {
    if (!userId) return;
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        state: {
          activeWords,
          solvedCategories,
          mistakesRemaining,
          guessGrid,
          gameOver,
          gameWon,
        }
      })
    });
  }

  async function restoreState(allWords: any[]): Promise<boolean> {
    if (!userId) return false;
    try {
      const res = await fetch(`/api/state?userId=${userId}`);
      const saved = await res.json();
      if (!saved) return false;

      solvedCategories = saved.solvedCategories ?? [];
      mistakesRemaining = saved.mistakesRemaining ?? 4;
      guessGrid = saved.guessGrid ?? [];
      gameOver = saved.gameOver ?? false;
      gameWon = saved.gameWon ?? false;

      const solvedContents = new Set(saved.solvedCategories.map((c: any) => c.content));
      activeWords = allWords.filter(w => !solvedContents.has(w.content));

      return true;
    } catch {
      return false;
    }
  }

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.has('frame_id')) {
      try {
        const { DiscordSDK } = await import('@discord/embedded-app-sdk');
        const discordSdk = new DiscordSDK(CLIENT_ID);
        await discordSdk.ready();

        guildId = discordSdk.guildId ?? '';
        channelId = discordSdk.channelId ?? '';

        if (guildId && channelId) {
          const itokRes = await fetch(`/api/itok?guild=${guildId}&channel=${channelId}`);
          if (itokRes.ok) {
            const data = await itokRes.json();
            interactionToken = data.token || '';
          }
        }

        const { code } = await discordSdk.commands.authorize({
          client_id: CLIENT_ID,
          response_type: 'code',
          prompt: 'none',
          scope: ['identify'],
        });

        const tokenRes = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const { access_token } = await tokenRes.json();

        await discordSdk.commands.authenticate({ access_token });

        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        const user = await userRes.json();
        userName = user.global_name || user.username || "A Player";
        userId = user.id || '';
      } catch (e) {
        console.error("Discord init failed", e);
      }
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/connections/${today}`);
      const data = await res.json();

      if (data.error) {
        error = "Couldn't load today's puzzle.";
        loading = false;
        return;
      }

      const colors = ['#f9df6d', '#a0c35a', '#b0c4ef', '#ba69ac'];
      const allWords = data.categories.flatMap((cat: any, i: number) =>
        cat.cards.map((card: any) => ({
          content: card.content,
          category: cat.title,
          color: colors[i],
          emoji: categoryEmojis[i],
          members: cat.cards.map((c: any) => c.content).join(', ')
        }))
      );

      // try to restore saved session first
      const restored = await restoreState(allWords);

      if (!restored) {
        // fresh game, shuffle all words
        activeWords = allWords.sort(() => Math.random() - 0.5);
      }
      // if restored, activeWords is already set (filtered + in saved order) by restoreState
    } catch (e) {
      error = "Couldn't load today's puzzle.";
    }

    loading = false;
  });

  async function sendScore(won: boolean) {
    if (!interactionToken) return;

    const result = won ? `✅` : `❌`;
    const grid = guessGrid.join('');

    await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        username: userName,
        result,
        grid,
        interactionToken,
        guildId,
        channelId,
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

  async function checkGuess() {
    const counts: Record<string, number> = {};
    selectedWords.forEach(w => counts[w.category] = (counts[w.category] || 0) + 1);
    const maxMatch = Math.max(...Object.values(counts));

    if (maxMatch === 4) {
      const match = selectedWords[0];
      const emoji = activeWords.find(w => w.category === match.category)?.emoji
        ?? solvedCategories.find(c => c.category === match.category)?.emoji
        ?? '🟨';
      guessGrid = [...guessGrid, emoji];

      solvedCategories.push({ ...match });
      activeWords = activeWords.filter(w => !selectedWords.some(s => s.content === w.content));
      selectedWords = [];

      if (activeWords.length === 0) {
        gameWon = true;
        await saveState();
        sendScore(true);
      } else {
        await saveState();
      }
    } else {
      mistakesRemaining--;
      isShaking = true;
      guessGrid = [...guessGrid, '⬛'];
      if (maxMatch === 3) triggerToast("One away...");
      setTimeout(async () => {
        isShaking = false;
        selectedWords = [];
        if (mistakesRemaining === 0) {
          gameOver = true;
          await saveState();
          sendScore(false);
        } else {
          await saveState();
        }
      }, 400);
    }
  }
</script>

<div id="game-container">
  {#if showToast}<div class="toast">{toastMessage}</div>{/if}
  <h1>Connections</h1>
  {#if loading}
    <p class="status">Loading today's puzzle...</p>
  {:else if error}
    <p class="status">{error}</p>
  {:else}
    <div class="grid" class:shake={isShaking}>
      {#each solvedCategories as cat}
        <div class="solved-row" style:background={cat.color}>
          <strong>{cat.category}</strong>
          <span>{cat.members}</span>
        </div>
      {/each}
      {#each activeWords as word}
        <button class="word-card" class:selected={selectedWords.includes(word)} onclick={() => toggleSelect(word)}>
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
        <button onclick={() => activeWords = [...activeWords].sort(() => Math.random() - 0.5)}>Shuffle</button>
        <button disabled={selectedWords.length !== 4} onclick={checkGuess}>Submit</button>
      </div>
    {:else}
      <div class="end-screen">
        <h2>{gameWon ? "Excellent!" : "Game Over"}</h2>
        <p>{interactionToken ? "Result posted in channel." : "Game complete!"}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  :global(body) { background: #1a1a1a; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
  #game-container { width: 90vw; max-width: 600px; text-align: center; }
  .status { opacity: 0.6; margin-top: 40px; }
  .toast { position: fixed; top: 10%; left: 50%; transform: translateX(-50%); background: #fff; color: #000; padding: 12px 24px; border-radius: 5px; font-weight: bold; z-index: 100; }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: 80px;
    gap: 8px;
    margin: 24px 0;
  }
  .word-card {
    all: unset;
    background: #2a2a2a;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-weight: 700;
    cursor: pointer;
    text-transform: uppercase;
    font-size: 0.8rem;
    text-align: center;
    padding: 0 6px;
    box-sizing: border-box;
  }
  .word-card.selected { background: #4a4a3e; }
  .solved-row {
    grid-column: span 4;
    grid-row: span 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: #000;
    font-size: 0.85rem;
    box-sizing: border-box;
    padding: 0 12px;
    overflow: hidden;
  }
  .solved-row strong { font-size: 0.9rem; text-transform: uppercase; }
  .solved-row span { font-size: 0.75rem; opacity: 0.85; }
  .mistakes-container { margin-bottom: 20px; }
  .dots { display: inline-flex; gap: 10px; }
  .dot { width: 14px; height: 14px; background: #4a4a3e; border-radius: 50%; }
  .dot.lost { background: #111; }
  .controls button { background: transparent; color: #fff; border: 1px solid #fff; padding: 14px 28px; border-radius: 35px; cursor: pointer; }
  .controls button:disabled { opacity: 0.4; cursor: not-allowed; }
  .end-screen h2 { font-size: 1.5rem; margin-bottom: 8px; }
  .end-screen p { opacity: 0.7; }
  .shake { animation: shake 0.4s ease-in-out; }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } }
</style>