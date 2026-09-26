// Separate from human accounts: bots cannot authenticate, spend coins or receive media.
export const botRoster = new Map();
export const botsInRoom = (id) => {
  const bot = botRoster.get(id);
  return bot
    ? [
        {
          id: "bot:" + id,
          name: bot.name + " [BOT]",
          emoji: "🤖",
          is_bot: true,
        },
      ]
    : [];
};
