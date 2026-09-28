import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { QuestConfig } from '../db/models/QuestConfig.js';
import { validateTokenRanges } from '../utils/questHelpers.js';
import { setLeaderboardChannel, updateLeaderboard } from '../utils/leaderboardManager.js';

const PREFIX = 'questset';

const BTN = {
  traineeUsers:       `${PREFIX}:btn:tu`,
  traineeRoles:        `${PREFIX}:btn:tr`,
  trainerUsers:        `${PREFIX}:btn:Tru`,
  trainerRoles:       `${PREFIX}:btn:Trr`,
  messageTracking:    `${PREFIX}:btn:mt`,
  tokenSettings:      `${PREFIX}:btn:ts`,
  dailyMessages:      `${PREFIX}:btn:dm`,
  leaderboard:       `${PREFIX}:btn:lb`,
  close:              `${PREFIX}:btn:close`,
  back:               `${PREFIX}:btn:back`,
};

const SEL = {
  traineeUsers:           `${PREFIX}:sel:tu`,
  traineeRoles:           `${PREFIX}:sel:tr`,
  trainerUsers:           `${PREFIX}:sel:Tru`,
  trainerRoles:           `${PREFIX}:sel:Trr`,
  traineeUsersRemove:    `${PREFIX}:sel:tur`,
  traineeRolesRemove:    `${PREFIX}:sel:trr`,
  trainerUsersRemove:    `${PREFIX}:sel:Trur`,
  trainerRolesRemove:    `${PREFIX}:sel:Trrr`,
  trackedUsers:          `${PREFIX}:sel:mtu`,
  trackedChannels:       `${PREFIX}:sel:mtc`,
  trackedUsersRemove:    `${PREFIX}:sel:mtur`,
  trackedChannelsRemove: `${PREFIX}:sel:mtcr`,
  leaderboardChannel:    `${PREFIX}:sel:lb`,
};

const MODAL = {
  tokenSettings:   `${PREFIX}:modal:ts`,
  dailyMessages:   `${PREFIX}:modal:dm`,
};

const MODAL_FIELD = {
  pointsPerToken:    `${PREFIX}:mf:ppt`,
  demotionMin:       `${PREFIX}:mf:dmin`,
  demotionMax:       `${PREFIX}:mf:dmax`,
  normalMin:         `${PREFIX}:mf:nmin`,
  normalMax:         `${PREFIX}:mf:nmax`,
  promotionMin:      `${PREFIX}:mf:pmin`,
  promotionMax:      `${PREFIX}:mf:pmax`,
  requiredMessages:  `${PREFIX}:mf:rm`,
  pointsIfMet:       `${PREFIX}:mf:pim`,
  pointsIfNotMet:    `${PREFIX}:mf:pinm`,
};

async function safeReply(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch {
    // interaction may have expired
  }
}

async function safeUpdate(interaction, options) {
  try {
    if (interaction.replied) {
      await interaction.editReply(options);
    } else {
      await interaction.update(options);
    }
  } catch (err) {
    console.error('[QUEST PANEL] Failed to update interaction:', err);
  }
}

async function getQuestConfig(guildId) {
  try {
    return await QuestConfig.findOneAndUpdate(
      { guildId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (err) {
    console.error('[QUEST PANEL] Failed to fetch quest config:', err);
    return null;
  }
}

async function saveQuestConfig(guildId, update) {
  try {
    return await QuestConfig.findOneAndUpdate(
      { guildId },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (err) {
    console.error('[QUEST PANEL] Failed to save quest config:', err);
    return null;
  }
}

function formatUserList(ids) {
  if (!ids || ids.length === 0) return 'None';
  return ids.map((id) => `<@${id}>`).join('\n');
}

function formatChannelList(ids) {
  if (!ids || ids.length === 0) return 'None';
  return ids.map((id) => `<#${id}>`).join('\n');
}

function formatRoleList(ids) {
  if (!ids || ids.length === 0) return 'None';
  return ids.map((id) => `<@&${id}>`).join('\n');
}

export function buildMainEmbed(cfg) {
  return new EmbedBuilder()
    .setTitle('\u{1F3AF} Quest System Configuration')
    .setColor(0x2B6CB0)
    .setDescription('Configure trainees, trainers, message tracking, token settings, daily messages, and the leaderboard.')
    .addFields(
      { name: '\u{1F465} Trainees', value: buildTraineeSummary(cfg), inline: false },
      { name: '\u{1F469}\u200D\u{1F37C} Trainers', value: buildTrainerSummary(cfg), inline: false },
      { name: '\u{1F4E1} Message Tracking', value: buildMessageTrackingSummary(cfg), inline: false },
      { name: '\u{1FA99} Token Settings', value: buildTokenSummary(cfg), inline: false },
      { name: '\u{1F4C5} Daily Messages', value: buildDailyMessagesSummary(cfg), inline: false },
      { name: '\u{1F3C6} Leaderboard', value: buildLeaderboardSummary(cfg), inline: false },
    )
    .setFooter({ text: 'Quest System Configuration' })
    .setTimestamp();
}

function buildTraineeSummary(cfg) {
  const users = cfg.traineeUserIds?.length || 0;
  const roles = cfg.traineeRoleIds?.length || 0;
  return `**Users (${users}):** ${users ? cfg.traineeUserIds.map((id) => `<@${id}>`).join(', ') : 'None'}\n**Roles (${roles}):** ${roles ? cfg.traineeRoleIds.map((id) => `<@&${id}>`).join(', ') : 'None'}`;
}

function buildTrainerSummary(cfg) {
  const users = cfg.trainerUserIds?.length || 0;
  const roles = cfg.trainerRoleIds?.length || 0;
  return `**Users (${users}):** ${users ? cfg.trainerUserIds.map((id) => `<@${id}>`).join(', ') : 'None'}\n**Roles (${roles}):** ${roles ? cfg.trainerRoleIds.map((id) => `<@&${id}>`).join(', ') : 'None'}`;
}

function buildMessageTrackingSummary(cfg) {
  const users = cfg.trackedUserIds?.length || 0;
  const channels = cfg.trackedChannelIds?.length || 0;
  return `**Tracked Users (${users}):** ${users ? cfg.trackedUserIds.map((id) => `<@${id}>`).join(', ') : 'None'}\n**Tracked Channels (${channels}):** ${channels ? cfg.trackedChannelIds.map((id) => `<#${id}>`).join(', ') : 'None'}`;
}

function buildTokenSummary(cfg) {
  return `**Points Required Per Token:** ${cfg.pointsPerToken}\n**Demotion Range:** ${cfg.demotionMin} - ${cfg.demotionMax}\n**Normal Range:** ${cfg.normalMin} - ${cfg.normalMax}\n**Promotion Range:** ${cfg.promotionMin} - ${cfg.promotionMax}`;
}

function buildDailyMessagesSummary(cfg) {
  return `**Required Daily Messages:** ${cfg.requiredDailyMessages}\n**Points if Met:** ${cfg.pointsIfMet > 0 ? '+' : ''}${cfg.pointsIfMet}\n**Points if Not Met:** ${cfg.pointsIfNotMet > 0 ? '+' : ''}${cfg.pointsIfNotMet}`;
}

function buildLeaderboardSummary(cfg) {
  if (cfg.leaderboardChannelId) {
    return `**Channel:** <#${cfg.leaderboardChannelId}>\n**Message ID:** ${cfg.leaderboardMessageId || 'Not created yet'}`;
  }
  return '**Channel:** Not set\nUse the Leaderboard button to select a channel.';
}

export function buildMainButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.traineeUsers).setLabel('Trainees \u2014 Users').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(BTN.traineeRoles).setLabel('Trainees \u2014 Roles').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.trainerUsers).setLabel('Trainers \u2014 Users').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(BTN.trainerRoles).setLabel('Trainers \u2014 Roles').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.messageTracking).setLabel('Message Tracking').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(BTN.tokenSettings).setLabel('Token Settings').setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.dailyMessages).setLabel('Daily Messages').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(BTN.leaderboard).setLabel('Leaderboard').setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.close).setLabel('Close').setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildUserManageEmbed(title, emoji, userIds, groupName) {
  return new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setColor(0x2B6CB0)
    .setDescription(`Manage ${groupName} below.\n\n**Current Users (${userIds.length}):**\n${formatUserList(userIds)}`)
    .setFooter({ text: `Quest System \u2014 ${title}` })
    .setTimestamp();
}

function buildRoleManageEmbed(title, emoji, roleIds, groupName) {
  return new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setColor(0x2B6CB0)
    .setDescription(`Manage ${groupName} below.\n\n**Current Roles (${roleIds.length}):**\n${formatRoleList(roleIds)}`)
    .setFooter({ text: `Quest System \u2014 ${title}` })
    .setTimestamp();
}

function buildChannelManageEmbed(title, emoji, channelIds, groupName) {
  return new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setColor(0x2B6CB0)
    .setDescription(`Manage ${groupName} below.\n\n**Current Channels (${channelIds.length}):**\n${formatChannelList(channelIds)}`)
    .setFooter({ text: `Quest System \u2014 ${title}` })
    .setTimestamp();
}

function buildRoleManageComponents(roleIds, selAddId, selRemoveId) {
  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(selAddId)
        .setPlaceholder('Select roles to add...')
        .setMinValues(1)
        .setMaxValues(25),
    ),
  );
  if (roleIds && roleIds.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(selRemoveId)
          .setPlaceholder('Select a role to remove...')
          .addOptions(
            roleIds.slice(0, 25).map((id) => ({
              label: `Role ${id}`,
              value: id,
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.back).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function buildUserComponents(userIds, selAddId, selRemoveId) {
  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(selAddId)
        .setPlaceholder('Select users to add...')
        .setMinValues(1)
        .setMaxValues(25),
    ),
  );
  if (userIds && userIds.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(selRemoveId)
          .setPlaceholder('Select a user to remove...')
          .addOptions(
            userIds.slice(0, 25).map((id) => ({
              label: `User ${id}`,
              value: id,
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.back).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function buildChannelComponents(channelIds, selAddId, selRemoveId) {
  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(selAddId)
        .setPlaceholder('Select channels to add...')
        .setChannelTypes([ChannelType.GuildText])
        .setMinValues(1)
        .setMaxValues(25),
    ),
  );
  if (channelIds && channelIds.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(selRemoveId)
          .setPlaceholder('Select a channel to remove...')
          .addOptions(
            channelIds.slice(0, 25).map((id) => ({
              label: `Channel ${id}`,
              value: id,
            })),
          ),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.back).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function buildMessageTrackingEmbed(cfg) {
  const users = cfg.trackedUserIds || [];
  const channels = cfg.trackedChannelIds || [];
  return new EmbedBuilder()
    .setTitle('\u{1F4E1} Message Tracking')
    .setColor(0x2B6CB0)
    .setDescription('A message counts only if the sender is a tracked user AND the channel is a tracked channel.')
    .addFields(
      { name: '\u{1F465} Tracked Users', value: users.length ? users.map((id) => `<@${id}>`).join('\n') : 'None', inline: false },
      { name: '\u{1F4E2} Tracked Channels', value: channels.length ? channels.map((id) => `<#${id}>`).join('\n') : 'None', inline: false },
    )
    .setFooter({ text: 'Quest System \u2014 Message Tracking' })
    .setTimestamp();
}

function buildMessageTrackingComponents(cfg) {
  const users = cfg.trackedUserIds || [];
  const channels = cfg.trackedChannelIds || [];
  return [
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(SEL.trackedUsers)
        .setPlaceholder('Add tracked users...')
        .setMinValues(1)
        .setMaxValues(25),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(SEL.trackedChannels)
        .setPlaceholder('Add tracked channels...')
        .setChannelTypes([ChannelType.GuildText])
        .setMinValues(1)
        .setMaxValues(25),
    ),
    ...(users.length > 0 ? [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(SEL.trackedUsersRemove)
          .setPlaceholder('Remove a tracked user...')
          .addOptions(users.slice(0, 25).map((id) => ({ label: `User ${id}`, value: id }))),
      ),
    ] : []),
    ...(channels.length > 0 ? [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(SEL.trackedChannelsRemove)
          .setPlaceholder('Remove a tracked channel...')
          .addOptions(channels.slice(0, 25).map((id) => ({ label: `Channel ${id}`, value: id }))),
      ),
    ] : []),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.back).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildLeaderboardEmbed(cfg) {
  return new EmbedBuilder()
    .setTitle('\u{1F3C6} Leaderboard Configuration')
    .setColor(0x2B6CB0)
    .setDescription(buildLeaderboardSummary(cfg))
    .setFooter({ text: 'Quest System \u2014 Leaderboard' })
    .setTimestamp();
}

function buildLeaderboardComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(SEL.leaderboardChannel)
        .setPlaceholder('Select a leaderboard channel...')
        .setChannelTypes([ChannelType.GuildText])
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(BTN.back).setLabel('\u2190 Back').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function isQuestButton(customId) {
  return customId.startsWith(PREFIX) && customId.includes(':btn:');
}

export function isQuestSelect(customId) {
  return customId.startsWith(PREFIX) && customId.includes(':sel:');
}

export function isQuestModal(customId) {
  return customId === MODAL.tokenSettings || customId === MODAL.dailyMessages;
}

function hasAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

export async function handleQuestButton(interaction) {
  if (!hasAdmin(interaction)) {
    await safeReply(interaction, '\u274C You need **Administrator** permission to manage Quest settings.');
    return;
  }
  const guildId = interaction.guild.id;
  const customId = interaction.customId;

  if (customId === BTN.close) {
    await safeUpdate(interaction, { embeds: [], components: [], content: '\u274C Quest configuration panel closed.' });
    return;
  }
  if (customId === BTN.back) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error. Please try again later.'); return; }
    await safeUpdate(interaction, { embeds: [buildMainEmbed(cfg)], components: buildMainButtons() });
    return;
  }
  if (customId === BTN.traineeUsers) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const ids = cfg.traineeUserIds || [];
    await safeUpdate(interaction, {
      embeds: [buildUserManageEmbed('Trainees \u2014 Users', '\u{1F465}', ids, 'trainee users')],
      components: buildUserComponents(ids, SEL.traineeUsers, SEL.traineeUsersRemove),
    });
    return;
  }
  if (customId === BTN.traineeRoles) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const ids = cfg.traineeRoleIds || [];
    await safeUpdate(interaction, {
      embeds: [buildRoleManageEmbed('Trainees \u2014 Roles', '\u{1F465}', ids, 'trainee roles')],
      components: buildRoleManageComponents(ids, SEL.traineeRoles, SEL.traineeRolesRemove),
    });
    return;
  }
  if (customId === BTN.trainerUsers) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const ids = cfg.trainerUserIds || [];
    await safeUpdate(interaction, {
      embeds: [buildUserManageEmbed('Trainers \u2014 Users', '\u{1F469}\u200D\u{1F37C}', ids, 'trainer users')],
      components: buildUserComponents(ids, SEL.trainerUsers, SEL.trainerUsersRemove),
    });
    return;
  }
  if (customId === BTN.trainerRoles) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const ids = cfg.trainerRoleIds || [];
    await safeUpdate(interaction, {
      embeds: [buildRoleManageEmbed('Trainers \u2014 Roles', '\u{1F469}\u200D\u{1F37C}', ids, 'trainer roles')],
      components: buildRoleManageComponents(ids, SEL.trainerRoles, SEL.trainerRolesRemove),
    });
    return;
  }
  if (customId === BTN.messageTracking) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    await safeUpdate(interaction, {
      embeds: [buildMessageTrackingEmbed(cfg)],
      components: buildMessageTrackingComponents(cfg),
    });
    return;
  }
  if (customId === BTN.tokenSettings) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const modal = new ModalBuilder()
      .setCustomId(MODAL.tokenSettings)
      .setTitle('Token Settings');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.pointsPerToken)
          .setLabel('Points Required Per Token')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.pointsPerToken)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.demotionMin)
          .setLabel('Demotion Min Token')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.demotionMin)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.demotionMax)
          .setLabel('Demotion Max Token')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.demotionMax)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.normalMin)
          .setLabel('Normal Min Token')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.normalMin)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.normalMax)
          .setLabel('Normal Max Token')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.normalMax)),
      ),
    );
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.promotionMin)
          .setLabel('Promotion Min Token')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.promotionMin)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.promotionMax)
          .setLabel('Promotion Max Token')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.promotionMax)),
      ),
    );
    try {
      await interaction.showModal(modal);
    } catch (err) {
      console.error('[QUEST PANEL] Failed to show token settings modal:', err);
      await safeReply(interaction, '\u274C Failed to open the settings form. Please try again.');
    }
    return;
  }
  if (customId === BTN.dailyMessages) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const modal = new ModalBuilder()
      .setCustomId(MODAL.dailyMessages)
      .setTitle('Daily Message Settings');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.requiredMessages)
          .setLabel('Required Daily Messages')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.requiredDailyMessages)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.pointsIfMet)
          .setLabel('Points if Met (e.g. 5)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.pointsIfMet)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(MODAL_FIELD.pointsIfNotMet)
          .setLabel('Points if Not Met (e.g. -3)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setValue(String(cfg.pointsIfNotMet)),
      ),
    );
    try {
      await interaction.showModal(modal);
    } catch (err) {
      console.error('[QUEST PANEL] Failed to show daily messages modal:', err);
      await safeReply(interaction, '\u274C Failed to open the settings form. Please try again.');
    }
    return;
  }
  if (customId === BTN.leaderboard) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    await safeUpdate(interaction, {
      embeds: [buildLeaderboardEmbed(cfg)],
      components: buildLeaderboardComponents(),
    });
    return;
  }
  await safeReply(interaction, '\u274C Unknown action.');
}

export async function handleQuestSelect(interaction) {
  if (!hasAdmin(interaction)) {
    await safeReply(interaction, '\u274C You need **Administrator** permission to manage Quest settings.');
    return;
  }
  const guildId = interaction.guild.id;
  const customId = interaction.customId;
  const values = interaction.values;

  // Trainee users
  if (customId === SEL.traineeUsers) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const existing = cfg.traineeUserIds || [];
    const toAdd = values.filter((id) => !existing.includes(id));
    if (toAdd.length === 0) { await safeReply(interaction, '\u26A0 All selected users are already trainees.'); return; }
    const updated = await saveQuestConfig(guildId, { $addToSet: { traineeUserIds: { $each: toAdd } } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    const ids = updated.traineeUserIds || [];
    await safeUpdate(interaction, {
      embeds: [buildUserManageEmbed('Trainees \u2014 Users', '\u{1F465}', ids, 'trainee users')],
      components: buildUserComponents(ids, SEL.traineeUsers, SEL.traineeUsersRemove),
    });
    await safeReply(interaction, `\u2705 Added ${toAdd.length} trainee user(s).`);
    return;
  }
  if (customId === SEL.traineeUsersRemove) {
    const removeId = values[0];
    const updated = await saveQuestConfig(guildId, { $pull: { traineeUserIds: removeId } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    const ids = updated.traineeUserIds || [];
    await safeUpdate(interaction, {
      embeds: [buildUserManageEmbed('Trainees \u2014 Users', '\u{1F465}', ids, 'trainee users')],
      components: buildUserComponents(ids, SEL.traineeUsers, SEL.traineeUsersRemove),
    });
    await safeReply(interaction, '\u2705 Removed 1 trainee user.');
    return;
  }
  // Trainee roles
  if (customId === SEL.traineeRoles) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const existing = cfg.traineeRoleIds || [];
    const toAdd = values.filter((id) => !existing.includes(id));
    if (toAdd.length === 0) { await safeReply(interaction, '\u26A0 All selected roles are already trainee roles.'); return; }
    const updated = await saveQuestConfig(guildId, { $addToSet: { traineeRoleIds: { $each: toAdd } } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    const ids = updated.traineeRoleIds || [];
    await safeUpdate(interaction, {
      embeds: [buildRoleManageEmbed('Trainees \u2014 Roles', '\u{1F465}', ids, 'trainee roles')],
      components: buildRoleManageComponents(ids, SEL.traineeRoles, SEL.traineeRolesRemove),
    });
    await safeReply(interaction, `\u2705 Added ${toAdd.length} trainee role(s).`);
    return;
  }
  if (customId === SEL.traineeRolesRemove) {
    const removeId = values[0];
    const updated = await saveQuestConfig(guildId, { $pull: { traineeRoleIds: removeId } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    const ids = updated.traineeRoleIds || [];
    await safeUpdate(interaction, {
      embeds: [buildRoleManageEmbed('Trainees \u2014 Roles', '\u{1F465}', ids, 'trainee roles')],
      components: buildRoleManageComponents(ids, SEL.traineeRoles, SEL.traineeRolesRemove),
    });
    await safeReply(interaction, '\u2705 Removed 1 trainee role.');
    return;
  }
  // Trainer users
  if (customId === SEL.trainerUsers) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const existing = cfg.trainerUserIds || [];
    const toAdd = values.filter((id) => !existing.includes(id));
    if (toAdd.length === 0) { await safeReply(interaction, '\u26A0 All selected users are already trainers.'); return; }
    const updated = await saveQuestConfig(guildId, { $addToSet: { trainerUserIds: { $each: toAdd } } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    const ids = updated.trainerUserIds || [];
    await safeUpdate(interaction, {
      embeds: [buildUserManageEmbed('Trainers \u2014 Users', '\u{1F469}\u200D\u{1F37C}', ids, 'trainer users')],
      components: buildUserComponents(ids, SEL.trainerUsers, SEL.trainerUsersRemove),
    });
    await safeReply(interaction, `\u2705 Added ${toAdd.length} trainer user(s).`);
    return;
  }
  if (customId === SEL.trainerUsersRemove) {
    const removeId = values[0];
    const updated = await saveQuestConfig(guildId, { $pull: { trainerUserIds: removeId } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    const ids = updated.trainerUserIds || [];
    await safeUpdate(interaction, {
      embeds: [buildUserManageEmbed('Trainers \u2014 Users', '\u{1F469}\u200D\u{1F37C}', ids, 'trainer users')],
      components: buildUserComponents(ids, SEL.trainerUsers, SEL.trainerUsersRemove),
    });
    await safeReply(interaction, '\u2705 Removed 1 trainer user.');
    return;
  }
  // Trainer roles
  if (customId === SEL.trainerRoles) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const existing = cfg.trainerRoleIds || [];
    const toAdd = values.filter((id) => !existing.includes(id));
    if (toAdd.length === 0) { await safeReply(interaction, '\u26A0 All selected roles are already trainer roles.'); return; }
    const updated = await saveQuestConfig(guildId, { $addToSet: { trainerRoleIds: { $each: toAdd } } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    const ids = updated.trainerRoleIds || [];
    await safeUpdate(interaction, {
      embeds: [buildRoleManageEmbed('Trainers \u2014 Roles', '\u{1F469}\u200D\u{1F37C}', ids, 'trainer roles')],
      components: buildRoleManageComponents(ids, SEL.trainerRoles, SEL.trainerRolesRemove),
    });
    await safeReply(interaction, `\u2705 Added ${toAdd.length} trainer role(s).`);
    return;
  }
  if (customId === SEL.trainerRolesRemove) {
    const removeId = values[0];
    const updated = await saveQuestConfig(guildId, { $pull: { trainerRoleIds: removeId } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    const ids = updated.trainerRoleIds || [];
    await safeUpdate(interaction, {
      embeds: [buildRoleManageEmbed('Trainers \u2014 Roles', '\u{1F469}\u200D\u{1F37C}', ids, 'trainer roles')],
      components: buildRoleManageComponents(ids, SEL.trainerRoles, SEL.trainerRolesRemove),
    });
    await safeReply(interaction, '\u2705 Removed 1 trainer role.');
    return;
  }
  // Tracked users
  if (customId === SEL.trackedUsers) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const existing = cfg.trackedUserIds || [];
    const toAdd = values.filter((id) => !existing.includes(id));
    if (toAdd.length === 0) { await safeReply(interaction, '\u26A0 All selected users are already tracked.'); return; }
    const updated = await saveQuestConfig(guildId, { $addToSet: { trackedUserIds: { $each: toAdd } } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    await safeUpdate(interaction, {
      embeds: [buildMessageTrackingEmbed(updated)],
      components: buildMessageTrackingComponents(updated),
    });
    await safeReply(interaction, `\u2705 Added ${toAdd.length} tracked user(s).`);
    return;
  }
  if (customId === SEL.trackedUsersRemove) {
    const removeId = values[0];
    const updated = await saveQuestConfig(guildId, { $pull: { trackedUserIds: removeId } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    await safeUpdate(interaction, {
      embeds: [buildMessageTrackingEmbed(updated)],
      components: buildMessageTrackingComponents(updated),
    });
    await safeReply(interaction, '\u2705 Removed 1 tracked user.');
    return;
  }
  // Tracked channels
  if (customId === SEL.trackedChannels) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const existing = cfg.trackedChannelIds || [];
    const toAdd = values.filter((id) => !existing.includes(id));
    if (toAdd.length === 0) { await safeReply(interaction, '\u26A0 All selected channels are already tracked.'); return; }
    const updated = await saveQuestConfig(guildId, { $addToSet: { trackedChannelIds: { $each: toAdd } } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    await safeUpdate(interaction, {
      embeds: [buildMessageTrackingEmbed(updated)],
      components: buildMessageTrackingComponents(updated),
    });
    await safeReply(interaction, `\u2705 Added ${toAdd.length} tracked channel(s).`);
    return;
  }
  if (customId === SEL.trackedChannelsRemove) {
    const removeId = values[0];
    const updated = await saveQuestConfig(guildId, { $pull: { trackedChannelIds: removeId } });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save. Please try again.'); return; }
    await safeUpdate(interaction, {
      embeds: [buildMessageTrackingEmbed(updated)],
      components: buildMessageTrackingComponents(updated),
    });
    await safeReply(interaction, '\u2705 Removed 1 tracked channel.');
    return;
  }
  // Leaderboard channel
  if (customId === SEL.leaderboardChannel) {
    const channelId = values[0];
    const success = await setLeaderboardChannel(interaction.client, guildId, channelId);
    if (!success) { await safeReply(interaction, '\u274C Failed to set leaderboard channel.'); return; }
    const cfg = await getQuestConfig(guildId);
    await safeUpdate(interaction, {
      embeds: [buildLeaderboardEmbed(cfg)],
      components: buildLeaderboardComponents(),
    });
    await safeReply(interaction, `\u2705 Leaderboard channel set to <#${channelId}>.`);
    return;
  }
  await safeReply(interaction, '\u274C Unknown selection.');
}

export async function handleQuestModal(interaction) {
  if (!hasAdmin(interaction)) {
    await safeReply(interaction, '\u274C You need **Administrator** permission to manage Quest settings.');
    return;
  }
  const guildId = interaction.guild.id;

  if (interaction.customId === MODAL.tokenSettings) {
    const ppt = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.pointsPerToken).trim(), 10);
    const dmin = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.demotionMin).trim(), 10);
    const dmax = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.demotionMax).trim(), 10);
    const nmin = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.normalMin).trim(), 10);
    const nmax = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.normalMax).trim(), 10);
    const pmin = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.promotionMin).trim(), 10);
    const pmax = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.promotionMax).trim(), 10);

    if ([ppt, dmin, dmax, nmin, nmax, pmin, pmax].some((v) => Number.isNaN(v))) {
      await safeReply(interaction, '\u274C All fields must be valid numbers.');
      return;
    }
    if (ppt <= 0) { await safeReply(interaction, '\u274C **Points Required Per Token** must be greater than 0.'); return; }

    const rangeError = validateTokenRanges(dmin, dmax, nmin, nmax, pmin, pmax);
    if (rangeError) { await safeReply(interaction, `\u274C ${rangeError}`); return; }

    const updated = await saveQuestConfig(guildId, {
      pointsPerToken: ppt,
      demotionMin: dmin,
      demotionMax: dmax,
      normalMin: nmin,
      normalMax: nmax,
      promotionMin: pmin,
      promotionMax: pmax,
    });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save token settings.'); return; }

    await updateLeaderboard(interaction.client, guildId);

    await safeUpdate(interaction, {
      embeds: [buildMainEmbed(updated)],
      components: buildMainButtons(),
    });
    await safeReply(interaction, '\u2705 Token settings saved.');
    return;
  }

  if (interaction.customId === MODAL.dailyMessages) {
    const rm = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.requiredMessages).trim(), 10);
    const pim = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.pointsIfMet).trim(), 10);
    const pinm = parseInt(interaction.fields.getTextInputValue(MODAL_FIELD.pointsIfNotMet).trim(), 10);

    if ([rm, pim, pinm].some((v) => Number.isNaN(v))) {
      await safeReply(interaction, '\u274C All fields must be valid numbers.');
      return;
    }
    if (rm < 0) { await safeReply(interaction, '\u274C Required messages must be \u2265 0.'); return; }

    const updated = await saveQuestConfig(guildId, {
      requiredDailyMessages: rm,
      pointsIfMet: pim,
      pointsIfNotMet: pinm,
    });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save daily message settings.'); return; }

    await updateLeaderboard(interaction.client, guildId);

    await safeUpdate(interaction, {
      embeds: [buildMainEmbed(updated)],
      components: buildMainButtons(),
    });
    await safeReply(interaction, '\u2705 Daily message settings saved.');
    return;
  }
  await safeReply(interaction, '\u274C Unknown form submission.');
}
