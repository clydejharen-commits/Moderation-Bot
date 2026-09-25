import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('dm')
  .setDescription('Send a direct message to a user. Administrator only.')
  .addUserOption((opt) =>
    opt
      .setName('user')
      .setDescription('The Discord user to send the message to.')
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('text')
      .setDescription('The message to send.')
      .setRequired(true)
      .setMaxLength(2000),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '\u274C You need **Administrator** permission to use this command.', ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser('user');
  const text = interaction.options.getString('text');

  try {
    await targetUser.send(text);
    await interaction.reply({ content: `\u2705 Message sent to **${targetUser.tag}**.`, ephemeral: true });
  } catch (err) {
    console.error('[DM CMD] Failed to send DM:', err.message);
    await interaction.reply({ content: `\u274C Could not send a DM to **${targetUser.tag}**. They may have DMs disabled or the bot cannot reach them.`, ephemeral: true });
  }
}
