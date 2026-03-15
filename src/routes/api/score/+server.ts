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

const AVATAR_SIZE = 48;
const CARD_W = 160;
const CARD_PAD = 16;
const COLS = 4;
const SQUARE = 20;
const SQUARE_GAP = 3;
const GRID_COLS = 4;
const INNER_PAD = 12;

const emojiToColor: Record<string, string> = {
  '🟨': '#f9df6d',
  '🟩': '#a0c35a',
  '🟦': '#b0c4ef',
  '🟪': '#ba69ac',
  '⬛': '#3a3a3a',
};

function roundRectPath(ctx: any, x: number, y: number, w: number, h: number, r: number) {
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
}

function fillRoundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

function circleClip(ctx: any, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
}

// Card height is dynamic based on grid rows
function cardHeight(guessCount: number): number {
  const gridRows = Math.ceil(guessCount / GRID_COLS);
  // avatar + name + result + grid + padding
  return INNER_PAD + AVATAR_SIZE + 6 + 14 + 6 + 14 + 8
    + gridRows * (SQUARE + SQUARE_GAP) - SQUARE_GAP
    + INNER_PAD;
}

async function generateImage(
  results: { userId: string; username: string; result: string; grid: string; avatarHash: string | null }[]
): Promise<Buffer> {
  const count = results.length;
  const cols = Math.min(count, COLS);
  const rows = Math.ceil(count / COLS);

  // Pre-calculate max card height for this row
  const maxGuessCount = Math.max(...results.map(r => Array.from(r.grid).length));
  const cH = cardHeight(Math.max(maxGuessCount, 1));

  const TITLE_H = 44;
  const imgW = cols * (CARD_W + CARD_PAD) + CARD_PAD;
  const imgH = TITLE_H + rows * (cH + CARD_PAD) + CARD_PAD;

  const canvas = createCanvas(imgW, imgH);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, imgW, imgH);

  // Title
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🧩 Connections — ${date}`, imgW / 2, 28);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = CARD_PAD + col * (CARD_W + CARD_PAD);
    const y = TITLE_H + CARD_PAD + row * (cH + CARD_PAD);

    // Card bg
    ctx.fillStyle = '#2a2a2a';
    fillRoundRect(ctx, x, y, CARD_W, cH, 10);

    // Avatar
    const avatarCX = x + CARD_W / 2;
    const avatarCY = y + INNER_PAD + AVATAR_SIZE / 2;
    try {
      if (r.avatarHash) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${r.userId}/${r.avatarHash}.png?size=64`;
        const img = await loadImage(avatarUrl);
        ctx.save();
        circleClip(ctx, avatarCX, avatarCY, AVATAR_SIZE / 2);
        ctx.drawImage(img, avatarCX - AVATAR_SIZE / 2, avatarCY - AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE);
        ctx.restore();
      } else {
        // Fallback: coloured circle with initial
        ctx.fillStyle = '#4a4a4a';
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.username.charAt(0).toUpperCase(), avatarCX, avatarCY);
        ctx.textBaseline = 'alphabetic';
      }
    } catch {
      // Avatar fetch failed — fallback circle
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath();
      ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    let curY = y + INNER_PAD + AVATAR_SIZE + 6;

    // Username
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let name = r.username;
    while (ctx.measureText(name).width > CARD_W - INNER_PAD * 2 && name.length > 1) {
      name = name.slice(0, -1);
    }
    if (name !== r.username) name += '…';
    ctx.fillText(name, x + CARD_W / 2, curY + 12);
    curY += 14 + 6;

    // Result
    ctx.font = '13px sans-serif';
    const resultLabel = r.result === '✅' ? 'Solved!' : r.result === '❌' ? 'Failed' : 'Playing…';
    const resultColor = r.result === '✅' ? '#a0c35a' : r.result === '❌' ? '#e05555' : '#aaaaaa';
    ctx.fillStyle = resultColor;
    ctx.fillText(`${r.result} ${resultLabel}`, x + CARD_W / 2, curY + 12);
    curY += 14 + 8;

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

  return canvas.toBuffer('image/png');
}

function buildCaption(results: { username: string; result: string }[]): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const names = results.map(r => r.username).join(', ');
  return `**${names}** played Connections — ${date}`;
}

async function postMessage(
  channelId: string,
  imageBuffer: Buffer,
  caption: string,
): Promise<string | null> {
  const authHeader = `Bot ${env.DISCORD_TOKEN}`;
  const form = new FormData();
  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: '▶ Play Connections',
          url: `https://discord.com/activities/${env.VITE_DISCORD_CLIENT_ID}`,
        },
      ],
    },
  ];
  form.append('payload_json', JSON.stringify({ content: caption, components }));
  form.append('files[0]', new Blob([imageBuffer as any], { type: 'image/png' }), 'connections.png');

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: authHeader },
    body: form,
  });

  if (res.ok) {
    const data = await res.json();
    return data.id;
  }

  console.error('Discord post failed:', await res.json());
  return null;
}

async function editMessage(
  channelId: string,
  msgId: string,
  imageBuffer: Buffer,
  caption: string,
): Promise<boolean> {
  const authHeader = `Bot ${env.DISCORD_TOKEN}`;
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: caption, attachments: [] }));
  form.append('files[0]', new Blob([imageBuffer as any], { type: 'image/png' }), 'connections.png');

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msgId}`, {
    method: 'PATCH',
    headers: { Authorization: authHeader },
    body: form,
  });

  return res.ok;
}

async function deleteMessage(channelId: string, msgId: string): Promise<void> {
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msgId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
  });
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { userId, username, avatarHash, result, grid, guildId, channelId } = await request.json();

    if (!guildId || !channelId) {
      return json({ error: 'Missing guildId or channelId' }, { status: 400 });
    }

    const date = today();
    const resultsKey = `results:${guildId}:${channelId}:${date}`;
    const msgIdKey = `msgid:${guildId}:${channelId}:${date}`;
    const ttl = 86400;

    // Load and upsert results
    const existing = await redisGet(resultsKey);
    let results: { userId: string; username: string; avatarHash: string | null; result: string; grid: string }[] =
      existing ? JSON.parse(existing) : [];

    const idx = results.findIndex((r) => r.userId === userId);
    if (idx >= 0) {
      results[idx] = { userId, username, avatarHash: avatarHash ?? null, result, grid };
    } else {
      results.push({ userId, username, avatarHash: avatarHash ?? null, result, grid });
    }
    await redisSet(resultsKey, JSON.stringify(results), ttl);

    const imageBuffer = await generateImage(results);
    const caption = buildCaption(results);
    const existingMsgId = await redisGet(msgIdKey);

    if (existingMsgId) {
      // Delete old, post new (moves to bottom)
      await deleteMessage(channelId, existingMsgId);
      await redisDelete(msgIdKey);
    }

    const newMsgId = await postMessage(channelId, imageBuffer, caption);
    if (newMsgId) {
      await redisSet(msgIdKey, newMsgId, ttl);
      return json({ success: true });
    }

    return json({ error: 'Failed to post image' }, { status: 500 });

  } catch (e) {
    console.error(e);
    return json({ error: 'Server Error' }, { status: 500 });
  }
};