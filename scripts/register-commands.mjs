const APPLICATION_ID = process.env.VITE_DISCORD_CLIENT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// Fetch existing commands so we can preserve the Entry Point command
const existing = await fetch(
  `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`,
  {
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
    },
  }
);
const existingCommands = await existing.json();
const entryPoint = existingCommands.find(c => c.type === 4); // Entry Point type

const commands = [
  // Preserve the Entry Point command if it exists
  ...(entryPoint ? [{ id: entryPoint.id, name: entryPoint.name, type: 4, description: "" }] : []),
  {
    name: "play",
    description: "Start today's Connections puzzle and post results here",
  },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  }
);

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));