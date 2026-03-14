import { json } from '@sveltejs/kit';
import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text();

    const isValidRequest = signature && timestamp && verifyKey(
        body,
        signature,
        timestamp,
        process.env.DISCORD_PUBLIC_KEY! 
    );

    if (!isValidRequest) {
        return new Response('Bad request signature', { status: 401 });
    }

    const interaction = JSON.parse(body);

    if (interaction.type === InteractionType.PING) {
        return json({ type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        if (interaction.data.name === 'connections') {
            return json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "Let's play Connections!",
                    components: [{
                        type: 1,
                        components: [{
                            type: 2,
                            style: 5,
                            label: "Play Game",
                            url: `https://discord.com/app-assets/${process.env.VITE_DISCORD_CLIENT_ID}/info`
                        }]
                    }]
                }
            });
        }
    }

    return json({ error: 'Unknown interaction' }, { status: 400 });
};