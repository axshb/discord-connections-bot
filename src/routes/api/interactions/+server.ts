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

  // /play slash command or entry point, to launch activity silently
  if (interaction.type === 2 || interaction.type === 4) {
    return json({
      type: 4,
      data: {
        content: '',
        flags: 64, // ephemeral aka only visible to the user who ran it, and empty so nothing shows
      },
    });
  }

  return json({ type: 1 });
};