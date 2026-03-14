import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();

    if (body.type === 1) return json({ type: 1 });

    if (body.type === 2 && body.data.name === 'connections') {
        return json({
            type: 4, 
            data: {
                content: "Click below to start today's Connections!",
                components: [{
                    type: 1,
                    components: [{
                        type: 2,
                        label: "Play Connections",
                        style: 5,
                        url: `https://discord.com/app-assets/${process.env.VITE_PUBLIC_DISCORD_CLIENT_ID}/info`
                    }]
                }]
            }
        });
    }

    return json({ error: "Unknown Interaction" }, { status: 400 });
};