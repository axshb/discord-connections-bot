import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, fetch }) => {
    const { username, score, details } = await request.json();
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    
    const CHANNEL_ID = "1480882400186732625"; 

    const message = {
        content: `**${username}** just finished Connections!\nResult: ${score}\n${details}`
    };

    try {
        const response = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        if (!response.ok) throw new Error('Failed to post to Discord');
        return json({ success: true });
    } catch (e) {
        return json({ error: "Post failed" }, { status: 500 });
    }
};