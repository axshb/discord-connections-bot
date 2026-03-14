import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config({ path: "../.env" });

const app = express();
const port = 3001;

app.use(express.json());

// Proxy to bypass CORS and fetch NYT data
app.get("/api/connections/:date", async (req, res) => {
  try {
    const url = `https://www.nytimes.com/svc/connections/v2/${req.params.date}.json`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch NYT data" });
  }
});

app.post("/api/token", async (req, res) => {
  const response = await fetch(`https://discord.com/api/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.VITE_DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: req.body.code,
    }),
  });
  const { access_token } = await response.json();
  res.send({ access_token });
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));