/**
 * Watches a Discord channel for GeekNews bot messages
 * and forwards them to the app webhook.
 *
 * Required environment variables (set in .env or systemd unit):
 *   BOT_TOKEN    — Discord bot token
 *   CHANNEL_ID   — Discord channel ID to watch
 *   WEBHOOK_URL  — Full URL including ?token=... query param
 */

const { Client, GatewayIntentBits } = require("discord.js");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!BOT_TOKEN || !CHANNEL_ID || !WEBHOOK_URL) {
  console.error("[forwarder] BOT_TOKEN, CHANNEL_ID, WEBHOOK_URL are all required");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`[forwarder] logged in as ${client.user.tag}, watching channel ${CHANNEL_ID}`);
});

client.on("messageCreate", async (message) => {
  if (message.channelId !== CHANNEL_ID) return;
  if (!message.author.bot) return;
  if (!message.content) return;

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: message.content,
        timestamp: message.createdAt.toISOString(),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`[forwarder] forwarded message ${message.id} → article ${body.id}`);
    } else {
      console.error(`[forwarder] webhook answered ${res.status}`, body);
    }
  } catch (err) {
    console.error("[forwarder] fetch failed:", err);
  }
});

client.login(BOT_TOKEN);
