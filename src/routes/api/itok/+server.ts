import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

async function redisGet(key: string): Promise<string | null> {
  const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

export const GET: RequestHandler = async ({ url }) => {
  const guildId = url.searchParams.get('guild');
  const channelId = url.searchParams.get('channel');

  if (!guildId || !channelId) {
    return json({ error: 'Missing guild or channel' }, { status: 400 });
  }

  const key = `itok:${guildId}:${channelId}`;
  const token = await redisGet(key);

  if (!token) {
    return json({ error: 'Token not found or expired' }, { status: 404 });
  }

  return json({ token });
};