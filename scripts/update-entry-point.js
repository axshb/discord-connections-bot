const CLIENT_ID = 'cut';
const BOT_TOKEN = 'cut';

const res = await fetch(`https://discord.com/api/v10/applications/${CLIENT_ID}/commands/1482355836075507732`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bot ${BOT_TOKEN}` },
  body: JSON.stringify({ handler: 1 }),
});
console.log(await res.json());