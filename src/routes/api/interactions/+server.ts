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

async function deleteInteractionMessage(appId: string, token: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: 'DELETE',
  });
}

export const POST: RequestHandler = async ({ request }) => {
  const isValid = await verifyDiscordRequest(request);
  if (!isValid) return new Response('Unauthorized', { status: 401 });

  const interaction = await request.json();

  if (interaction.type === 1) {
    return json({ type: 1 });
  }

  if (interaction.type === 2 && interaction.data.name === 'play') {
    /*const appId = env.VITE_DISCORD_CLIENT_ID;
    const token = interaction.token;

    // Launch the activity
    // Then delete the auto-posted Game Invitation message in the background
    setTimeout(() => {
      deleteInteractionMessage(appId, token).catch(e =>
        console.error('Failed to delete interaction message:', e)
      );
    }, 1500); // small delay to let Discord post it first*/

    return json({ type: 12 });
  }

  if (interaction.type === 3 && interaction.data.custom_id === 'launch_game') {
    return json({ type: 12 }); 
  }

  return json({ type: 1 });
};