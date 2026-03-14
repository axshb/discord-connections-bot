<div align="center"> <h1>discord connections bot</h1> <p>This is a NYT Connections bot written for Discord, as current alternatives are unmaintained. It fetches the official puzzle of the day in UTC time.</p></div>

### Invite Link
Invite the bot to your server with [this link](https://discord.com/oauth2/authorize?client_id=1482330506132586496&permissions=2048&redirect_uri=https%3A%2F%2Fdiscord-connections-bot.vercel.app%2F&integration_type=0&scope=bot).

### Usage
Using the bot is simple. Once it is added to your server, simply use `/play` in a text channel to start the bot. The bot can also be launched as a normal activity in a voice channel.

### Example Output
```md
### 🧩 Connections — March 14
@user_a  ✅ 2 mistakes  🟨⬛🟩⬛🟪🟦
@user_b  ✅ 0 mistakes  🟩🟨🟪🟦
```
The scores message is edited in order to limit spamming a channel. However, after the token expires (15-20 minutes) a new message will be made. 

### Developing
Once you've created a project and installed dependencies with `npm install`, start a development server:
```sh
npm run dev
# or start the server and open the app in a new browser tab
npm run dev -- --open
```

### Building
```sh
npm run build
```

### Notes
This project was created with this exact configuration
```sh
# recreate this project
npx sv@0.12.7 create --template minimal --types ts --add prettier eslint --no-install discord-connections-bot
```

You can preview the production build with `npm run preview`.