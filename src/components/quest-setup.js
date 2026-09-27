import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
} from 'discord.js';
import { QuestConfig } from '../db/models/QuestConfig.js';

const setupPanels = new Map();

function panelKey(userId, channelId) {
  return `${userId}:${channelId}`;
}

function getPanel(userId, channelId) {
  return setupPanels.get(panelKey(userId, channelId)) || null;
}

function setPanel(userId, channelId, guildId) {
  setupPanels.set(panelKey(userId, channelId), { userId, channelId, guildId });
}

function deletePanel(userId, channelId) {
  setupPanels.delete(panelKey(userId, channelId));
}

export function isQuestSetupButton(customId) {
  return customId.startsWith('quest_setup_') ||
    customId.startsWith('quest_select_') ||
    customId.startsWith('quest_remove_');
}

export function isQuestSetupModal(customId) {
  return customId.startsWith('quest_modal_');
}

export function isQuestSetupSelect(customId) {
  return customId.startsWith('quest_select_') || customId.startsWith('quest_remove_');
}

export function registerQuestSetup(userId, channelId, guildId) {
  setPanel(userId, channelId, guildId);
}

async function getOrCreateConfig(guildId) {
  let config = await QuestConfig.findOne({ guildId }).lean();
  if (!config) {
    config = await QuestConfig.findOneAndUpdate(
      { guildId },
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }
  return config;
}

function formatUserList(users) {
  if (!users || users.length === 0) return 'None';
  return users.map((id) => `<@${id}>`).join(', ');
}

function formatRoleList(roles) {
  if (!roles || roles.length === 0) return 'None';
  return roles.map((id) => `<@&${id}>`).join(', ');
}

export function buildMainPanelForCommand(config) {
  return buildMainPanel(config);
}

function buildMainPanel(config) {
  const embed = new EmbedBuilder()
    .setTitle('Quest System Setup')
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Trainee Users', value: formatUserList(config.traineeUsers), inline: false },
      { name: 'Trainee Roles', value: formatRoleList(config.traineeRoles), inline: false },
      { name: 'Trainer Users', value: formatUserList(config.trainerUsers), inline: false },
      { name: 'Trainer Roles', value: formatRoleList(config.trainerRoles), inline: false },
      { name: 'Points Required Per Promote Coin', value: String(config.pointsPerCoin ?? 5), inline: true },
      { name: 'Promote Coins for Promotion', value: String(config.coinsForPromotion ?? 15), inline: true },
      { name: 'Promote Coins for Demotion', value: String(config.coinsForDemotion ?? -5), inline: true },
    )
    .setFooter({ text: 'Only you can interact with this panel.' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_trainee_users_add').setLabel('➕ Trainee Users').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_trainee_users_remove').setLabel('➖ Remove Trainee User').setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_trainee_roles_add').setLabel('➕ Trainee Roles').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_trainee_roles_remove').setLabel('➖ Remove Trainee Role').setStyle(ButtonStyle.Danger),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_trainer_users_add').setLabel('➕ Trainer Users').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_trainer_users_remove').setLabel('➖ Remove Trainer User').setStyle(ButtonStyle.Danger),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_trainer_roles_add').setLabel('➕ Trainer Roles').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_trainer_roles_remove').setLabel('➖ Remove Trainer Role').setStyle(ButtonStyle.Danger),
  );

  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_points_per_coin').setLabel('Points Per Coin').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quest_setup_coins_promotion').setLabel('Coins: Promotion').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quest_setup_coins_demotion').setLabel('Coins: Demotion').setStyle(ButtonStyle.Secondary),
  );

  const row6 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_done').setLabel('✅ Done').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('quest_setup_cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5, row6] };
}

async function refreshPanel(interaction, guildId) {
  const config = await getOrCreateConfig(guildId);
  const panelData = buildMainPanel(config);
  await interaction.editReply({ ...panelData });
}

export async function handleQuestSetupButton(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  if (customId === 'quest_setup_cancel') {
    deletePanel(userId, channelId);
    await interaction.update({ embeds: [], components: [], content: '❌ Quest setup cancelled.' });
    return;
  }

  if (customId === 'quest_setup_done') {
    deletePanel(userId, channelId);
    await interaction.update({ embeds: [], components: [], content: '✅ Quest setup complete. All settings have been saved.' });
    return;
  }

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
    return;
  }

  switch (customId) {
    case 'quest_setup_trainee_users_add':
      await showUserSelect(interaction, 'quest_select_trainee_users', 'Add Trainee Users', 'Select users to add as trainees');
      break;
    case 'quest_setup_trainee_roles_add':
      await showRoleSelect(interaction, 'quest_select_trainee_roles', 'Add Trainee Roles', 'Select roles to add as trainee roles');
      break;
    case 'quest_setup_trainer_users_add':
      await showUserSelect(interaction, 'quest_select_trainer_users', 'Add Trainer Users', 'Select users to add as trainers');
      break;
    case 'quest_setup_trainer_roles_add':
      await showRoleSelect(interaction, 'quest_select_trainer_roles', 'Add Trainer Roles', 'Select roles to add as trainer roles');
      break;

    case 'quest_setup_trainee_users_remove':
      await showRemoveUserSelect(interaction, panel.guildId, 'traineeUsers', 'quest_remove_trainee_users', 'Remove Trainee Users', 'Select trainee users to remove');
      break;
    case 'quest_setup_trainee_roles_remove':
      await showRemoveRoleSelect(interaction, panel.guildId, 'traineeRoles', 'quest_remove_trainee_roles', 'Remove Trainee Roles', 'Select trainee roles to remove');
      break;
    case 'quest_setup_trainer_users_remove':
      await showRemoveUserSelect(interaction, panel.guildId, 'trainerUsers', 'quest_remove_trainer_users', 'Remove Trainer Users', 'Select trainer users to remove');
      break;
    case 'quest_setup_trainer_roles_remove':
      await showRemoveRoleSelect(interaction, panel.guildId, 'trainerRoles', 'quest_remove_trainer_roles', 'Remove Trainer Roles', 'Select trainer roles to remove');
      break;

    case 'quest_setup_points_per_coin':
      await showCoinModal(interaction, panel.guildId, 'points_per_coin');
      break;
    case 'quest_setup_coins_promotion':
      await showCoinModal(interaction, panel.guildId, 'coins_promotion');
      break;
    case 'quest_setup_coins_demotion':
      await showCoinModal(interaction, panel.guildId, 'coins_demotion');
      break;
  }
}

async function showUserSelect(interaction, customId, title, placeholder) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(25);

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: `**${title}**\nSelect one or more users to add:`, components: [row], ephemeral: true });
}

async function showRoleSelect(interaction, customId, title, placeholder) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(25);

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: `**${title}**\nSelect one or more roles to add:`, components: [row], ephemeral: true });
}

async function showRemoveUserSelect(interaction, guildId, field, customId, title, placeholder) {
  const config = await getOrCreateConfig(guildId);
  const current = config[field] || [];

  if (current.length === 0) {
    await interaction.reply({ content: `❌ No ${title.toLowerCase()} to remove.`, ephemeral: true });
    return;
  }

  const select = new UserSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(current.length);

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: `**${title}**\nCurrently selected: ${current.map((id) => `<@${id}>`).join(', ')}\nSelect users to remove:`, components: [row], ephemeral: true });
}

async function showRemoveRoleSelect(interaction, guildId, field, customId, title, placeholder) {
  const config = await getOrCreateConfig(guildId);
  const current = config[field] || [];

  if (current.length === 0) {
    await interaction.reply({ content: `❌ No ${title.toLowerCase()} to remove.`, ephemeral: true });
    return;
  }

  const select = new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(current.length);

  const row = new ActionRowBuilder().addComponents(select);
  await interaction.reply({ content: `**${title}**\nCurrently selected: ${current.map((id) => `<@&${id}>`).join(', ')}\nSelect roles to remove:`, components: [row], ephemeral: true });
}

async function showCoinModal(interaction, guildId, type) {
  const config = await getOrCreateConfig(guildId);

  const modalMap = {
    points_per_coin: {
      modalId: 'quest_modal_points_per_coin',
      fieldId: 'quest_points_per_coin_value',
      title: 'Points Required Per Promote Coin',
      label: 'Points per coin (1 or higher)',
      value: String(config.pointsPerCoin ?? 5),
    },
    coins_promotion: {
      modalId: 'quest_modal_coins_promotion',
      fieldId: 'quest_coins_promotion_value',
      title: 'Promote Coins Required for Promotion',
      label: 'Coins for promotion',
      value: String(config.coinsForPromotion ?? 15),
    },
    coins_demotion: {
      modalId: 'quest_modal_coins_demotion',
      fieldId: 'quest_coins_demotion_value',
      title: 'Promote Coins Required for Demotion',
      label: 'Coins for demotion (negative = below threshold)',
      value: String(config.coinsForDemotion ?? -5),
    },
  };

  const m = modalMap[type];
  const modal = new ModalBuilder().setCustomId(m.modalId).setTitle(m.title);
  const input = new TextInputBuilder()
    .setCustomId(m.fieldId)
    .setLabel(m.label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(6)
    .setValue(m.value);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleQuestSetupSelect(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
    return;
  }

  const addField = async (field, values) => {
    await interaction.deferUpdate();
    try {
      await QuestConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { $addToSet: { [field]: { $each: values } } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    await refreshPanel(interaction, panel.guildId);
  };

  const removeField = async (field, values) => {
    await interaction.deferUpdate();
    try {
      await QuestConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { $pull: { [field]: { $in: values } } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    await refreshPanel(interaction, panel.guildId);
  };

  switch (customId) {
    case 'quest_select_trainee_users':
      await addField('traineeUsers', interaction.values);
      break;
    case 'quest_select_trainee_roles':
      await addField('traineeRoles', interaction.values);
      break;
    case 'quest_select_trainer_users':
      await addField('trainerUsers', interaction.values);
      break;
    case 'quest_select_trainer_roles':
      await addField('trainerRoles', interaction.values);
      break;
    case 'quest_remove_trainee_users':
      await removeField('traineeUsers', interaction.values);
      break;
    case 'quest_remove_trainee_roles':
      await removeField('traineeRoles', interaction.values);
      break;
    case 'quest_remove_trainer_users':
      await removeField('trainerUsers', interaction.values);
      break;
    case 'quest_remove_trainer_roles':
      await removeField('trainerRoles', interaction.values);
      break;
  }
}

export async function handleQuestSetupModal(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  const panel = getPanel(userId, channelId);
  if (!panel) {
    await interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
    return;
  }

  if (customId === 'quest_modal_points_per_coin') {
    const raw = interaction.fields.getTextInputValue('quest_points_per_coin_value').trim();
    const value = parseInt(raw, 10);
    if (Number.isNaN(value) || value < 1) {
      await interaction.reply({ content: '❌ Points per coin must be a whole number of 1 or higher.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      await QuestConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { pointsPerCoin: value },
        { upsert: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    await refreshPanel(interaction, panel.guildId);
    await interaction.followUp({ content: `✅ Points Required Per Promote Coin set to ${value}.`, ephemeral: true });
    return;
  }

  if (customId === 'quest_modal_coins_promotion') {
    const raw = interaction.fields.getTextInputValue('quest_coins_promotion_value').trim();
    const value = parseInt(raw, 10);
    if (Number.isNaN(value)) {
      await interaction.reply({ content: '❌ Promotion coins must be a whole number.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      await QuestConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { coinsForPromotion: value },
        { upsert: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    await refreshPanel(interaction, panel.guildId);
    await interaction.followUp({ content: `✅ Promote Coins Required for Promotion set to ${value}.`, ephemeral: true });
    return;
  }

  if (customId === 'quest_modal_coins_demotion') {
    const raw = interaction.fields.getTextInputValue('quest_coins_demotion_value').trim();
    const value = parseInt(raw, 10);
    if (Number.isNaN(value)) {
      await interaction.reply({ content: '❌ Demotion coins must be a whole number.', ephemeral: true });
      return;
    }
    await interaction.deferUpdate();
    try {
      await QuestConfig.findOneAndUpdate(
        { guildId: panel.guildId },
        { coinsForDemotion: value },
        { upsert: true, setDefaultsOnInsert: true },
      );
    } catch {
      await interaction.editReply({ content: '❌ Database error.', embeds: [], components: [] });
      return;
    }
    await refreshPanel(interaction, panel.guildId);
    await interaction.followUp({ content: `✅ Promote Coins Required for Demotion set to ${value}.`, ephemeral: true });
    return;
  }
}
