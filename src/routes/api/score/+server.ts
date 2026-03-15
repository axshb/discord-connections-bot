import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

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

function buildMessage(results: { username: string; result: string; grid: string; userId: string }[]): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const rows = results.map(r => {
    return `<@${r.userId}> ${r.result}\n${r.grid}`;
  }).join('\n\n');
  return `### 🧩 Connections — ${date}\n${rows}`;
}

const botHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bot ${env.DISCORD_TOKEN}`,
};

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

    // Load existing results and dedupe by userId
    const existing = await redisGet(resultsKey);
    let results = existing ? JSON.parse(existing) : [];

    if (!results.find((r: any) => r.userId === userId)) {
      results.push({ userId, username, result, grid });
      await redisSet(resultsKey, JSON.stringify(results), ttl);
    }

    const message = buildMessage(results);
    const components = [
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

    const existingMsgId = await redisGet(msgIdKey);

    // delete old message if it exists, then post a fresh one
    if (existingMsgId) {
      await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${existingMsgId}`, {
        method: 'DELETE',
        headers: botHeaders,
      });
      await redisDelete(msgIdKey);
    }

    // post new message
    const postRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: botHeaders,
      body: JSON.stringify({ content: message, components }),
    });

    if (postRes.ok) {
      const posted = await postRes.json();
      await redisSet(msgIdKey, posted.id, ttl);
      return json({ success: true });
    } else {
      const err = await postRes.json();
      console.error('Discord post failed:', err);
      return json({ error: 'Failed to post', detail: err }, { status: 500 });
    }

  } catch (e) {
    console.error(e);
    return json({ error: 'Server Error' }, { status: 500 });
  }
};