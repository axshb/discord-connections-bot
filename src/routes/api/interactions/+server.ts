import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import nacl from 'tweetnacl';

async function verifyDiscordRequest(request: Request): Promise<boolean> {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.clone().text();
  if (!signature || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      Buffer.from(signature, 'hex'),
      Buffer.from(env.DISCORD_PUBLIC_KEY, 'hex')
    );
  } catch {
    return false;
  }
}

function redisSet(key: string, value: string, exSeconds: number) {
  fetch(`${env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${exSeconds}`, {
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
  }).catch(e => console.error('Redis write failed:', e));
}

export const POST: RequestHandler = async ({ request }) => {
  const isValid = await verifyDiscordRequest(request);
  if (!isValid) return new Response('Unauthorized', { status: 401 });

  const interaction = await request.json();

  if (interaction.type === 1) {
    return json({ type: 1 });
  }

  if (interaction.type === 2 && interaction.data.name === 'play') {
    const key = `itok:${interaction.guild_id}:${interaction.channel_id}`;
    redisSet(key, interaction.token, 840); // fire and forget, no await
    return json({ type: 12 });
  }

  return json({ type: 1 });
};