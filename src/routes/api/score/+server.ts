import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { message, interactionToken } = await request.json();

    if (!interactionToken) {
      return json({ error: "No interaction token provided" }, { status: 400 });
    }

    const clientId = env.VITE_DISCORD_CLIENT_ID;

    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${clientId}/${interactionToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error("Discord followup failed:", err);
      return json({ error: "Discord rejected the message", detail: err }, { status: 500 });
    }

    return json({ success: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Failed" }, { status: 500 });
  }
};