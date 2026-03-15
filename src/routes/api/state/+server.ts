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

export const GET: RequestHandler = async ({ url }) => {
  const userId = url.searchParams.get('userId');
  if (!userId) return json({ error: 'Missing userId' }, { status: 400 });

  const key = `state:${userId}:${today()}`;
  const saved = await redisGet(key);
  return json(saved ? JSON.parse(saved) : null);
};

export const POST: RequestHandler = async ({ request }) => {
  const { userId, state } = await request.json();
  if (!userId) return json({ error: 'Missing userId' }, { status: 400 });

  const key = `state:${userId}:${today()}`;
  await redisSet(key, JSON.stringify(state), 86400);
  return json({ success: true });
};