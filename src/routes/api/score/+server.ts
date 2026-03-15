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
  // avatar + result indicator dot + grid + padding
  return INNER_PAD + AVATAR_SIZE + 8 + 10 + 8 + gridH + INNER_PAD;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function generateImage(
  results: { userId: string; username: string; avatarHash: string | null; result: string; grid: string }[]
): Promise<Buffer> {
  const count = results.length;
  const cols = Math.min(count, COLS);
  const rows = Math.ceil(count / COLS);
  const maxGuesses = Math.max(...results.map(r => Array.from(r.grid).length), 1);
  const cH = cardHeight(maxGuesses);

  const imgW = cols * (CARD_W + CARD_PAD) + CARD_PAD;
  const imgH = TITLE_H + rows * (cH + CARD_PAD) + CARD_PAD;

  const canvas = createCanvas(imgW, imgH);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, imgW, imgH);

  // Fetch all avatars in parallel
  const avatarBuffers = await Promise.all(
    results.map(r =>
      r.avatarHash
        ? fetchImageBuffer(`https://cdn.discordapp.com/avatars/${r.userId}/${r.avatarHash}.png?size=64`)
        : Promise.resolve(null)
    )
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
        const img = await loadImage(avatarBuf);
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, avatarCX - AVATAR_SIZE / 2, avatarCY - AVATAR_SIZE / 2, AVATAR_SIZE, AVATAR_SIZE);
        ctx.restore();
      } catch {
        // draw fallback circle
        ctx.fillStyle = '#444444';
        ctx.beginPath();
        ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#444444';
      ctx.beginPath();
      ctx.arc(avatarCX, avatarCY, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    curY += AVATAR_SIZE + 8;

    // Result indicator — coloured dot row
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
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: caption, components: COMPONENTS }));
  form.append('files[0]', new Blob([imageBuffer as any], { type: 'image/png' }), 'connections.png');

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    body: form,
  });

  if (res.ok) return (await res.json()).id;
  console.error('Discord post failed:', await res.json());
  return null;
}

async function discordEdit(channelId: string, msgId: string, imageBuffer: Buffer, caption: string): Promise<boolean> {
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: caption, components: COMPONENTS, attachments: [] }));
  form.append('files[0]', new Blob([imageBuffer as any], { type: 'image/png' }), 'connections.png');

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msgId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
    body: form,
  });
  return res.ok;
}

async function discordDelete(channelId: string, msgId: string): Promise<void> {
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

    const existing = await redisGet(resultsKey);
    let results: { userId: string; username: string; avatarHash: string | null; result: string; grid: string }[] =
      existing ? JSON.parse(existing) : [];

    const idx = results.findIndex((r) => r.userId === userId);
    const isNewPlayer = idx < 0;

    if (isNewPlayer) {
      results.push({ userId, username, avatarHash: avatarHash ?? null, result, grid });
    } else {
      results[idx] = { userId, username, avatarHash: avatarHash ?? null, result, grid };
    }
    await redisSet(resultsKey, JSON.stringify(results), ttl);

    const imageBuffer = await generateImage(results);
    const caption = buildCaption(username);
    const existingMsgId = await redisGet(msgIdKey);

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
    console.error(e);
    return json({ error: 'Server Error' }, { status: 500 });
  }
};