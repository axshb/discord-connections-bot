import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { username, score, details, channelId } = await request.json();

    if (!channelId) {
      return json({ error: "No channel ID provided" }, { status: 400 });
    }

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `### 🧩 Connections Result\n**${username}** finished today's puzzle!\n**Result:** ${score}\n\n${details}`
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("Discord message failed:", err);
      return json({ error: "Discord rejected the message", detail: err }, { status: 500 });
    }

    return json({ success: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Failed" }, { status: 500 });
  }
};