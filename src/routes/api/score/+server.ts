import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { username, score, details } = await request.json();
        const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
        const CHANNEL_ID = "1480882400186732625"; 

        const message = {
            content: `**${username}** finished Connections!\nResult: ${score}\n${details}`
        };

        const response = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error("Discord API Error:", errBody);
            return json({ error: "Discord API rejected post" }, { status: 500 });
        }

        return json({ success: true });
    } catch (e) {
        console.error("Score API crash:", e);
        return json({ error: "Internal Server Error" }, { status: 500 });
    }
};