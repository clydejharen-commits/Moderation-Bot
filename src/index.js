import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';
import { data as removeEmojisData, execute as removeEmojisExecute } from './commands/remove-emojis.js';
import { data as removeCategoriesData, execute as removeCategoriesExecute } from './commands/remove-categories.js';
import { data as copyCategoryData, execute as copyCategoryExecute } from './commands/copy-category.js';
import { data as embedData, execute as embedExecute } from './commands/embed.js';
import { data as controlData, execute as controlExecute } from './commands/control.js';
import { data as avatarData, execute as avatarExecute } from './commands/avatar.js';
import { data as bannerData, execute as bannerExecute } from './commands/banner.js';
import { data as followerData, execute as followerExecute } from './commands/follower.js';
import { data as trackData, execute as trackExecute } from './commands/track.js';
import { data as autoRemoveData, execute as autoRemoveExecute } from './commands/auto-remove.js';
import { handleFollowerPrefix, runDailyReset, scheduleDailyReset } from './commands/follower-prefix.js';
import {
  handleFollowerButton,
  handleFollowerModal,
  handleFollowerSelect,
  isFollowerButton,
  isFollowerModal,
  isFollowerSelect,
} from './components/follower-panel.js';
import { handleControlButton, handleControlModal, isControlButton, isControlModal } from './components/control-panel.js';
import { connectDatabase, disconnectDatabase } from './db/database.js';
import { registerGuildMemberUpdate } from './events/guildMemberUpdate.js';
import { startTrackerChecker, stopTrackerChecker } from './utils/trackerChecker.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

const slashCommands = [
  removeEmojisData,
  removeCategoriesData,
  copyCategoryData,
  embedData,
  controlData,
  avatarData,
  bannerData,
  followerData,
  trackData,
  autoRemoveData,
];

const commandMap = new Map();
for (const cmd of slashCommands) {
  commandMap.set(cmd.name, {
    'remove-emojis': removeEmojisExecute,
    'remove-categories': removeCategoriesExecute,
    'copy-category': copyCategoryExecute,
    embed: embedExecute,
    control: controlExecute,
    avatar: avatarExecute,
    banner: bannerExecute,
    follower: followerExecute,
    track: trackExecute,
    'auto-remove': autoRemoveExecute,
  }[cmd.name]);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Bot online as ${readyClient.user.tag}`);

  // Register slash commands globally
  try {
    await readyClient.application.commands.set(slashCommands);
    console.log('✅ Slash commands registered globally.');
  } catch (err) {
    console.error('[COMMAND REGISTER ERROR]', err.message);
  }

  // Check for missed daily resets and schedule the timer
  await runDailyReset(readyClient);
  scheduleDailyReset(readyClient);

  // Start the centralized Roblox tracker checker
  startTrackerChecker(readyClient);
});

// Register the GuildMemberUpdate listener for auto-remove monitoring
registerGuildMemberUpdate(client);

// Handle prefix commands (R! Track, R! Track stop, R!take, R!add, R!stock delete)
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (message.content.startsWith('R!')) {
      const handled = await handleFollowerPrefix(message);
      if (handled) return;
    }
  } catch (err) {
    console.error('[MESSAGE ERROR]', err.message);
  }
});

// Handle slash command, button, modal, and select menu interactions
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const executor = commandMap.get(interaction.commandName);
      if (!executor) return;

      // Prevent duplicate processing
      if (interaction.replied || interaction.deferred) return;

      await executor(interaction);
      return;
    }

    // Button interactions
    if (interaction.isButton()) {
      if (isFollowerButton(interaction.customId)) {
        await handleFollowerButton(interaction);
        return;
      }
      if (isControlButton(interaction.customId)) {
        await handleControlButton(interaction);
        return;
      }
    }

    // Modal submissions
    if (interaction.isModalSubmit()) {
      if (isFollowerModal(interaction.customId)) {
        await handleFollowerModal(interaction);
        return;
      }
      if (isControlModal(interaction.customId)) {
        await handleControlModal(interaction);
        return;
      }
    }

    // Select menu interactions (string and channel select menus)
    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
      if (isFollowerSelect(interaction.customId)) {
        await handleFollowerSelect(interaction);
        return;
      }
    }
  } catch (err) {
    console.error('[INTERACTION ERROR]', err.message);
    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: '❌ Something went wrong.', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
        }
      }
    } catch {
      // Already replied or interaction expired — nothing more we can do
    }
  }
});

// Graceful shutdown — stop the tracker and close the database connection cleanly
process.on('SIGINT', async () => {
  stopTrackerChecker();
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  stopTrackerChecker();
  await disconnectDatabase();
  process.exit(0);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN is not set in the environment. Add it to your .env file.');
  process.exit(1);
}

// Connect to MongoDB before logging in to Discord.
// If MongoDB is unavailable the bot still starts — database is optional.
await connectDatabase();

client.login(token);
