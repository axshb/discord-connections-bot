import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { username, score, details, channelId } = await request.json();
        const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

        const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: `### 🧩 Connections Result\n**${username}** finished today's puzzle!\n**Result:** ${score}\n\n${details}`
            }),
        });

        return json({ success: response.ok });
    } catch (e) {
        return json({ error: "Failed" }, { status: 500 });
    }
};