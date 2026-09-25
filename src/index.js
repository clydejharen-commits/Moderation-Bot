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
import { handleFollowerPrefix, runDailyReset, scheduleDailyReset } from './commands/follower-prefix.js';
import { data as queueData, execute as queueExecute } from './commands/queue.js';
import { handleQueuePrefix } from './commands/queue-prefix.js';
import { data as addButtonData, execute as addButtonExecute } from './commands/add-button.js';
import { data as deleteButtonData, execute as deleteButtonExecute, autocomplete as deleteButtonAutocomplete } from './commands/delete-button.js';
import { data as ticketData, execute as ticketExecute } from './commands/ticket.js';
import { data as vouchData, execute as vouchExecute } from './commands/vouch.js';
import { data as dmData, execute as dmExecute } from './commands/dm.js';
import { data as closeData, execute as closeExecute, autocomplete as closeAutocomplete } from './commands/close-button.js';
import { handleTicketClosePrefix } from './commands/ticket-prefix.js';
import {
  handleFollowerButton,
  handleFollowerModal,
  handleFollowerSelect,
  isFollowerButton,
  isFollowerModal,
  isFollowerSelect,
} from './components/follower-panel.js';
import { handleControlButton, handleControlModal, isControlButton, isControlModal } from './components/control-panel.js';
import { handleQueueButton, isQueueButton } from './components/queue-panel.js';
import { handleTicketSelect, handleTicketModal, isTicketSelect, isTicketModal } from './components/ticket-panel.js';
import { handleVouchButton, handleVouchModal, isVouchButton, isVouchModal } from './components/vouch-panel.js';
import { connectDatabase, disconnectDatabase } from './db/database.js';
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
  queueData,
  addButtonData,
  deleteButtonData,
  ticketData,
  vouchData,
  dmData,
  closeData,
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
    queue: queueExecute,
    'add-button': addButtonExecute,
    'delete-button': deleteButtonExecute,
    ticket: ticketExecute,
    vouch: vouchExecute,
    dm: dmExecute,
    'close': closeExecute,
  }[cmd.name]);
}

const autocompleteMap = new Map();
autocompleteMap.set('delete-button', deleteButtonAutocomplete);
autocompleteMap.set('close', closeAutocomplete);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Bot online as ${readyClient.user.tag}`);

  try {
    await readyClient.application.commands.set(slashCommands);
    console.log('✅ Slash commands registered globally.');
  } catch (err) {
    console.error('[COMMAND REGISTER ERROR]', err.message);
  }

  await runDailyReset(readyClient);
  scheduleDailyReset(readyClient);

  startTrackerChecker(readyClient);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (message.content.startsWith('R!')) {
      const lower = message.content.slice(2).trim().toLowerCase();

      if (lower === 'close') {
        await handleTicketClosePrefix(message);
        return;
      }

      const handled = await handleFollowerPrefix(message);
      if (handled) return;

      const queueHandled = await handleQueuePrefix(message);
      if (queueHandled) return;
    }
  } catch (err) {
    console.error('[MESSAGE ERROR]', err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const autocompleteHandler = autocompleteMap.get(interaction.commandName);
      if (autocompleteHandler) {
        await autocompleteHandler(interaction);
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const executor = commandMap.get(interaction.commandName);
      if (!executor) return;

      if (interaction.replied || interaction.deferred) return;

      await executor(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (isFollowerButton(interaction.customId)) {
        await handleFollowerButton(interaction);
        return;
      }
      if (isControlButton(interaction.customId)) {
        await handleControlButton(interaction);
        return;
      }
      if (isQueueButton(interaction.customId)) {
        await handleQueueButton(interaction);
        return;
      }
      if (isVouchButton(interaction.customId)) {
        await handleVouchButton(interaction);
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (isFollowerModal(interaction.customId)) {
        await handleFollowerModal(interaction);
        return;
      }
      if (isControlModal(interaction.customId)) {
        await handleControlModal(interaction);
        return;
      }
      if (isTicketModal(interaction.customId)) {
        await handleTicketModal(interaction);
        return;
      }
      if (isVouchModal(interaction.customId)) {
        await handleVouchModal(interaction);
        return;
      }
    }

    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
      if (isFollowerSelect(interaction.customId)) {
        await handleFollowerSelect(interaction);
        return;
      }
      if (isTicketSelect(interaction.customId)) {
        await handleTicketSelect(interaction);
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

await connectDatabase();

client.login(token);
