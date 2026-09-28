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
  StringSelectMenuBuilder,
} from 'discord.js';
import { QuestConfig } from '../db/models/QuestConfig.js';

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

export function buildMainPanel(config) {
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
    new ButtonBuilder().setCustomId('quest_setup_add_trainee_users').setLabel('➕ Trainee Users').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_remove_trainee_users').setLabel('➖ Remove').setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_add_trainee_roles').setLabel('➕ Trainee Roles').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_remove_trainee_roles').setLabel('➖ Remove').setStyle(ButtonStyle.Danger),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_add_trainer_users').setLabel('➕ Trainer Users').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_remove_trainer_users').setLabel('➖ Remove').setStyle(ButtonStyle.Danger),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_add_trainer_roles').setLabel('➕ Trainer Roles').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('quest_setup_remove_trainer_roles').setLabel('➖ Remove').setStyle(ButtonStyle.Danger),
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

export function isQuestSetupButton(customId) {
  return customId.startsWith('quest_setup_');
}

export function isQuestSetupModal(customId) {
  return customId.startsWith('quest_modal_');
}

export function isQuestSetupSelect(customId) {
  return customId.startsWith('quest_select_');
}

async function showAddUserSelect(interaction, customId, title) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select users to add')
    .setMinValues(1)
    .setMaxValues(25);

  const row = new ActionRowBuilder().addComponents(select);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
  );

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2ECC71)
    .setDescription('Select one or more users to add.');

  try {
    await interaction.update({ embeds: [embed], components: [row, backRow] });
  } catch (err) {
    console.error('[QUEST SETUP] Failed to show user select:', err.message);
  }
}

async function showAddRoleSelect(interaction, customId, title) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select roles to add')
    .setMinValues(1)
    .setMaxValues(25);

  const row = new ActionRowBuilder().addComponents(select);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
  );

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x2ECC71)
    .setDescription('Select one or more roles to add.');

  try {
    await interaction.update({ embeds: [embed], components: [row, backRow] });
  } catch (err) {
    console.error('[QUEST SETUP] Failed to show role select:', err.message);
  }
}

async function showRemoveUserSelect(interaction, field, customId, title) {
  let config;
  try {
    config = await getOrCreateConfig(interaction.guild.id);
  } catch (err) {
    console.error('[QUEST SETUP] Failed to fetch config:', err.message);
    await interaction.reply({ content: '❌ Database error. Please run `/quest set` again.', ephemeral: true });
    return;
  }

  const current = config[field] || [];

  if (current.length === 0) {
    await interaction.reply({ content: `❌ No ${title.toLowerCase()} to remove.`, ephemeral: true });
    return;
  }

  const options = [];
  for (const userId of current) {
    let label = userId;
    try {
      const user = await interaction.client.users.fetch(userId);
      label = user.username;
    } catch {
      // use userId
    }
    options.push({ label: label.slice(0, 100), value: userId });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select to remove')
    .setMinValues(1)
    .setMaxValues(Math.min(current.length, 25))
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
  );

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0xE74C3C)
    .setDescription('Select one or more to remove.');

  try {
    await interaction.update({ embeds: [embed], components: [row, backRow] });
  } catch (err) {
    console.error('[QUEST SETUP] Failed to show remove select:', err.message);
  }
}

async function showRemoveRoleSelect(interaction, field, customId, title) {
  let config;
  try {
    config = await getOrCreateConfig(interaction.guild.id);
  } catch (err) {
    console.error('[QUEST SETUP] Failed to fetch config:', err.message);
    await interaction.reply({ content: '❌ Database error. Please run `/quest set` again.', ephemeral: true });
    return;
  }

  const current = config[field] || [];

  if (current.length === 0) {
    await interaction.reply({ content: `❌ No ${title.toLowerCase()} to remove.`, ephemeral: true });
    return;
  }

  const options = [];
  for (const roleId of current) {
    let label = roleId;
    try {
      const role = await interaction.guild.roles.fetch(roleId);
      if (role) label = role.name;
    } catch {
      // use roleId
    }
    options.push({ label: label.slice(0, 100), value: roleId });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select to remove')
    .setMinValues(1)
    .setMaxValues(Math.min(current.length, 25))
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quest_setup_back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
  );

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0xE74C3C)
    .setDescription('Select one or more to remove.');

  try {
    await interaction.update({ embeds: [embed], components: [row, backRow] });
  } catch (err) {
    console.error('[QUEST SETUP] Failed to show remove select:', err.message);
  }
}

async function showCoinModal(interaction, type) {
  let config;
  try {
    config = await getOrCreateConfig(interaction.guild.id);
  } catch (err) {
    console.error('[QUEST SETUP] Failed to fetch config for modal:', err.message);
    await interaction.reply({ content: '❌ Database error. Please run `/quest set` again.', ephemeral: true });
    return;
  }

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
  if (!m) return;

  const modal = new ModalBuilder().setCustomId(m.modalId).setTitle(m.title);
  const input = new TextInputBuilder()
    .setCustomId(m.fieldId)
    .setLabel(m.label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(6)
    .setValue(m.value);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  try {
    await interaction.showModal(modal);
  } catch (err) {
    console.error('[QUEST SETUP] Failed to show modal:', err.message);
  }
}

export async function handleQuestSetupButton(interaction) {
  const customId = interaction.customId;

  try {
    switch (customId) {
      case 'quest_setup_done':
        await interaction.update({ content: '✅ Quest setup complete. All settings have been saved.', embeds: [], components: [] });
        return;
      case 'quest_setup_cancel':
        await interaction.update({ content: '❌ Quest setup cancelled.', embeds: [], components: [] });
        return;
      case 'quest_setup_back': {
        const config = await getOrCreateConfig(interaction.guild.id);
        const panel = buildMainPanel(config);
        await interaction.update({ ...panel });
        return;
      }
      case 'quest_setup_add_trainee_users':
        await showAddUserSelect(interaction, 'quest_select_add_trainee_users', 'Add Trainee Users');
        return;
      case 'quest_setup_add_trainee_roles':
        await showAddRoleSelect(interaction, 'quest_select_add_trainee_roles', 'Add Trainee Roles');
        return;
      case 'quest_setup_add_trainer_users':
        await showAddUserSelect(interaction, 'quest_select_add_trainer_users', 'Add Trainer Users');
        return;
      case 'quest_setup_add_trainer_roles':
        await showAddRoleSelect(interaction, 'quest_select_add_trainer_roles', 'Add Trainer Roles');
        return;
      case 'quest_setup_remove_trainee_users':
        await showRemoveUserSelect(interaction, 'traineeUsers', 'quest_select_remove_trainee_users', 'Remove Trainee Users');
        return;
      case 'quest_setup_remove_trainee_roles':
        await showRemoveRoleSelect(interaction, 'traineeRoles', 'quest_select_remove_trainee_roles', 'Remove Trainee Roles');
        return;
      case 'quest_setup_remove_trainer_users':
        await showRemoveUserSelect(interaction, 'trainerUsers', 'quest_select_remove_trainer_users', 'Remove Trainer Users');
        return;
      case 'quest_setup_remove_trainer_roles':
        await showRemoveRoleSelect(interaction, 'trainerRoles', 'quest_select_remove_trainer_roles', 'Remove Trainer Roles');
        return;
      case 'quest_setup_points_per_coin':
        await showCoinModal(interaction, 'points_per_coin');
        return;
      case 'quest_setup_coins_promotion':
        await showCoinModal(interaction, 'coins_promotion');
        return;
      case 'quest_setup_coins_demotion':
        await showCoinModal(interaction, 'coins_demotion');
        return;
    }
  } catch (err) {
    console.error('[QUEST SETUP] Button error:', err.message);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ An error occurred. Please run `/quest set` again.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ An error occurred. Please run `/quest set` again.', ephemeral: true });
      }
    } catch {
      // interaction expired
    }
  }
}

export async function handleQuestSetupSelect(interaction) {
  const customId = interaction.customId;
  const guildId = interaction.guild.id;
  const values = interaction.values;

  const operations = {
    'quest_select_add_trainee_users': { field: 'traineeUsers', op: 'add' },
    'quest_select_add_trainee_roles': { field: 'traineeRoles', op: 'add' },
    'quest_select_add_trainer_users': { field: 'trainerUsers', op: 'add' },
    'quest_select_add_trainer_roles': { field: 'trainerRoles', op: 'add' },
    'quest_select_remove_trainee_users': { field: 'traineeUsers', op: 'remove' },
    'quest_select_remove_trainee_roles': { field: 'traineeRoles', op: 'remove' },
    'quest_select_remove_trainer_users': { field: 'trainerUsers', op: 'remove' },
    'quest_select_remove_trainer_roles': { field: 'trainerRoles', op: 'remove' },
  };

  const operation = operations[customId];
  if (!operation) return;

  try {
    if (operation.op === 'add') {
      await QuestConfig.findOneAndUpdate(
        { guildId },
        { $addToSet: { [operation.field]: { $each: values } } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    } else {
      await QuestConfig.findOneAndUpdate(
        { guildId },
        { $pull: { [operation.field]: { $in: values } } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
  } catch (err) {
    console.error('[QUEST SETUP] Database error:', err.message);
    try {
      await interaction.update({ content: '❌ Database error. Please run `/quest set` again.', embeds: [], components: [] });
    } catch {
      // interaction expired
    }
    return;
  }

  let config;
  try {
    config = await getOrCreateConfig(guildId);
  } catch (err) {
    console.error('[QUEST SETUP] Failed to fetch config for refresh:', err.message);
    try {
      await interaction.update({ content: '❌ Failed to reload settings. Please run `/quest set` again.', embeds: [], components: [] });
    } catch {
      // interaction expired
    }
    return;
  }

  const panel = buildMainPanel(config);
  try {
    await interaction.update({ ...panel });
  } catch (err) {
    console.error('[QUEST SETUP] Failed to update panel:', err.message);
  }
}

export async function handleQuestSetupModal(interaction) {
  const customId = interaction.customId;
  const guildId = interaction.guild.id;

  try {
    if (customId === 'quest_modal_points_per_coin') {
      const raw = interaction.fields.getTextInputValue('quest_points_per_coin_value').trim();
      const value = parseInt(raw, 10);
      if (Number.isNaN(value) || value < 1) {
        await interaction.reply({ content: '❌ Points per coin must be a whole number of 1 or higher.', ephemeral: true });
        return;
      }
      await QuestConfig.findOneAndUpdate(
        { guildId },
        { pointsPerCoin: value },
        { upsert: true, setDefaultsOnInsert: true },
      );
      const config = await getOrCreateConfig(guildId);
      const panel = buildMainPanel(config);
      await interaction.update({ ...panel });
      return;
    }

    if (customId === 'quest_modal_coins_promotion') {
      const raw = interaction.fields.getTextInputValue('quest_coins_promotion_value').trim();
      const value = parseInt(raw, 10);
      if (Number.isNaN(value)) {
        await interaction.reply({ content: '❌ Promotion coins must be a whole number.', ephemeral: true });
        return;
      }
      await QuestConfig.findOneAndUpdate(
        { guildId },
        { coinsForPromotion: value },
        { upsert: true, setDefaultsOnInsert: true },
      );
      const config = await getOrCreateConfig(guildId);
      const panel = buildMainPanel(config);
      await interaction.update({ ...panel });
      return;
    }

    if (customId === 'quest_modal_coins_demotion') {
      const raw = interaction.fields.getTextInputValue('quest_coins_demotion_value').trim();
      const value = parseInt(raw, 10);
      if (Number.isNaN(value)) {
        await interaction.reply({ content: '❌ Demotion coins must be a whole number.', ephemeral: true });
        return;
      }
      await QuestConfig.findOneAndUpdate(
        { guildId },
        { coinsForDemotion: value },
        { upsert: true, setDefaultsOnInsert: true },
      );
      const config = await getOrCreateConfig(guildId);
      const panel = buildMainPanel(config);
      await interaction.update({ ...panel });
      return;
    }
  } catch (err) {
    console.error('[QUEST SETUP] Modal error:', err.message);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ An error occurred. Please run `/quest set` again.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ An error occurred. Please run `/quest set` again.', ephemeral: true });
      }
    } catch {
      // interaction expired
    }
  }
}
