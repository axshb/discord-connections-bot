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
  let avatarHash = $state("");
  let interactionToken = $state("");
  let guildId = $state("");
  let channelId = $state("");
  let loading = $state(true);
  let error = $state("");
  let editor = $state("");        // NEW
  let illustrator = $state("");   // NEW

  let guessGrid = $state<string[]>([]);

  const categoryEmojis = ['🟨', '🟩', '🟦', '🟪'];
  const categoryColors = ['#f9df6d', '#a0c35a', '#b0c4ef', '#ba69ac'];

  // ── NEW: normalise a card regardless of text vs image format ─────────────
  function normaliseCard(rawCard: any, meta: any) {
    const isImage = !!rawCard.image_url;

    const imageUrl = rawCard.image_url
  ? `/api/img-proxy?url=${encodeURIComponent(rawCard.image_url)}`
  : null;

    return {
      content:  isImage ? rawCard.image_alt_text : rawCard.content,
      imageUrl: rawCard.image_url ?? null,
      imageAlt: rawCard.image_alt_text ?? null,
      isImage,
      category: meta.title,
      color:    meta.color,
      emoji:    meta.emoji,
      members:  meta.members,
    };
  }

  async function saveState() {
    if (!userId) return;
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        state: { activeWords, solvedCategories, mistakesRemaining, guessGrid, gameOver, gameWon }
      })
    });
  }

  async function restoreState(allWords: any[], uid: string): Promise<boolean> {
    if (!uid) return false;
    try {
      const res = await fetch(`/api/state?userId=${uid}`);
      const saved = await res.json();
      if (!saved) return false;

      solvedCategories = saved.solvedCategories ?? [];
      mistakesRemaining = saved.mistakesRemaining ?? 4;
      guessGrid = saved.guessGrid ?? [];
      gameOver = saved.gameOver ?? false;
      gameWon = saved.gameWon ?? false;

      const solvedCategoryNames = new Set(saved.solvedCategories.map((c: any) => c.category));
      activeWords = allWords.filter(w => !solvedCategoryNames.has(w.category));
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
        avatarHash = user.avatar || '';
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

      // NEW: capture byline fields
      editor = data.editor ?? '';
      illustrator = data.illustrator ?? '';

      // NEW: build allWords using normaliseCard so image & text puzzles both work
      const allWords = data.categories.flatMap((cat: any, i: number) => {
        const memberLabels = cat.cards
          .map((c: any) => c.image_alt_text ?? c.content)
          .join(', ');
        const meta = {
          title:   cat.title,
          color:   categoryColors[i],
          emoji:   categoryEmojis[i],
          members: memberLabels,
        };
        return cat.cards.map((card: any) => normaliseCard(card, meta));
      });

      const restored = await restoreState(allWords, userId);
      if (!restored) {
        activeWords = allWords.sort(() => Math.random() - 0.5);
      }
    } catch (e) {
      error = "Couldn't load today's puzzle.";
    }

    loading = false;
  });

  async function sendScore(won: boolean | null = null) {
    if (!userId || !guildId || !channelId) return;
    const result = won === true ? '✅' : won === false ? '❌' : '🔄';
    const grid = guessGrid.join('');
    await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username: userName, avatarHash, result, grid, guildId, channelId })
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
      guessGrid = [...guessGrid, match.emoji];
      solvedCategories.push({ ...match });
      activeWords = activeWords.filter(w => !selectedWords.some(s => s.content === w.content && s.category === w.category));
      selectedWords = [];

      if (activeWords.length === 0) {
        gameWon = true;
        await saveState();
        await sendScore(true);
      } else {
        await saveState();
        sendScore(null);
      }
    } else {
      mistakesRemaining--;
      isShaking = true;
      guessGrid = [...guessGrid, '⬛'];
      if (maxMatch === 3) triggerToast("One away…");
      setTimeout(async () => {
        isShaking = false;
        selectedWords = [];
        if (mistakesRemaining === 0) {
          gameOver = true;
          await saveState();
          await sendScore(false);
        } else {
          await saveState();
          sendScore(null);
        }
      }, 400);
    }
  }
</script>

<div id="game-container">
  {#if showToast}<div class="toast">{toastMessage}</div>{/if}

  <div class="header">
    <h1>Connections</h1>
    <!-- NEW: byline -->
    {#if editor || illustrator}
      <p class="byline">
        {#if editor}By <span>{editor}</span>{/if}
        {#if editor && illustrator} · {/if}
        {#if illustrator}Art by <span>{illustrator}</span>{/if}
      </p>
    {/if}
  </div>
  <div class="divider"></div>
  <p class="instructions">Find groups of four related words.</p>

  {#if loading}
    <p class="status">Loading today's puzzle…</p>
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
        <button
          class="word-card"
          class:selected={selectedWords.includes(word)}
          class:image-card={word.isImage}
          onclick={() => toggleSelect(word)}
        >
          <!-- NEW: render image or text depending on card type -->
          {#if word.isImage}
            <img src={word.imageUrl} alt={word.imageAlt ?? word.content} />
          {:else}
            {word.content}
          {/if}
        </button>
      {/each}
    </div>

    <div class="guess-grid">{guessGrid.join('')}</div>

    {#if !gameOver && !gameWon}
      <div class="mistakes-container">
        Mistakes remaining
        <div class="dots">
          {#each Array(4) as _, i}
            <div class="dot" class:lost={i >= mistakesRemaining}></div>
          {/each}
        </div>
      </div>
      <div class="controls">
        <button onclick={() => activeWords = [...activeWords].sort(() => Math.random() - 0.5)}>Shuffle</button>
        <button class="submit-btn" disabled={selectedWords.length !== 4} onclick={checkGuess}>Submit</button>
      </div>
    {:else}
      <div class="end-screen">
        <h2>{gameWon ? "Excellent! 🎉" : "Game Over"}</h2>
        <p class="end-grid">{guessGrid.join('')}</p>
        <p>{interactionToken ? "Result posted in channel." : "Game complete!"}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap');

  :global(body) {
    background: #111;
    color: #f0ede8;
    font-family: 'DM Sans', sans-serif;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
    padding: 24px 16px 40px;
    margin: 0;
  }

  #game-container {
    width: 90vw;
    max-width: 560px;
  }

  /* ── Header ── */
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 16px;
    gap: 4px;
  }

  .header h1 {
    font-family: 'DM Serif Display', serif;
    font-size: 2.4rem;
    letter-spacing: -0.5px;
    color: #f0ede8;
    line-height: 1;
  }

  .byline {
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #666;
    font-weight: 500;
  }

  .byline span { color: #999; }

  .divider {
    width: 100%;
    height: 1px;
    background: linear-gradient(90deg, transparent, #2a2a2a 20%, #2a2a2a 80%, transparent);
    margin-bottom: 16px;
  }

  .instructions {
    text-align: center;
    font-size: 0.78rem;
    color: #555;
    margin-bottom: 16px;
    letter-spacing: 0.04em;
  }

  /* ── Grid ── */
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 14px;
  }

  .word-card {
    all: unset;
    background: #1e1e1e;
    border: 1px solid #2a2a2a;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    font-weight: 700;
    cursor: pointer;
    text-transform: uppercase;
    font-size: 0.72rem;
    letter-spacing: 0.05em;
    text-align: center;
    padding: 6px 4px;
    min-height: 74px;
    color: #f0ede8;
    transition: background 0.12s, border-color 0.12s, transform 0.1s;
  }

  .word-card:hover {
    background: #272727;
    border-color: #383838;
    transform: translateY(-1px);
  }

  .word-card.selected {
    background: #3d3d2e;
    border-color: #b5a43a;
  }

  /* NEW: image cards get slightly more padding, image sized to fit */
  .word-card img {
    width: 52px;
    height: 52px;
    object-fit: contain;
    filter: invert(1);   /* SVGs from NYT are dark; invert for dark bg */
    opacity: 0.85;
    pointer-events: none;
  }

  .word-card.selected img { opacity: 1; }

  .solved-row {
    grid-column: span 4;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    padding: 10px 12px;
    min-height: 74px;
    color: #111;
    animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .solved-row strong {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 700;
  }

  .solved-row span { font-size: 0.7rem; opacity: 0.75; margin-top: 2px; }

  /* ── Status bar ── */
  .guess-grid {
    text-align: center;
    font-size: 1.2rem;
    letter-spacing: 2px;
    margin-bottom: 12px;
    min-height: 22px;
  }

  .mistakes-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 14px;
    font-size: 0.73rem;
    color: #666;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .dots { display: flex; gap: 6px; }

  .dot {
    width: 12px;
    height: 12px;
    background: #b5a43a;
    border-radius: 50%;
    transition: background 0.3s, transform 0.2s;
  }

  .dot.lost { background: #222; transform: scale(0.8); }

  /* ── Controls ── */
  .controls {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 10px;
  }

  .controls button {
    background: transparent;
    color: #f0ede8;
    border: 1px solid #333;
    padding: 12px 28px;
    border-radius: 100px;
    cursor: pointer;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }

  .controls button:hover:not(:disabled) {
    background: #1e1e1e;
    border-color: #444;
    transform: translateY(-1px);
  }

  .controls button:disabled { opacity: 0.3; cursor: not-allowed; }

  .controls button.submit-btn {
    background: #f0ede8;
    color: #111;
    border-color: #f0ede8;
  }

  .controls button.submit-btn:hover:not(:disabled) {
    background: #dedad4;
    border-color: #dedad4;
  }

  /* ── Toast ── */
  .toast {
    position: fixed;
    top: 10%;
    left: 50%;
    transform: translateX(-50%);
    background: #f0ede8;
    color: #111;
    padding: 10px 22px;
    border-radius: 100px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    z-index: 100;
  }

  /* ── End screen ── */
  .end-screen { text-align: center; padding: 12px 0; }
  .end-screen h2 {
    font-family: 'DM Serif Display', serif;
    font-size: 1.8rem;
    margin-bottom: 6px;
  }
  .end-grid { font-size: 1.2rem; letter-spacing: 2px; margin: 6px 0; }
  .end-screen p { color: #666; font-size: 0.8rem; letter-spacing: 0.04em; }

  .status { text-align: center; color: #555; font-size: 0.85rem; padding: 40px 0; }

  /* ── Animations ── */
  .shake { animation: shake 0.4s ease-in-out; }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25%       { transform: translateX(-8px); }
    75%       { transform: translateX(8px); }
  }

  @keyframes popIn {
    from { opacity: 0; transform: scale(0.95); }
    to   { opacity: 1; transform: scale(1); }
  }
</style>