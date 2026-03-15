import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const today = () => new Date().toISOString().split('T')[0];

async function redisGet(key: string): Promise<string | null> {
  const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

async function redisSet(key: string, value: string, exSeconds: number) {
  await fetch(`${env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${exSeconds}`, {
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
  });
}

async function redisDelete(key: string) {
  await fetch(`${env.UPSTASH_REDIS_REST_URL}/del/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
  });
}

const AVATAR_SIZE = 56;
const CARD_W = 160;
const CARD_PAD = 12;
const COLS = 4;
const SQUARE = 18;
const SQUARE_GAP = 3;
const GRID_COLS = 4;
const INNER_PAD = 12;
const TITLE_H = 40;

const emojiToColor: Record<string, string> = {
  '🟨': '#f9df6d',
  '🟩': '#a0c35a',
  '🟦': '#b0c4ef',
  '🟪': '#ba69ac',
  '⬛': '#3a3a3a',
};

function fillRoundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function cardHeight(guessCount: number): number {
  const gridRows = Math.ceil(Math.max(guessCount, 1) / GRID_COLS);
  const gridH = gridRows * (SQUARE + SQUARE_GAP) - SQUARE_GAP;
  return INNER_PAD + AVATAR_SIZE + 8 + 10 + 8 + gridH + INNER_PAD;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  console.log(`[avatar] fetching: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ConnectionsBot/1.0)',
      },
    });
    if (!res.ok) {
      console.error(`[avatar] fetch failed: HTTP ${res.status} for ${url}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`[avatar] fetched ${buf.byteLength} bytes from ${url}`);
    return buf;
  } catch (e) {
    console.error(`[avatar] fetch threw for ${url}:`, e);
    return null;
  }
}

async function generateImage(
  results: { userId: string; username: string; avatarHash: string | null; result: string; grid: string }[]
): Promise<Buffer> {
  console.log(`[generateImage] rendering ${results.length} cards`);

  const count = results.length;
  const cols = Math.min(count, COLS);
  const rows = Math.ceil(count / COLS);
  const maxGuesses = Math.max(...results.map(r => Array.from(r.grid).length), 1);
  const cH = cardHeight(maxGuesses);

  const imgW = cols * (CARD_W + CARD_PAD) + CARD_PAD;
  const imgH = TITLE_H + rows * (cH + CARD_PAD) + CARD_PAD;

  console.log(`[generateImage] canvas size: ${imgW}x${imgH}`);

  const canvas = createCanvas(imgW, imgH);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, imgW, imgH);

  // Fetch all avatars in parallel
  const avatarBuffers = await Promise.all(
    results.map(r => {
      if (!r.avatarHash) {
        console.log(`[avatar] no hash for userId=${r.userId}, skipping fetch`);
        return Promise.resolve(null);
      }
      const url = `https://cdn.discordapp.com/avatars/${r.userId}/${r.avatarHash}.png?size=64`;
      return fetchImageBuffer(url);
    })
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = CARD_PAD + col * (CARD_W + CARD_PAD);
    const y = TITLE_H + CARD_PAD + row * (cH + CARD_PAD);
    const cx = x + CARD_W / 2;

    // Card background
    ctx.fillStyle = '#222222';
    fillRoundRect(ctx, x, y, CARD_W, cH, 8);

    let curY = y + INNER_PAD;
    const avatarCX = cx;
    const avatarCY = curY + AVATAR_SIZE / 2;

    // Avatar — circular clip
    const avatarBuf = avatarBuffers[i];
    if (avatarBuf) {
      try {
        console.log(`[avatar] loading image for userId=${r.userId}, bufferSize=${avatarBuf.byteLength}`);
        // Uint8Array is more reliable than raw Buffer with @napi-rs/canvas
        const img = await loadImage(new Uint8Array(avatarBuf));
        console.log(`[avatar] loadImage succeeded for userId=${r.userId}, naturalSize=${img.width}x${img.height}`);
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, avatarCX - AVATAR_SIZE / 2, avatarCY - AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE);
        ctx.restore();
      } catch (e) {
        console.error(`[avatar] loadImage FAILED for userId=${r.userId}:`, e);
        // Fallback: grey circle
        ctx.fillStyle = '#444444';
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      console.log(`[avatar] no buffer for userId=${r.userId}, drawing fallback circle`);
      ctx.fillStyle = '#444444';
      ctx.beginPath();
      ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    curY += AVATAR_SIZE + 8;

    // Result indicator — coloured dot
    const dotColor = r.result === '✅' ? '#a0c35a' : r.result === '❌' ? '#e05555' : '#555555';
    const DOT_R = 5;
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(cx, curY + DOT_R, DOT_R, 0, Math.PI * 2);
    ctx.fill();

    curY += 10 + 8;

    // Guess grid
    const squares = Array.from(r.grid);
    const gridW = GRID_COLS * (SQUARE + SQUARE_GAP) - SQUARE_GAP;
    const gridX = x + (CARD_W - gridW) / 2;

    squares.forEach((emoji, si) => {
      const sc = si % GRID_COLS;
      const sr = Math.floor(si / GRID_COLS);
      const sx = gridX + sc * (SQUARE + SQUARE_GAP);
      const sy = curY + sr * (SQUARE + SQUARE_GAP);
      ctx.fillStyle = emojiToColor[emoji] ?? '#3a3a3a';
      fillRoundRect(ctx, sx, sy, SQUARE, SQUARE, 3);
    });
  }

  console.log(`[generateImage] canvas render complete, encoding PNG`);
  return canvas.toBuffer('image/png');
}

function buildCaption(username: string): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `**${username}** played Connections — ${date}`;
}

const COMPONENTS = [
  {
    type: 1,
    components: [
      {
        type: 2,
        style: 5,
        label: '▶ Play Connections',
        url: `https://discord.com/activities/${process.env.VITE_DISCORD_CLIENT_ID}`,
      },
    ],
  },
];

async function discordPost(channelId: string, imageBuffer: Buffer, caption: string): Promise<string | null> {
  console.log(`[discord] posting new message to channel=${channelId}`);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: caption, components: COMPONENTS }));
  form.append('files[0]', new Blob([imageBuffer as any], { type: 'image/png' }), 'connections.png');

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    body: form,
  });

  if (res.ok) {
    const msgId = (await res.json()).id;
    console.log(`[discord] post succeeded, msgId=${msgId}`);
    return msgId;
  }
  const errBody = await res.json();
  console.error(`[discord] post failed: HTTP ${res.status}`, JSON.stringify(errBody));
  return null;
}

async function discordEdit(channelId: string, msgId: string, imageBuffer: Buffer, caption: string): Promise<boolean> {
  console.log(`[discord] editing message msgId=${msgId} in channel=${channelId}`);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: caption, components: COMPONENTS, attachments: [] }));
  form.append('files[0]', new Blob([imageBuffer as any], { type: 'image/png' }), 'connections.png');

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msgId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    body: form,
  });

  if (res.ok) {
    console.log(`[discord] edit succeeded for msgId=${msgId}`);
    return true;
  }
  const errBody = await res.json();
  console.error(`[discord] edit failed: HTTP ${res.status}`, JSON.stringify(errBody));
  return false;
}

async function discordDelete(channelId: string, msgId: string): Promise<void> {
  console.log(`[discord] deleting message msgId=${msgId} in channel=${channelId}`);
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msgId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
  });
  if (!res.ok) {
    console.error(`[discord] delete failed: HTTP ${res.status} for msgId=${msgId}`);
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { userId, username, avatarHash, result, grid, guildId, channelId } = body;

    console.log(`[POST] incoming: userId=${userId} username=${username} avatarHash=${avatarHash} result=${result} guildId=${guildId} channelId=${channelId}`);

    if (!guildId || !channelId) {
      console.error('[POST] missing guildId or channelId');
      return json({ error: 'Missing guildId or channelId' }, { status: 400 });
    }

    const date = today();
    const resultsKey = `results:${guildId}:${channelId}:${date}`;
    const msgIdKey = `msgid:${guildId}:${channelId}:${date}`;
    const ttl = 86400;

    const existing = await redisGet(resultsKey);
    let results: { userId: string; username: string; avatarHash: string | null; result: string; grid: string }[] =
      existing ? JSON.parse(existing) : [];

    console.log(`[POST] existing results count: ${results.length}`);

    const idx = results.findIndex((r) => r.userId === userId);
    const isNewPlayer = idx < 0;

    if (isNewPlayer) {
      console.log(`[POST] new player, pushing to results`);
      results.push({ userId, username, avatarHash: avatarHash ?? null, result, grid });
    } else {
      console.log(`[POST] existing player at idx=${idx}, updating`);
      results[idx] = { userId, username, avatarHash: avatarHash ?? null, result, grid };
    }
    await redisSet(resultsKey, JSON.stringify(results), ttl);

    const imageBuffer = await generateImage(results);
    console.log(`[POST] image generated, size=${imageBuffer.byteLength} bytes`);

    const caption = buildCaption(username);
    const existingMsgId = await redisGet(msgIdKey);
    console.log(`[POST] existingMsgId=${existingMsgId}, isNewPlayer=${isNewPlayer}`);

    if (isNewPlayer) {
      if (existingMsgId) {
        await discordDelete(channelId, existingMsgId);
        await redisDelete(msgIdKey);
      }
      const newMsgId = await discordPost(channelId, imageBuffer, caption);
      if (newMsgId) {
        await redisSet(msgIdKey, newMsgId, ttl);
        return json({ success: true });
      }
      return json({ error: 'Failed to post' }, { status: 500 });
    } else {
      if (existingMsgId) {
        const edited = await discordEdit(channelId, existingMsgId, imageBuffer, caption);
        if (edited) return json({ success: true });
      }
      const newMsgId = await discordPost(channelId, imageBuffer, caption);
      if (newMsgId) {
        await redisSet(msgIdKey, newMsgId, ttl);
        return json({ success: true });
      }
      return json({ error: 'Failed to post' }, { status: 500 });
    }

  } catch (e) {
    console.error('[POST] unhandled exception:', e);
    return json({ error: 'Server Error' }, { status: 500 });
  }
};