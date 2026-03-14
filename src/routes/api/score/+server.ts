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

function buildMessage(results: { username: string; result: string; grid: string; userId: string }[]): string {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const rows = results.map(r => `<@${r.userId}>  ${r.result}  ${r.grid}`).join('\n');
  return `### 🧩 Connections — ${date}\n${rows}`;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { userId, username, result, grid, interactionToken, guildId, channelId } = await request.json();

    if (!interactionToken) {
      return json({ error: "No interaction token provided" }, { status: 400 });
    }

    const clientId = env.VITE_DISCORD_CLIENT_ID;
    const date = today();
    
    const resultsKey = `results:${guildId}:${channelId}:${date}`;
    const msgIdKey = `msgid:${guildId}:${channelId}:${date}`;
    const ttl = 86400; 

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
            label: "▶ Play Connections",
            url: `https://discord.com/activities/${clientId}`,
          },
        ],
      },
    ];

    const existingMsgId = await redisGet(msgIdKey);

    // try to update current itneraction token
    if (existingMsgId) {
      const editRes = await fetch(
        `https://discord.com/api/v10/webhooks/${clientId}/${interactionToken}/messages/${existingMsgId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message, components }),
        }
      );
      if (editRes.ok) {
        return json({ success: true });
      }
    }

    // if failed, try a new 15 minute window
    const postRes = await fetch(`https://discord.com/api/v10/webhooks/${clientId}/${interactionToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message, components, wait: true }),
    });

    if (postRes.ok) {
      const posted = await postRes.json();
      await redisSet(msgIdKey, posted.id, ttl);
      return json({ success: true });
    } else {
      const err = await postRes.json();
      console.error("Discord post failed:", err);
      return json({ error: "Failed to post", detail: err }, { status: 500 });
    }

  } catch (e) {
    console.error(e);
    return json({ error: "Server Error" }, { status: 500 });
  }
};