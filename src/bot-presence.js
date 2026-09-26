// Bot seats are session state; bots never authenticate or receive media.
export const botRoster = new Map();
export const botSeats = new Map();
export const botsInRoom = (id) => {
  const bot = botRoster.get(id);
  return bot
    ? [
        {
          id: "bot:" + id,
          name: bot.name + " [BOT]",
          emoji: "🤖",
          is_bot: true,
          seat: botSeats.get(id) ?? null,
        },
      ]
    : [];
};
