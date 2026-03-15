import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createCanvas } from '@napi-rs/canvas';

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

const CARD_W = 160;
const CARD_H = 200;
const CARD_PAD = 16;
const COLS = 4;
const SQUARE = 24;
const SQUARE_GAP = 4;
const GRID_COLS = 4;

const emojiToColor: Record<string, string> = {
  '🟨': '#f9df6d',
  '🟩': '#a0c35a',
  '🟦': '#b0c4ef',
  '🟪': '#ba69ac',
  '⬛': '#3a3a3a',
};

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
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

function generateImage(results: { username: string; result: string; grid: string }[]): Buffer {
  const count = results.length;
  const cols = Math.min(count, COLS);
  const rows = Math.ceil(count / COLS);

  const imgW = cols * (CARD_W + CARD_PAD) + CARD_PAD;
  const imgH = rows * (CARD_H + CARD_PAD) + CARD_PAD + 48;

  const canvas = createCanvas(imgW, imgH);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, imgW, imgH);

  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Connections — ${date}`, imgW / 2, 32);

  results.forEach((r, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = CARD_PAD + col * (CARD_W + CARD_PAD);
    const y = 48 + CARD_PAD + row * (CARD_H + CARD_PAD);

    ctx.fillStyle = '#2a2a2a';
    roundRect(ctx, x, y, CARD_W, CARD_H, 10);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    let name = r.username;
    while (ctx.measureText(name).width > CARD_W - 16 && name.length > 1) {
      name = name.slice(0, -1);
    }
    if (name !== r.username) name += '…';
    ctx.fillText(name, x + CARD_W / 2, y + 22);

    ctx.font = '16px sans-serif';
    ctx.fillText(r.result, x + CARD_W / 2, y + 44);

    const squares = Array.from(r.grid);
    const gridW = GRID_COLS * (SQUARE + SQUARE_GAP) - SQUARE_GAP;
    const gridX = x + (CARD_W - gridW) / 2;
    const gridY = y + 56;

    squares.forEach((emoji, si) => {
      const sc = si % GRID_COLS;
      const sr = Math.floor(si / GRID_COLS);
      const sx = gridX + sc * (SQUARE + SQUARE_GAP);
      const sy = gridY + sr * (SQUARE + SQUARE_GAP);
      ctx.fillStyle = emojiToColor[emoji] ?? '#3a3a3a';
      roundRect(ctx, sx, sy, SQUARE, SQUARE, 4);
    });
  });

  return canvas.toBuffer('image/png');
}

async function postOrEditMessage(
  channelId: string,
  existingMsgId: string | null,
  imageBytes: Buffer,
  clientId: string,
  playerCount: number,
): Promise<string | null> {
  const caption = `### 🧩 Connections — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} • ${playerCount} player${playerCount !== 1 ? 's' : ''}`;
  const authHeader = `Bot ${env.DISCORD_TOKEN}`;

  const componentsPayload = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5,
          label: '▶ Play Connections',
          url: `https://discord.com/activities/${clientId}`,
        },
      ],
    },
  ];

  if (existingMsgId) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ content: caption, components: componentsPayload, attachments: [] }));
    form.append('files[0]', new Blob([imageBytes as any], { type: 'image/png' }), 'connections.png');

    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${existingMsgId}`, {
      method: 'PATCH',
      headers: { Authorization: authHeader },
      body: form,
    });

    if (res.ok) return existingMsgId;
    // Fall through if edit failed (e.g. message was manually deleted)
  }

  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: caption, components: componentsPayload }));
  form.append('files[0]', new Blob([imageBytes as any], { type: 'image/png' }), 'connections.png');

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

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { userId, username, result, grid, guildId, channelId } = await request.json();

    if (!guildId || !channelId) {
      return json({ error: 'Missing guildId or channelId' }, { status: 400 });
    }

    const clientId = env.VITE_DISCORD_CLIENT_ID;
    const date = today();
    const resultsKey = `results:${guildId}:${channelId}:${date}`;
    const msgIdKey = `msgid:${guildId}:${channelId}:${date}`;
    const ttl = 86400;

    const existing = await redisGet(resultsKey);
    let results: { userId: string; username: string; result: string; grid: string }[] = existing ? JSON.parse(existing) : [];

    const idx = results.findIndex((r) => r.userId === userId);
    if (idx >= 0) {
      results[idx] = { userId, username, result, grid };
    } else {
      results.push({ userId, username, result, grid });
    }
    await redisSet(resultsKey, JSON.stringify(results), ttl);

    const imageBytes: Buffer = generateImage(results);
    const existingMsgId = await redisGet(msgIdKey);
    const newMsgId = await postOrEditMessage(channelId, existingMsgId, imageBytes, clientId, results.length);

    if (newMsgId) {
      if (newMsgId !== existingMsgId) {
        await redisSet(msgIdKey, newMsgId, ttl);
      }
      return json({ success: true });
    }

    return json({ error: 'Failed to post image' }, { status: 500 });

  } catch (e) {
    console.error(e);
    return json({ error: 'Server Error' }, { status: 500 });
  }
};