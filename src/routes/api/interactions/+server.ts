import { json } from '@sveltejs/kit';
import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
    // 1. Verify the request is actually from Discord (Required)
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const body = await request.text(); // Need raw body for verification

    const isValidRequest = signature && timestamp && verifyKey(
        body,
        signature,
        timestamp,
        process.env.DISCORD_PUBLIC_KEY! // Get this from "General Information" in Discord Portal
    );

    if (!isValidRequest) {
        return new Response('Bad request signature', { status: 401 });
    }

    const interaction = JSON.parse(body);

    // 2. Handle Discord PING (Handshake)
    if (interaction.type === InteractionType.PING) {
        return json({ type: InteractionResponseType.PONG });
    }

    // 3. Handle Slash Command (/connections)
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        if (interaction.data.name === 'connections') {
            return json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: "Let's play Connections!",
                    components: [{
                        type: 1, // Action Row
                        components: [{
                            type: 2, // Button
                            style: 5, // Link Button
                            label: "Play Game",
                            url: `https://discord.com/app-assets/${process.env.VITE_PUBLIC_DISCORD_CLIENT_ID}/info`
                        }]
                    }]
                }
            });
        }
    }

    return json({ error: 'Unknown interaction' }, { status: 400 });
};