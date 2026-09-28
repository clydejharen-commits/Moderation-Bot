import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from 'discord.js';
import { QuestConfig } from '../db/models/QuestConfig.js';

const PREFIX = 'questset';

const BTN = {
  traineeUsers:       `${PREFIX}:btn:tu`,
  traineeRoles:       `${PREFIX}:btn:tr`,
  trainerUsers:       `${PREFIX}:btn:Tru`,
  trainerRoles:       `${PREFIX}:btn:Trr`,
  coinSettings:       `${PREFIX}:btn:coin`,
  close:              `${PREFIX}:btn:close`,
  back:               `${PREFIX}:btn:back`,
};

const SEL = {
  traineeUsers:       `${PREFIX}:sel:tu`,
  traineeRoles:       `${PREFIX}:sel:tr`,
  trainerUsers:       `${PREFIX}:sel:Tru`,
  trainerRoles:       `${PREFIX}:sel:Trr`,
  traineeUsersRemove: `${PREFIX}:sel:tur`,
  traineeRolesRemove: `${PREFIX}:sel:trr`,
  trainerUsersRemove: `${PREFIX}:sel:Trur`,
  trainerRolesRemove: `${PREFIX}:sel:Trrr`,
};

const MODAL = {
  coinSettings:       `${PREFIX}:modal:coin`,
};

const MODAL_FIELD = {
  pointsPerCoin:      `${PREFIX}:mf:ppc`,
  coinsForPromotion:  `${PREFIX}:mf:cfp`,
  coinsForDemotion:   `${PREFIX}:meta:cfd`,
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

function formatRoleList(ids) {
  if (!ids || ids.length === 0) return 'None';
  return ids.map((id) => `<@&${id}>`).join('\n');
}

function statusBadge(coinValue, promoteThreshold, demoteThreshold) {
  if (coinValue >= promoteThreshold) return '\u{1F7E2} Promotion';
  if (coinValue < demoteThreshold) return '\u{1F534} Demotion';
  return '\u26A0 Unset';
}

export function buildMainEmbed(cfg) {
  const embed = new EmbedBuilder()
    .setTitle('\u{1F3AF} Quest System Configuration')
    .setColor(0x2B6CB0)
    .setDescription('Configure trainees, trainers, and promote coin settings for the Quest System.')
    .addFields(
      { name: '\u{1F465} Trainees', value: buildTraineeSummary(cfg), inline: false },
      { name: '\u{1F469}\u200D\u{1F37C} Trainers', value: buildTrainerSummary(cfg), inline: false },
      { name: '\u{1FA99} Promote Coin Settings', value: buildCoinSummary(cfg), inline: false },
      { name: '\u{1F4C8} Promotion / Demotion Status', value: buildStatusSummary(cfg), inline: false },
    )
    .setFooter({ text: 'Quest System \u2014 Part 1' })
    .setTimestamp();
  return embed;
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

function buildCoinSummary(cfg) {
  return `**Points Required Per Promote Coin:** ${cfg.pointsPerPromoteCoin}\n**Promote Coins Required for Promotion:** ${cfg.promoteCoinsForPromotion}\n**Promote Coins Required for Demotion:** ${cfg.promoteCoinsForDemotion}`;
}

function buildStatusSummary(cfg) {
  const coin = 0;
  const status = statusBadge(coin, cfg.promoteCoinsForPromotion, cfg.promoteCoinsForDemotion);
  return `Current status at **0** promote coins: ${status}\n\n\u2022 \u{1F7E2} Promotion: Promote Coins \u2265 ${cfg.promoteCoinsForPromotion}\n\u2022 \u{1F534} Demotion: Promote Coins < ${cfg.promoteCoinsForDemotion}`;
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
      new ButtonBuilder().setCustomId(BTN.coinSettings).setLabel('Promote Coin Settings').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(BTN.close).setLabel('Close').setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildUserManageEmbed(title, emoji, userIds, groupName) {
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setColor(0x2B6CB0)
    .setDescription(`Manage ${groupName} below.\n\n**Current Users (${userIds.length}):**\n${formatUserList(userIds)}`)
    .setFooter({ text: `Quest System \u2014 ${title}` })
    .setTimestamp();
  return embed;
}

function buildRoleManageEmbed(title, emoji, roleIds, groupName) {
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setColor(0x2B6CB0)
    .setDescription(`Manage ${groupName} below.\n\n**Current Roles (${roleIds.length}):**\n${formatRoleList(roleIds)}`)
    .setFooter({ text: `Quest System \u2014 ${title}` })
    .setTimestamp();
  return embed;
}

function buildRoleManageComponents(roleIds, selAddId, selRemoveId) {
  const rows = []
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

export function isQuestButton(customId) {
  return customId.startsWith(PREFIX) && customId.includes(':btn:');
}

export function isQuestSelect(customId) {
  return customId.startsWith(PREFIX) && customId.includes(':sel:');
}

export function isQuestModal(customId) {
  return customId === MODAL.coinSettings;
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
      components: buildTraineeUserComponents(ids),
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
      components: buildTrainerUserComponents(ids),
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
  if (customId === BTN.coinSettings) {
    const cfg = await getQuestConfig(guildId);
    if (!cfg) { await safeReply(interaction, '\u274C Database error.'); return; }
    const modal = new ModalBuilder()
      .setCustomId(MODAL.coinSettings)
      .setTitle('Promote Coin Settings');
    const ppcInput = new TextInputBuilder()
      .setCustomId(MODAL_FIELD.pointsPerCoin)
      .setLabel('Points Required Per Promote Coin')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setValue(String(cfg.pointsPerPromoteCoin));
    const cfpInput = new TextInputBuilder()
      .setCustomId(MODAL_FIELD.coinsForPromotion)
      .setLabel('Promote Coins Required for Promotion')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setValue(String(cfg.promoteCoinsForPromotion));
    const cfdInput = new TextInputBuilder()
      .setCustomId(MODAL_FIELD.coinsForDemotion)
      .setLabel('Promote Coins Required for Demotion')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setValue(String(cfg.promoteCoinsForDemotion));
    modal.addComponents(
      new ActionRowBuilder().addComponents(ppcInput),
      new ActionRowBuilder().addComponents(cfpInput),
      new ActionRowBuilder().addComponents(cfdInput),
    );
    try {
      await interaction.showModal(modal);
    } catch (err) {
      console.error('[QUEST PANEL] Failed to show coin settings modal:', err);
      await safeReply(interaction, '\u274C Failed to open the settings form. Please try again.');
    }
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
      components: buildTraineeUserComponents(ids),
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
      components: buildTraineeUserComponents(ids),
    });
    await safeReply(interaction, '\u2705 Removed 1 trainee user.');
    return;
  }
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
      components: buildTrainerUserComponents(ids),
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
      components: buildTrainerUserComponents(ids),
    });
    await safeReply(interaction, '\u2705 Removed 1 trainer user.');
    return;
  }
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
  await safeReply(interaction, '\u274C Unknown selection.');
}

export async function handleQuestModal(interaction) {
  if (!hasAdmin(interaction)) {
    await safeReply(interaction, '\u274C You need **Administrator** permission to manage Quest settings.');
    return;
  }
  const guildId = interaction.guild.id;
  if (interaction.customId === MODAL.coinSettings) {
    const ppcRaw = interaction.fields.getTextInputValue(MODAL_FIELD.pointsPerCoin).trim();
    const cfpRaw = interaction.fields.getTextInputValue(MODAL_FIELD.coinsForPromotion).trim();
    const cfdRaw = interaction.fields.getTextInputValue(MODAL_FIELD.coinsForDemotion).trim();
    const ppc = parseInt(ppcRaw, 10);
    const cfp = parseInt(cfpRaw, 10);
    const cfd = parseInt(cfdRaw, 10);
    if (Number.isNaN(ppc)) { await safeReply(interaction, '\u274C **Points Required Per Promote Coin** must be a valid number.'); return; }
    if (Number.isNaN(cfp)) { await safeReply(interaction, '\u274C **Promote Coins Required for Promotion** must be a valid number.'); return; }
    if (Number.isNaN(cfd)) { await safeReply(interaction, '\u274C **Promote Coins Required for Demotion** must be a valid number.'); return; }
    if (ppc <= 0) { await safeReply(interaction, '\u274C **Points Required Per Promote Coin** must be greater than 0.'); return; }
    const updated = await saveQuestConfig(guildId, {
      pointsPerPromoteCoin: ppc,
      promoteCoinsForPromotion: cfp,
      promoteCoinsForDemotion: cfd,
    });
    if (!updated) { await safeReply(interaction, '\u274C Failed to save coin settings. Please try again.'); return; }
    await safeUpdate(interaction, {
      embeds: [buildMainEmbed(updated)],
      components: buildMainButtons(),
    });
    await safeReply(interaction, '\u2705 Promote coin settings saved.');
    return;
  }
  await safeReply(interaction, '\u274C Unknown form submission.');
}

function buildTraineeUserComponents(userIds) {
  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(SEL.traineeUsers)
        .setPlaceholder('Select users to add...')
        .setMinValues(1)
        .setMaxValues(25),
    ),
  );
  if (userIds && userIds.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(SEL.traineeUsersRemove)
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

function buildTrainerUserComponents(userIds) {
  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(SEL.trainerUsers)
        .setPlaceholder('Select users to add...')
        .setMinValues(1)
        .setMaxValues(25),
    ),
  );
  if (userIds && userIds.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(SEL.trainerUsersRemove)
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
