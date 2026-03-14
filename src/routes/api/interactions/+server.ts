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

export const POST: RequestHandler = async ({ request }) => {
  const isValid = await verifyDiscordRequest(request);
  if (!isValid) return new Response('Unauthorized', { status: 401 });

  const interaction = await request.json();

  if (interaction.type === 1) {
    return json({ type: 1 });
  }

  if (interaction.type === 2 && interaction.data.name === 'play') {
    const channelId = interaction.channel_id;
    const clientId = env.VITE_DISCORD_CLIENT_ID;
    const playUrl = `https://discord.com/activities/${clientId}?channel=${channelId}`;

    return json({
      type: 4,
      data: {
        content: "🧩 **Today's Connections puzzle is ready!** Click below to play. Your result will be posted in this channel when you finish.",
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "▶ Play Connections",
                url: playUrl,
              },
            ],
          },
        ],
      },
    });
  }

  return json({ type: 1 });
};