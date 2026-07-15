// ============================================================
//  ____  _                       _   ____        _
// |  _ \(_)___  ___ ___  _ __ __| | | __ )  ___ | |_
// | | | | / __|/ __/ _ \| '__/ _` | |  _ \ / _ \| __|
// | |_| | \__ \ (_| (_) | | | (_| | | |_) | (_) | |_
// |____/|_|___/\___\___/|_|  \__,_| |____/ \___/ \__|
//
//  Bot Discord Completo - Português de Portugal
//  Versão: 2.0.0
//  Criado com: discord.js v14 + SQLite + Express.js
// ============================================================
// 
//  ⚙️  CONFIGURAÇÃO - COLOCA AQUI OS TEUS DADOS:
//
//  TOKEN     → Linha ~50  (process.env.TOKEN ou diretamente)
//  CLIENT_ID → Linha ~51
//  SECRET    → Linha ~53  (Discord OAuth2 Secret)
//  (GUILD_ID removido — bot global em todos os servidores)
//
// ============================================================

'use strict';

// ============================
// IMPORTAÇÕES
// ============================
const {
  Client, GatewayIntentBits, Partials, Collection,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionFlagsBits, ChannelType,
  InteractionType, Events, REST, Routes, SlashCommandBuilder,
  AttachmentBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder,
  ActivityType
} = require('discord.js');

const Database = require('better-sqlite3');
const express  = require('express');
const session  = require('express-session');
const axios    = require('axios');
const path     = require('path');
const fs       = require('fs');
const cron     = require('node-cron');

// ============================
// ⚙️ CONFIGURAÇÃO PRINCIPAL
// ============================
// 🔴 COLOCA O TEU TOKEN AQUI (ou usa variáveis de ambiente)
const CONFIG = {
  TOKEN:         process.env.TOKEN,
  CLIENT_ID:     process.env.CLIENT_ID,
  // GUILD_ID removido → comandos globais (funcionam em todos os servidores)
  CLIENT_SECRET: process.env.CLIENT_SECRET,
  DASHBOARD_PORT: process.env.PORT         || 3000,
  // URL do teu dashboard (Render, etc.)
  REDIRECT_URI:  process.env.REDIRECT_URI  || 'http://localhost:3000/auth/callback',
  SESSION_SECRET: process.env.SESSION_SECRET || 'segredo_super_secreto_muda_isto',
  // Prefixo de comandos legados (opcional)
  PREFIX: '!',
  // Cor padrão dos embeds
  COR_PRINCIPAL: '#5865F2',
  COR_SUCESSO:   '#57F287',
  COR_ERRO:      '#ED4245',
  COR_AVISO:     '#FEE75C',
  // 🔧 Dashboard web (Express): desativado por defeito para poupar RAM.
  // Põe DASHBOARD_ATIVO=true nas variáveis de ambiente se quiseres voltar a ligá-lo.
  DASHBOARD_ATIVO: process.env.DASHBOARD_ATIVO === 'true',
};

// ============================
// VERIFICAÇÃO DE VARIÁVEIS OBRIGATÓRIAS
// ============================
if (!CONFIG.TOKEN || !CONFIG.CLIENT_ID) {
  console.error('❌ Faltam variáveis de ambiente obrigatórias: TOKEN e/ou CLIENT_ID.');
  console.error('👉 No Render, define-as em Environment > Environment Variables.');
  process.exit(1);
}

// ============================
// BASE DE DADOS SQLite
// ============================
const db = new Database('./discord_bot.db');

// Ativa WAL para melhor performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('📦 Base de dados SQLite carregada.');

// ============================
// INICIALIZAÇÃO DAS TABELAS
// ============================
function initDatabase() {
  // Tabela de configuração geral do servidor
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id      TEXT PRIMARY KEY,
      prefix        TEXT DEFAULT '!',
      log_channel   TEXT,
      mod_log       TEXT,
      welcome_channel TEXT,
      welcome_msg   TEXT,
      welcome_embed INTEGER DEFAULT 1,
      autorole      TEXT,
      language      TEXT DEFAULT 'pt',
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tabela de tickets
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_config (
      guild_id          TEXT PRIMARY KEY,
      category_id       TEXT,
      log_channel       TEXT,
      support_role      TEXT,
      max_tickets       INTEGER DEFAULT 3,
      panel_msg_id      TEXT,
      panel_channel_id  TEXT,
      transcript_channel TEXT,
      welcome_msg       TEXT DEFAULT 'Olá {user}! O teu ticket foi criado. A nossa equipa irá responder brevemente.',
      enabled           INTEGER DEFAULT 1
    );
  `);

  // Tipos de ticket (select menu)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      label       TEXT NOT NULL,
      description TEXT,
      emoji       TEXT,
      category_id TEXT,
      support_role TEXT,
      color       TEXT DEFAULT '#5865F2',
      order_num   INTEGER DEFAULT 0
    );
  `);

  // Tickets abertos
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      TEXT NOT NULL,
      channel_id    TEXT UNIQUE NOT NULL,
      user_id       TEXT NOT NULL,
      claimed_by    TEXT,
      type_id       INTEGER,
      status        TEXT DEFAULT 'open',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at     DATETIME,
      ticket_number INTEGER,
      subject       TEXT
    );
  `);

  // Participantes adicionais no ticket
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_users (
      ticket_id  INTEGER,
      user_id    TEXT,
      added_by   TEXT,
      added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (ticket_id, user_id)
    );
  `);

  // Avaliações de staff
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_ratings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      staff_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      ticket_id  INTEGER,
      rating     INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment    TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Server Stats
  db.exec(`
    CREATE TABLE IF NOT EXISTS server_stats (
      guild_id          TEXT PRIMARY KEY,
      category_id       TEXT,
      members_channel   TEXT,
      bots_channel      TEXT,
      channels_channel  TEXT,
      roles_channel     TEXT,
      online_channel    TEXT,
      boosts_channel    TEXT,
      enabled           INTEGER DEFAULT 1,
      update_interval   INTEGER DEFAULT 5
    );
  `);

  // Reaction Roles
  db.exec(`
    CREATE TABLE IF NOT EXISTS reaction_roles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      message_id  TEXT NOT NULL,
      emoji       TEXT NOT NULL,
      role_id     TEXT NOT NULL,
      type        TEXT DEFAULT 'normal',
      UNIQUE(message_id, emoji)
    );
  `);

  // Painéis de Reaction Role criados via Dashboard (1 mensagem + vários emoji->cargo)
  db.exec(`
    CREATE TABLE IF NOT EXISTS reaction_role_panels (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      message_id  TEXT,
      conteudo    TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Moderação - Warns
  db.exec(`
    CREATE TABLE IF NOT EXISTS warns (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      mod_id      TEXT NOT NULL,
      reason      TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Moderação - Mutes
  db.exec(`
    CREATE TABLE IF NOT EXISTS mutes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      mod_id      TEXT NOT NULL,
      reason      TEXT,
      expires_at  DATETIME,
      active      INTEGER DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Mod Log
  db.exec(`
    CREATE TABLE IF NOT EXISTS mod_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      action      TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      mod_id      TEXT NOT NULL,
      reason      TEXT,
      duration    TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Sugestões
  db.exec(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      channel_id   TEXT NOT NULL,
      message_id   TEXT,
      user_id      TEXT NOT NULL,
      content      TEXT NOT NULL,
      status       TEXT DEFAULT 'pending',
      votes_up     INTEGER DEFAULT 0,
      votes_down   INTEGER DEFAULT 0,
      mod_response TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Votos nas sugestões
  db.exec(`
    CREATE TABLE IF NOT EXISTS suggestion_votes (
      suggestion_id INTEGER,
      user_id       TEXT,
      vote          TEXT,
      PRIMARY KEY(suggestion_id, user_id)
    );
  `);

  // Config de sugestões
  db.exec(`
    CREATE TABLE IF NOT EXISTS suggestion_config (
      guild_id   TEXT PRIMARY KEY,
      channel_id TEXT,
      log_channel TEXT,
      enabled    INTEGER DEFAULT 1,
      ping_role  TEXT
    );
  `);

  // AntiSpam
  db.exec(`
    CREATE TABLE IF NOT EXISTS antispam_config (
      guild_id        TEXT PRIMARY KEY,
      enabled         INTEGER DEFAULT 0,
      max_messages    INTEGER DEFAULT 5,
      interval_ms     INTEGER DEFAULT 3000,
      action          TEXT DEFAULT 'mute',
      mute_duration   INTEGER DEFAULT 300,
      anti_links      INTEGER DEFAULT 0,
      anti_invites    INTEGER DEFAULT 0,
      anti_raid       INTEGER DEFAULT 0,
      raid_threshold  INTEGER DEFAULT 10,
      whitelist_roles TEXT DEFAULT '[]',
      whitelist_channels TEXT DEFAULT '[]',
      log_channel     TEXT
    );
  `);

  // Embeds guardados
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_embeds (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      name       TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Sessões do dashboard
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_sessions (
      user_id    TEXT PRIMARY KEY,
      username   TEXT,
      avatar     TEXT,
      token      TEXT,
      guilds     TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Votações
  db.exec(`
    CREATE TABLE IF NOT EXISTS votacao_config (
      guild_id      TEXT PRIMARY KEY,
      channel_id    TEXT NOT NULL,
      tipo          TEXT NOT NULL DEFAULT 'recorrente',
      titulo        TEXT NOT NULL,
      descricao     TEXT NOT NULL,
      opcoes        TEXT NOT NULL,
      hora_inicio   TEXT,
      hora_fim      TEXT NOT NULL,
      data_fim      TEXT,
      message_id    TEXT,
      ativa_hoje    INTEGER DEFAULT 0,
      encerrada_hoje INTEGER DEFAULT 0,
      data_atual    TEXT,
      created_by    TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migração defensiva: adiciona colunas novas se a tabela já existir de uma versão anterior
  const votacaoCols = db.prepare("PRAGMA table_info(votacao_config)").all().map(c => c.name);
  if (!votacaoCols.includes('tipo'))     db.exec("ALTER TABLE votacao_config ADD COLUMN tipo TEXT NOT NULL DEFAULT 'recorrente'");
  if (!votacaoCols.includes('data_fim')) db.exec("ALTER TABLE votacao_config ADD COLUMN data_fim TEXT");

  // Votos do dia (reiniciados a cada nova votação diária)
  db.exec(`
    CREATE TABLE IF NOT EXISTS votacao_votos (
      guild_id   TEXT NOT NULL,
      data       TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      opcao      TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, data, user_id)
    );
  `);

  console.log('✅ Todas as tabelas criadas/verificadas com sucesso.');
}

initDatabase();

// ============================
// CLIENTE DISCORD
// ============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User,
  ],
});

// Coleção de comandos
client.commands = new Collection();

// Map para anti-spam em memória
const spamMap = new Map();
// Map para raid detection
const joinMap  = new Map();

// ============================
// FUNÇÕES UTILITÁRIAS
// ============================

/** Retorna um embed padrão com cor e rodapé */
function embedPadrao(titulo, descricao, cor = CONFIG.COR_PRINCIPAL) {
  return new EmbedBuilder()
    .setTitle(titulo)
    .setDescription(descricao)
    .setColor(cor)
    .setTimestamp()
    .setFooter({ text: 'Discord Bot PT' });
}

/** Loga uma ação de moderação */
function logMod(guildId, action, userId, modId, reason, duration = null) {
  const stmt = db.prepare(`
    INSERT INTO mod_logs (guild_id, action, user_id, mod_id, reason, duration)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(guildId, action, userId, modId, reason, duration);
}

/** Obtém a configuração do servidor */
function getGuildConfig(guildId) {
  let config = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  if (!config) {
    db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
    config = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  }
  return config;
}

/** Envia log para o canal de logs */
async function sendLog(guild, embed) {
  try {
    const config = getGuildConfig(guild.id);
    if (!config?.log_channel) return;
    const ch = guild.channels.cache.get(config.log_channel);
    if (ch) await ch.send({ embeds: [embed] });
  } catch (e) {
    // Silencia erros de log
  }
}

/** Formata duração em texto legível */
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Parseia duração (ex: "10m", "2h", "1d") para ms */
function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const v = parseInt(match[1]);
  const u = match[2].toLowerCase();
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return v * map[u];
}

/** Gera transcript HTML de um canal de ticket */
async function gerarTranscript(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted   = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const linhas = sorted.map(msg => {
      const hora = new Date(msg.createdTimestamp).toLocaleString('pt-PT');
      const anexos = msg.attachments.map(a => `<a href="${a.url}" target="_blank">[Anexo: ${a.name}]</a>`).join(' ');
      const embeds  = msg.embeds.length ? `<span style="color:#aaa">[${msg.embeds.length} embed(s)]</span>` : '';
      return `
        <div class="msg">
          <img class="avatar" src="https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=32" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" />
          <div class="content">
            <span class="author">${msg.author.tag}</span>
            <span class="time">${hora}</span>
            <div class="text">${msg.content || ''} ${embeds} ${anexos}</div>
          </div>
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Transcript - #${channel.name}</title>
  <style>
    body { background: #36393f; color: #dcddde; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; }
    h1   { color: #fff; border-bottom: 1px solid #4f545c; padding-bottom: 10px; }
    .msg { display: flex; align-items: flex-start; margin: 10px 0; padding: 10px; border-radius: 8px; }
    .msg:hover { background: #32353b; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; margin-right: 12px; }
    .author { font-weight: bold; color: #fff; margin-right: 8px; }
    .time   { font-size: 0.75em; color: #72767d; }
    .text   { margin-top: 4px; word-wrap: break-word; }
    a       { color: #00aff4; }
  </style>
</head>
<body>
  <h1>📋 Transcript - #${channel.name}</h1>
  <p style="color:#72767d">Gerado em ${new Date().toLocaleString('pt-PT')} | ${sorted.length} mensagens</p>
  ${linhas}
</body>
</html>`;
  } catch (e) {
    return `<html><body><h1>Erro ao gerar transcript</h1><p>${e.message}</p></body></html>`;
  }
}

// ============================
// SISTEMA DE TICKETS
// ============================

/** Cria um ticket para o utilizador */
async function criarTicket(guild, user, typeId, interaction) {
  const ticketConfig = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guild.id);
  if (!ticketConfig || !ticketConfig.enabled) {
    return { erro: 'O sistema de tickets não está configurado neste servidor.' };
  }

  // Verifica máximo de tickets
  const abertos = db.prepare(`
    SELECT COUNT(*) as c FROM tickets
    WHERE guild_id = ? AND user_id = ? AND status = 'open'
  `).get(guild.id, user.id);

  if (abertos.c >= ticketConfig.max_tickets) {
    return { erro: `Já tens ${ticketConfig.max_tickets} ticket(s) aberto(s). Por favor fecha um antes de criar outro.` };
  }

  // Número do ticket
  const lastTicket = db.prepare('SELECT MAX(ticket_number) as n FROM tickets WHERE guild_id = ?').get(guild.id);
  const ticketNum  = (lastTicket.n || 0) + 1;

  // Tipo de ticket
  const tipo = typeId ? db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(typeId) : null;
  const categoryId = tipo?.category_id || ticketConfig.category_id;

  // Permissões do canal
  const permOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
  ];

  const supportRole = tipo?.support_role || ticketConfig.support_role;
  if (supportRole) {
    permOverwrites.push({
      id: supportRole,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
    });
  }

  // Cria o canal
  const channel = await guild.channels.create({
    name: `ticket-${String(ticketNum).padStart(4, '0')}-${user.username.toLowerCase().replace(/\s/g, '-').substring(0, 15)}`,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: permOverwrites,
    topic: `Ticket de ${user.tag} | #${ticketNum}`,
  });

  // Guarda na BD
  const stmt = db.prepare(`
    INSERT INTO tickets (guild_id, channel_id, user_id, type_id, ticket_number, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `);
  const info = stmt.run(guild.id, channel.id, user.id, typeId || null, ticketNum);
  const ticketId = info.lastInsertRowid;

  // Mensagem de boas-vindas
  const welcomeMsg = (ticketConfig.welcome_msg || 'Olá {user}! O teu ticket foi criado.')
    .replace('{user}', `<@${user.id}>`)
    .replace('{ticket}', ticketNum);

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket #${String(ticketNum).padStart(4, '0')}`)
    .setDescription(welcomeMsg)
    .setColor(CONFIG.COR_PRINCIPAL)
    .addFields(
      { name: '👤 Utilizador', value: `<@${user.id}>`, inline: true },
      { name: '📋 Tipo',      value: tipo?.label || 'Geral', inline: true },
      { name: '📅 Data',      value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
    )
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  // Botões do ticket
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('🙋 Reclamar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_adduser').setLabel('➕ Adicionar').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_removeuser').setLabel('➖ Remover').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_rename').setLabel('✏️ Renomear').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_transcript').setLabel('📄 Transcript').setStyle(ButtonStyle.Secondary),
  );

  await channel.send({
    content: supportRole ? `<@&${supportRole}> | <@${user.id}>` : `<@${user.id}>`,
    embeds: [embed],
    components: [row1, row2],
  });

  return { channel, ticketNum, ticketId };
}

/** Fecha um ticket */
async function fecharTicket(channel, closedBy, guild) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
  if (!ticket) return;

  // Gera transcript
  const html   = await gerarTranscript(channel);
  const buffer = Buffer.from(html, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: `transcript-${ticket.ticket_number}.html` });

  // Envia transcript ao utilizador
  try {
    const user = await client.users.fetch(ticket.user_id);
    const embedUser = embedPadrao(
      '🎫 Ticket Fechado',
      `O teu ticket **#${String(ticket.ticket_number).padStart(4,'0')}** foi fechado.\nAqui está o transcript da conversa:`,
      CONFIG.COR_AVISO
    );
    await user.send({ embeds: [embedUser], files: [attachment] }).catch(() => {});
  } catch (_) {}

  // Envia transcript para o canal de transcripts
  const ticketConfig = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guild.id);
  if (ticketConfig?.transcript_channel) {
    const ch = guild.channels.cache.get(ticketConfig.transcript_channel);
    if (ch) {
      const embed = new EmbedBuilder()
        .setTitle(`📄 Transcript - Ticket #${String(ticket.ticket_number).padStart(4,'0')}`)
        .setColor(CONFIG.COR_AVISO)
        .addFields(
          { name: '👤 Utilizador', value: `<@${ticket.user_id}>`, inline: true },
          { name: '🔒 Fechado por', value: `<@${closedBy}>`, inline: true },
          { name: '📅 Fechado em', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
        )
        .setTimestamp();
      await ch.send({ embeds: [embed], files: [attachment] });
    }
  }

  // Atualiza BD
  db.prepare(`UPDATE tickets SET status='closed', closed_at=CURRENT_TIMESTAMP WHERE channel_id=?`).run(channel.id);

  // Deleta o canal após 5 segundos
  const embed = embedPadrao('🔒 Ticket a Fechar', 'Este ticket será eliminado em **5 segundos**...', CONFIG.COR_ERRO);
  await channel.send({ embeds: [embed] });
  setTimeout(async () => {
    try {
      await channel.delete();
    } catch (err) {
      console.error(`❌ Erro ao eliminar canal do ticket #${ticket.ticket_number} (${channel.id}):`, err.message);
      await channel.send({
        content: `⚠️ Não foi possível eliminar este canal automaticamente (\`${err.message}\`). Verifica se o bot tem a permissão **Gerir Canais** aqui, ou apaga manualmente.`
      }).catch(() => {});
    }
  }, 5000);
}

// ============================
// SISTEMA DE AVALIAÇÃO DE STAFF
// ============================

/** Modal de avaliação de staff */
function criarModalAvaliacao(staffId, ticketId, channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`rating_${staffId}_${ticketId}_${channelId || '0'}`)
    .setTitle('⭐ Avaliar Staff');

  const ratingInput = new TextInputBuilder()
    .setCustomId('rating_value')
    .setLabel('Avaliação (1-5 estrelas)')
    .setPlaceholder('Escreve um número de 1 a 5')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(1);

  const commentInput = new TextInputBuilder()
    .setCustomId('rating_comment')
    .setLabel('Comentário (opcional)')
    .setPlaceholder('Escreve o teu comentário aqui...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ratingInput),
    new ActionRowBuilder().addComponents(commentInput),
  );

  return modal;
}

/** Obtém ranking de staff */
function getRankingStaff(guildId) {
  return db.prepare(`
    SELECT staff_id,
           COUNT(*) as total,
           AVG(rating) as media,
           MIN(rating) as minimo,
           MAX(rating) as maximo
    FROM staff_ratings
    WHERE guild_id = ?
    GROUP BY staff_id
    ORDER BY media DESC, total DESC
    LIMIT 10
  `).all(guildId);
}

// ============================
// SISTEMA DE SERVER STATS
// ============================

/** Cria ou atualiza canais de server stats */
async function setupServerStats(guild, config) {
  let categoryId = config.category_id;

  // Cria categoria se não existir
  if (!categoryId || !guild.channels.cache.get(categoryId)) {
    const cat = await guild.channels.create({
      name: '📊 Server Stats',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.Connect] }
      ]
    });
    categoryId = cat.id;
  }

  const stats = await calcularStats(guild);
  const canais = [
    { key: 'members_channel', nome: `👥 Membros: ${stats.membros}` },
    { key: 'bots_channel',    nome: `🤖 Bots: ${stats.bots}` },
    { key: 'channels_channel',nome: `📢 Canais: ${stats.canais}` },
    { key: 'roles_channel',   nome: `🎭 Cargos: ${stats.cargos}` },
    { key: 'boosts_channel',  nome: `🚀 Boosts: ${stats.boosts}` },
  ];

  const updates = { category_id: categoryId };

  for (const c of canais) {
    let ch = config[c.key] ? guild.channels.cache.get(config[c.key]) : null;
    if (!ch) {
      ch = await guild.channels.create({
        name: c.nome,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.Connect] }
        ]
      });
    } else {
      await ch.setName(c.nome).catch(() => {});
    }
    updates[c.key] = ch.id;
  }

  db.prepare(`
    UPDATE server_stats SET
      category_id=?, members_channel=?, bots_channel=?,
      channels_channel=?, roles_channel=?, boosts_channel=?
    WHERE guild_id=?
  `).run(updates.category_id, updates.members_channel, updates.bots_channel,
         updates.channels_channel, updates.roles_channel, updates.boosts_channel, guild.id);
}

/** Calcula estatísticas do servidor */
async function calcularStats(guild) {
  await guild.members.fetch().catch(() => {});
  const membros = guild.members.cache.filter(m => !m.user.bot).size;
  const bots    = guild.members.cache.filter(m => m.user.bot).size;
  const canais  = guild.channels.cache.size;
  const cargos  = guild.roles.cache.size;
  const boosts  = guild.premiumSubscriptionCount || 0;
  return { membros, bots, canais, cargos, boosts };
}

/** Atualiza todos os canais de stats */
async function atualizarStats(guild) {
  const config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ? AND enabled = 1').get(guild.id);
  if (!config) return;

  const stats = await calcularStats(guild);
  const pares = [
    [config.members_channel, `👥 Membros: ${stats.membros}`],
    [config.bots_channel,    `🤖 Bots: ${stats.bots}`],
    [config.channels_channel,`📢 Canais: ${stats.canais}`],
    [config.roles_channel,   `🎭 Cargos: ${stats.cargos}`],
    [config.boosts_channel,  `🚀 Boosts: ${stats.boosts}`],
  ];

  for (const [id, nome] of pares) {
    if (!id) continue;
    const ch = guild.channels.cache.get(id);
    if (ch && ch.name !== nome) {
      await ch.setName(nome).catch(() => {});
    }
  }
}

// ============================
// SISTEMA DE WELCOME
// ============================

/** Envia mensagem de boas-vindas */
async function sendWelcome(member) {
  const config = getGuildConfig(member.guild.id);
  if (!config?.welcome_channel) return;

  const channel = member.guild.channels.cache.get(config.welcome_channel);
  if (!channel) return;

  const msg = (config.welcome_msg || 'Bem-vindo(a) {user} ao servidor!')
    .replace('{user}', `<@${member.id}>`)
    .replace('{server}', member.guild.name)
    .replace('{count}', member.guild.memberCount);

  if (config.welcome_embed) {
    const embed = new EmbedBuilder()
      .setTitle('👋 Bem-vindo(a)!')
      .setDescription(msg)
      .setColor(CONFIG.COR_SUCESSO)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '📅 Conta criada em', value: `<t:${Math.floor(member.user.createdTimestamp/1000)}:R>`, inline: true },
        { name: '👥 Membro nº', value: `**${member.guild.memberCount}**`, inline: true },
      )
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } else {
    await channel.send(msg);
  }

  // Autorole
  if (config.autorole) {
    const role = member.guild.roles.cache.get(config.autorole);
    if (role) await member.roles.add(role).catch(() => {});
  }
}

// ============================
// SISTEMA DE ANTISPAM
// ============================

/** Verifica spam numa mensagem */
async function verificarSpam(message) {
  if (!message.guild || message.author.bot) return;

  const config = db.prepare('SELECT * FROM antispam_config WHERE guild_id = ? AND enabled = 1').get(message.guild.id);
  if (!config) return;

  // Verificar whitelist
  const whitelistRoles    = JSON.parse(config.whitelist_roles || '[]');
  const whitelistChannels = JSON.parse(config.whitelist_channels || '[]');

  if (whitelistChannels.includes(message.channel.id)) return;
  if (message.member?.roles.cache.some(r => whitelistRoles.includes(r.id))) return;

  // Anti-links
  if (config.anti_links) {
    const linkRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;
    if (linkRegex.test(message.content)) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`<@${message.author.id}> ⚠️ Não podes enviar links aqui!`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
  }

  // Anti-invites
  if (config.anti_invites) {
    const inviteRegex = /(discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9]+/gi;
    if (inviteRegex.test(message.content)) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`<@${message.author.id}> ⚠️ Não podes enviar convites de Discord aqui!`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
  }

  // Anti-spam
  const key  = `${message.guild.id}-${message.author.id}`;
  const now  = Date.now();
  const data = spamMap.get(key) || { msgs: [], warned: false };

  data.msgs = data.msgs.filter(t => now - t < config.interval_ms);
  data.msgs.push(now);
  spamMap.set(key, data);

  if (data.msgs.length >= config.max_messages) {
    // Deleta mensagens recentes
    const msgs = await message.channel.messages.fetch({ limit: 10 });
    const spam = msgs.filter(m => m.author.id === message.author.id);
    await message.channel.bulkDelete(spam, true).catch(() => {});

    // Aplica punição
    if (config.action === 'mute' || config.action === 'timeout') {
      const duration = config.mute_duration * 1000;
      await message.member.timeout(duration, 'AutoMod: Spam detectado').catch(() => {});
      const warn = await message.channel.send(
        `<@${message.author.id}> ⚠️ Foste silenciado por **${formatDuration(duration)}** por spam!`
      );
      setTimeout(() => warn.delete().catch(() => {}), 10000);
    } else if (config.action === 'kick') {
      await message.member.kick('AutoMod: Spam detectado').catch(() => {});
    } else if (config.action === 'ban') {
      await message.member.ban({ reason: 'AutoMod: Spam detectado' }).catch(() => {});
    }

    // Loga
    if (config.log_channel) {
      const ch = message.guild.channels.cache.get(config.log_channel);
      if (ch) {
        const embed = embedPadrao(
          '🛡️ AutoMod - Spam Detectado',
          `**Utilizador:** <@${message.author.id}>\n**Canal:** <#${message.channel.id}>\n**Ação:** ${config.action}`,
          CONFIG.COR_ERRO
        );
        await ch.send({ embeds: [embed] });
      }
    }

    spamMap.delete(key);
  }
}

/** Verifica raid (muitos membros a entrar rapidamente) */
async function verificarRaid(member) {
  const config = db.prepare('SELECT * FROM antispam_config WHERE guild_id = ? AND enabled = 1 AND anti_raid = 1').get(member.guild.id);
  if (!config) return;

  const key  = member.guild.id;
  const now  = Date.now();
  const data = joinMap.get(key) || { joins: [], alerted: false };

  data.joins = data.joins.filter(t => now - t < 10000); // 10 segundos
  data.joins.push(now);
  joinMap.set(key, data);

  if (data.joins.length >= config.raid_threshold && !data.alerted) {
    data.alerted = true;
    joinMap.set(key, data);

    if (config.log_channel) {
      const ch = member.guild.channels.cache.get(config.log_channel);
      if (ch) {
        const embed = embedPadrao(
          '🚨 ALERTA DE RAID!',
          `Detectados **${data.joins.length}** membros a entrar em menos de 10 segundos!\n\nConsidera ativar o modo de verificação do servidor!`,
          CONFIG.COR_ERRO
        ).addFields({ name: '⚠️ Ação Recomendada', value: 'Usa `/antispam` para configurar proteção automática' });
        await ch.send({ content: '@here', embeds: [embed] });
      }
    }

    // Reset após 30s
    setTimeout(() => {
      const d = joinMap.get(key);
      if (d) { d.alerted = false; joinMap.set(key, d); }
    }, 30000);
  }
}

// ============================
// DEFINIÇÃO DOS COMANDOS SLASH
// ============================
const commands = [
  // ── Tickets ──
  new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Configura o sistema de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('categoria').setDescription('Categoria para os tickets').setRequired(true))
    .addChannelOption(o => o.setName('log').setDescription('Canal de logs de tickets').setRequired(false))
    .addRoleOption(o => o.setName('suporte').setDescription('Cargo de suporte').setRequired(false))
    .addChannelOption(o => o.setName('transcripts').setDescription('Canal para transcripts').setRequired(false))
    .addIntegerOption(o => o.setName('max').setDescription('Máximo de tickets por utilizador').setRequired(false).setMinValue(1).setMaxValue(10))
    .addStringOption(o => o.setName('mensagem').setDescription('Mensagem de boas-vindas ({user}, {ticket})').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ticket-painel')
    .setDescription('Cria o painel de tickets num canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('canal').setDescription('Canal para o painel').setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption(o => o.setName('titulo').setDescription('Título do painel').setRequired(false))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição do painel').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ticket-tipo')
    .setDescription('Adiciona um tipo de ticket ao select menu')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('nome').setDescription('Nome do tipo').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(false))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ticket-tipos-lista')
    .setDescription('Lista os tipos de ticket configurados')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ticket-tipo-remover')
    .setDescription('Remove um tipo de ticket pelo ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('id').setDescription('ID do tipo de ticket (vê com /ticket-tipos-lista)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ticket-criar')
    .setDescription('Cria um ticket manualmente'),

  // ── Staff Rating ──
  new SlashCommandBuilder()
    .setName('ranking-staff')
    .setDescription('Mostra o ranking de avaliações da staff')
    .addIntegerOption(o => o.setName('top').setDescription('Quantos staff mostrar').setRequired(false).setMinValue(1).setMaxValue(10)),

  new SlashCommandBuilder()
    .setName('avaliar-staff')
    .setDescription('Avalia um membro da staff')
    .addUserOption(o => o.setName('staff').setDescription('Membro da staff a avaliar').setRequired(true)),

  new SlashCommandBuilder()
    .setName('historico-staff')
    .setDescription('Vê o histórico de avaliações de um staff')
    .addUserOption(o => o.setName('staff').setDescription('Membro da staff').setRequired(true)),

  // ── Server Stats ──
  new SlashCommandBuilder()
    .setName('stats-setup')
    .setDescription('Configura os canais de estatísticas do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('stats-atualizar')
    .setDescription('Atualiza manualmente as estatísticas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('stats-desativar')
    .setDescription('Desativa o sistema de estatísticas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Reaction Roles: geridos exclusivamente pelo Dashboard, sem comandos no Discord ──

  // ── Welcome ──
  new SlashCommandBuilder()
    .setName('welcome-setup')
    .setDescription('Configura o sistema de boas-vindas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('canal').setDescription('Canal de boas-vindas').setRequired(true))
    .addStringOption(o => o.setName('mensagem').setDescription('Mensagem ({user}, {server}, {count})').setRequired(false))
    .addBooleanOption(o => o.setName('embed').setDescription('Usar embed?').setRequired(false))
    .addRoleOption(o => o.setName('autorole').setDescription('Cargo automático para novos membros').setRequired(false)),

  new SlashCommandBuilder()
    .setName('welcome-desativar')
    .setDescription('Desativa o sistema de boas-vindas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('welcome-testar')
    .setDescription('Testa a mensagem de boas-vindas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Embeds ──
  new SlashCommandBuilder()
    .setName('embed-criar')
    .setDescription('Cria um embed personalizado')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('titulo').setDescription('Título do embed').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true))
    .addStringOption(o => o.setName('cor').setDescription('Cor hexadecimal (ex: #5865F2)').setRequired(false))
    .addStringOption(o => o.setName('imagem').setDescription('URL da imagem').setRequired(false))
    .addStringOption(o => o.setName('thumbnail').setDescription('URL do thumbnail').setRequired(false))
    .addStringOption(o => o.setName('footer').setDescription('Rodapé').setRequired(false))
    .addChannelOption(o => o.setName('canal').setDescription('Canal onde enviar (padrão: atual)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('embed-guardar')
    .setDescription('Guarda um embed para usar depois')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('nome').setDescription('Nome para identificar o embed').setRequired(true))
    .addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true))
    .addStringOption(o => o.setName('cor').setDescription('Cor').setRequired(false)),

  new SlashCommandBuilder()
    .setName('embed-enviar')
    .setDescription('Envia um embed guardado')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('nome').setDescription('Nome do embed guardado').setRequired(true))
    .addChannelOption(o => o.setName('canal').setDescription('Canal onde enviar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('embed-lista')
    .setDescription('Lista os embeds guardados')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── Sugestões ──
  new SlashCommandBuilder()
    .setName('sugestao-setup')
    .setDescription('Configura o sistema de sugestões')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('canal').setDescription('Canal de sugestões').setRequired(true))
    .addChannelOption(o => o.setName('log').setDescription('Canal de log das sugestões').setRequired(false))
    .addRoleOption(o => o.setName('ping').setDescription('Cargo a mencionar em novas sugestões').setRequired(false)),

  new SlashCommandBuilder()
    .setName('sugerir')
    .setDescription('Submete uma sugestão')
    .addStringOption(o => o.setName('sugestao').setDescription('A tua sugestão').setRequired(true).setMaxLength(1000)),

  new SlashCommandBuilder()
    .setName('sugestao-responder')
    .setDescription('Responde a uma sugestão (aprovar/rejeitar)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('id').setDescription('ID da sugestão').setRequired(true))
    .addStringOption(o => o.setName('acao').setDescription('Ação').setRequired(true)
      .addChoices(
        { name: '✅ Aprovar', value: 'approve' },
        { name: '❌ Rejeitar', value: 'reject' },
        { name: '🤔 Em consideração', value: 'consider' },
      ))
    .addStringOption(o => o.setName('resposta').setDescription('Resposta da moderação').setRequired(false)),

  // ── Moderação ──
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um utilizador')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador a banir').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false))
    .addIntegerOption(o => o.setName('dias').setDescription('Apagar mensagens dos últimos X dias').setRequired(false).setMinValue(0).setMaxValue(7)),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Remove o ban de um utilizador')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName('id').setDescription('ID do utilizador').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um utilizador')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador a expulsar').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Silencia temporariamente um utilizador')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true))
    .addStringOption(o => o.setName('duracao').setDescription('Duração (ex: 10m, 2h, 1d)').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)),

  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove o silêncio de um utilizador')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avisa um utilizador')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Vê os avisos de um utilizador')
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Limpa os avisos de um utilizador')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true)),

  new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Apaga mensagens do canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('quantidade').setDescription('Número de mensagens (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('utilizador').setDescription('Apagar apenas mensagens deste utilizador').setRequired(false)),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informações sobre um utilizador')
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador (padrão: tu)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Mostra informações sobre o servidor'),

  // ── Logs ──
  new SlashCommandBuilder()
    .setName('logs-setup')
    .setDescription('Configura o canal de logs')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('canal').setDescription('Canal de logs').setRequired(true))
    .addChannelOption(o => o.setName('mod-log').setDescription('Canal de logs de moderação').setRequired(false)),

  // ── AntiSpam ──
  new SlashCommandBuilder()
    .setName('antispam')
    .setDescription('Configura o sistema AntiSpam')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(o => o.setName('ativo').setDescription('Ativar/Desativar').setRequired(true))
    .addIntegerOption(o => o.setName('max-mensagens').setDescription('Máx. mensagens antes de punir').setRequired(false).setMinValue(2).setMaxValue(20))
    .addStringOption(o => o.setName('acao').setDescription('Ação ao detetar spam').setRequired(false)
      .addChoices(
        { name: 'Silenciar', value: 'mute' },
        { name: 'Expulsar', value: 'kick' },
        { name: 'Banir', value: 'ban' },
      ))
    .addBooleanOption(o => o.setName('anti-links').setDescription('Bloquear links').setRequired(false))
    .addBooleanOption(o => o.setName('anti-convites').setDescription('Bloquear convites Discord').setRequired(false))
    .addBooleanOption(o => o.setName('anti-raid').setDescription('Proteção anti-raid').setRequired(false))
    .addChannelOption(o => o.setName('log').setDescription('Canal de log do AntiSpam').setRequired(false)),

  // ── Votações ──
  new SlashCommandBuilder()
    .setName('votação-setup')
    .setDescription('Configura uma votação neste servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('modo').setDescription('Tipo de votação').setRequired(true)
      .addChoices(
        { name: 'Recorrente (todos os dias)', value: 'recorrente' },
        { name: 'Um dia único (começa agora)', value: 'unica' },
      )),

  new SlashCommandBuilder()
    .setName('remover-votação')
    .setDescription('Remove a votação diária configurada neste servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Help ──
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostra todos os comandos disponíveis'),

];

// ============================
// REGISTO DOS COMANDOS SLASH
// ============================
async function registarComandos() {
  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  try {
    console.log('🔄 A registar comandos slash...');
    await rest.put(
      Routes.applicationCommands(CONFIG.CLIENT_ID), // Global → funciona em todos os servidores
      { body: commands.map(c => c.toJSON()) }
    );
    console.log(`✅ ${commands.length} comandos slash globais registados com sucesso!`);
  } catch (err) {
    console.error('❌ Erro ao registar comandos:', err);
  }
}

// ============================
// HANDLER DE INTERACTION
// ============================
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ── COMANDOS SLASH ──
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    }
    // ── BOTÕES ──
    else if (interaction.isButton()) {
      await handleButton(interaction);
    }
    // ── SELECT MENUS ──
    else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    }
    // ── MODAIS ──
    else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (err) {
    console.error('❌ Erro na interaction:', err);
    const reply = { content: `❌ Ocorreu um erro: \`${err.message}\``, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// ============================
// HANDLER DE SLASH COMMANDS
// ============================
async function handleSlashCommand(interaction) {
  const { commandName, guild, member, user, options } = interaction;

  // ─────────────────────────────────────────────
  // TICKETS
  // ─────────────────────────────────────────────

  if (commandName === 'ticket-setup') {
    await interaction.deferReply({ ephemeral: true });
    const categoria    = options.getChannel('categoria');
    const log         = options.getChannel('log');
    const suporte     = options.getRole('suporte');
    const transcripts = options.getChannel('transcripts');
    const max         = options.getInteger('max') || 3;
    const mensagem    = options.getString('mensagem') || 'Olá {user}! O teu ticket foi criado. A equipa irá responder brevemente.';

    db.prepare(`
      INSERT INTO ticket_config (guild_id, category_id, log_channel, support_role, transcript_channel, max_tickets, welcome_msg, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(guild_id) DO UPDATE SET
        category_id=excluded.category_id,
        log_channel=excluded.log_channel,
        support_role=excluded.support_role,
        transcript_channel=excluded.transcript_channel,
        max_tickets=excluded.max_tickets,
        welcome_msg=excluded.welcome_msg,
        enabled=1
    `).run(guild.id, categoria.id, log?.id || null, suporte?.id || null, transcripts?.id || null, max, mensagem);

    const embed = embedPadrao(
      '✅ Sistema de Tickets Configurado',
      [
        `**Categoria:** ${categoria}`,
        `**Log:** ${log || 'Não definido'}`,
        `**Suporte:** ${suporte || 'Não definido'}`,
        `**Transcripts:** ${transcripts || 'Não definido'}`,
        `**Máx. Tickets/Utilizador:** ${max}`,
      ].join('\n'),
      CONFIG.COR_SUCESSO
    );
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'ticket-painel') {
    await interaction.deferReply({ ephemeral: true });

    const ticketConfig = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guild.id);
    if (!ticketConfig) return interaction.editReply({ content: '❌ Primeiro configura o sistema com `/ticket-setup`.' });

    const canal    = options.getChannel('canal');
    const titulo   = options.getString('titulo') || '🎫 Suporte';
    const descricao= options.getString('descricao') || 'Clica no botão abaixo para abrir um ticket de suporte.\nA nossa equipa irá responder o mais brevemente possível!';

    // Busca tipos de ticket
    const tipos = db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num').all(guild.id);

    const embed = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(descricao)
      .setColor(CONFIG.COR_PRINCIPAL)
      .setTimestamp();

    let components = [];

    if (tipos.length > 0) {
      // Select menu com tipos
      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_create_select')
        .setPlaceholder('Seleciona o tipo de ticket...')
        .addOptions(tipos.map(t => ({
          label: t.label,
          description: t.description || `Abrir ticket: ${t.label}`,
          emoji: t.emoji || '🎫',
          value: `tipo_${t.id}`,
        })));
      components.push(new ActionRowBuilder().addComponents(menu));
    } else {
      // Botão simples se não houver tipos
      const btn = new ButtonBuilder()
        .setCustomId('ticket_create_simple')
        .setLabel('🎫 Abrir Ticket')
        .setStyle(ButtonStyle.Primary);
      components.push(new ActionRowBuilder().addComponents(btn));
    }

    const msg = await canal.send({ embeds: [embed], components });

    // Guarda ID do painel
    db.prepare(`
      UPDATE ticket_config SET panel_msg_id=?, panel_channel_id=? WHERE guild_id=?
    `).run(msg.id, canal.id, guild.id);

    return interaction.editReply({ content: `✅ Painel de tickets criado em ${canal}!` });
  }

  if (commandName === 'ticket-tipo') {
    const nome      = options.getString('nome');
    const descricao = options.getString('descricao');
    const emoji     = options.getString('emoji') || '🎫';

    const tipos = db.prepare('SELECT COUNT(*) as c FROM ticket_types WHERE guild_id = ?').get(guild.id);
    if (tipos.c >= 25) return interaction.reply({ content: '❌ Já tens 25 tipos de ticket (limite do select menu).', ephemeral: true });

    db.prepare(`
      INSERT INTO ticket_types (guild_id, label, description, emoji, order_num)
      VALUES (?, ?, ?, ?, ?)
    `).run(guild.id, nome, descricao, emoji, tipos.c);

    return interaction.reply({ content: `✅ Tipo de ticket **${emoji} ${nome}** adicionado! Recria o painel com \`/ticket-painel\`.`, ephemeral: true });
  }

  if (commandName === 'ticket-tipos-lista') {
    const tipos = db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num').all(guild.id);
    if (!tipos.length) return interaction.reply({ content: '❌ Não há tipos de ticket configurados.', ephemeral: true });

    const embed = embedPadrao(
      '📋 Tipos de Ticket',
      tipos.map((t, i) => `**${i+1}.** ${t.emoji || '🎫'} **${t.label}** (ID: ${t.id})\n↳ ${t.description || 'Sem descrição'}`).join('\n\n')
    );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'ticket-tipo-remover') {
    const id = options.getInteger('id');

    const tipo = db.prepare('SELECT * FROM ticket_types WHERE id = ? AND guild_id = ?').get(id, guild.id);
    if (!tipo) return interaction.reply({ content: `❌ Não existe nenhum tipo de ticket com o ID **${id}** neste servidor. Usa \`/ticket-tipos-lista\` para ver os IDs corretos.`, ephemeral: true });

    db.prepare('DELETE FROM ticket_types WHERE id = ? AND guild_id = ?').run(id, guild.id);

    return interaction.reply({ content: `✅ Tipo de ticket **${tipo.emoji || '🎫'} ${tipo.label}** (ID: ${id}) foi removido! Recria o painel com \`/ticket-painel\` para atualizar o select menu.`, ephemeral: true });
  }

  if (commandName === 'ticket-criar') {
    await interaction.deferReply({ ephemeral: true });
    const result = await criarTicket(guild, user, null, interaction);
    if (result.erro) return interaction.editReply({ content: `❌ ${result.erro}` });
    return interaction.editReply({ content: `✅ Ticket criado: ${result.channel}` });
  }

  // ─────────────────────────────────────────────
  // STAFF RATING
  // ─────────────────────────────────────────────

  if (commandName === 'ranking-staff') {
    const top     = options.getInteger('top') || 5;
    const ranking = getRankingStaff(guild.id);

    if (!ranking.length) return interaction.reply({ content: '❌ Ainda não há avaliações de staff neste servidor.', ephemeral: true });

    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const descricao = ranking.slice(0, top).map((r, i) =>
      `${emojis[i] || `**${i+1}.**`} <@${r.staff_id}>\n⭐ Média: **${parseFloat(r.media).toFixed(1)}/5** | 📊 Avaliações: **${r.total}**`
    ).join('\n\n');

    const embed = embedPadrao('⭐ Ranking de Staff', descricao, '#FFD700');
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'avaliar-staff') {
    const staff = options.getUser('staff');
    if (staff.id === user.id) return interaction.reply({ content: '❌ Não podes avaliar-te a ti próprio.', ephemeral: true });
    if (staff.bot) return interaction.reply({ content: '❌ Não podes avaliar um bot.', ephemeral: true });

    // Publica a avaliação no mesmo canal onde o comando foi usado
    const modal = criarModalAvaliacao(staff.id, 0, interaction.channel.id);
    return interaction.showModal(modal);
  }

  if (commandName === 'historico-staff') {
    await interaction.deferReply({ ephemeral: true });
    const staff    = options.getUser('staff');
    const historico = db.prepare(`
      SELECT * FROM staff_ratings WHERE guild_id = ? AND staff_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(guild.id, staff.id);

    if (!historico.length) return interaction.editReply({ content: `❌ <@${staff.id}> não tem avaliações ainda.` });

    const stats = db.prepare(`
      SELECT AVG(rating) as media, COUNT(*) as total, MIN(rating) as min, MAX(rating) as max
      FROM staff_ratings WHERE guild_id = ? AND staff_id = ?
    `).get(guild.id, staff.id);

    const estrelas = n => '⭐'.repeat(n) + '☆'.repeat(5-n);
    const descricao = historico.map(r =>
      `${estrelas(r.rating)} por <@${r.user_id}>\n↳ ${r.comment || '*Sem comentário*'}\n↳ <t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>`
    ).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`📊 Histórico de ${staff.tag}`)
      .setDescription(descricao)
      .setColor(CONFIG.COR_PRINCIPAL)
      .setThumbnail(staff.displayAvatarURL())
      .addFields(
        { name: '⭐ Média', value: `${parseFloat(stats.media).toFixed(2)}/5`, inline: true },
        { name: '📊 Total', value: `${stats.total}`, inline: true },
        { name: '📈 Min/Max', value: `${stats.min}⭐ / ${stats.max}⭐`, inline: true },
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // ─────────────────────────────────────────────
  // SERVER STATS
  // ─────────────────────────────────────────────

  if (commandName === 'stats-setup') {
    await interaction.deferReply({ ephemeral: true });

    let config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guild.id);
    if (!config) {
      db.prepare('INSERT INTO server_stats (guild_id) VALUES (?)').run(guild.id);
      config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guild.id);
    }
    db.prepare('UPDATE server_stats SET enabled = 1 WHERE guild_id = ?').run(guild.id);

    await setupServerStats(guild, config);
    return interaction.editReply({ content: '✅ Canais de estatísticas criados/atualizados com sucesso!' });
  }

  if (commandName === 'stats-atualizar') {
    await interaction.deferReply({ ephemeral: true });
    await atualizarStats(guild);
    return interaction.editReply({ content: '✅ Estatísticas atualizadas!' });
  }

  if (commandName === 'stats-desativar') {
    db.prepare('UPDATE server_stats SET enabled = 0 WHERE guild_id = ?').run(guild.id);
    return interaction.reply({ content: '✅ Sistema de estatísticas desativado.', ephemeral: true });
  }

  // ─────────────────────────────────────────────
  // REACTION ROLES: geridos exclusivamente pelo Dashboard (sem comandos no Discord)
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // WELCOME
  // ─────────────────────────────────────────────

  if (commandName === 'welcome-setup') {
    const canal    = options.getChannel('canal');
    const mensagem = options.getString('mensagem') || 'Bem-vindo(a) {user} ao **{server}**! 🎉 És o membro número **{count}**!';
    const embed    = options.getBoolean('embed') !== false;
    const autorole = options.getRole('autorole');

    db.prepare(`
      INSERT INTO guild_config (guild_id, welcome_channel, welcome_msg, welcome_embed, autorole)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        welcome_channel=excluded.welcome_channel,
        welcome_msg=excluded.welcome_msg,
        welcome_embed=excluded.welcome_embed,
        autorole=excluded.autorole
    `).run(guild.id, canal.id, mensagem, embed ? 1 : 0, autorole?.id || null);

    return interaction.reply({
      content: `✅ Boas-vindas configuradas!\n**Canal:** ${canal}\n**Autorole:** ${autorole || 'Nenhum'}\n**Embed:** ${embed ? 'Sim' : 'Não'}`,
      ephemeral: true
    });
  }

  if (commandName === 'welcome-desativar') {
    db.prepare('UPDATE guild_config SET welcome_channel = NULL WHERE guild_id = ?').run(guild.id);
    return interaction.reply({ content: '✅ Sistema de boas-vindas desativado.', ephemeral: true });
  }

  if (commandName === 'welcome-testar') {
    await interaction.deferReply({ ephemeral: true });
    await sendWelcome(member);
    return interaction.editReply({ content: '✅ Mensagem de boas-vindas enviada como teste!' });
  }

  // ─────────────────────────────────────────────
  // EMBEDS
  // ─────────────────────────────────────────────

  if (commandName === 'embed-criar') {
    const titulo    = options.getString('titulo');
    const descricao = options.getString('descricao');
    const cor       = options.getString('cor') || CONFIG.COR_PRINCIPAL;
    const imagem    = options.getString('imagem');
    const thumbnail = options.getString('thumbnail');
    const footer    = options.getString('footer');
    const canal     = options.getChannel('canal') || interaction.channel;

    const embed = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(descricao)
      .setColor(cor)
      .setTimestamp();

    if (imagem)    embed.setImage(imagem);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer)    embed.setFooter({ text: footer });

    await interaction.deferReply({ ephemeral: true });
    await canal.send({ embeds: [embed] });
    return interaction.editReply({ content: `✅ Embed enviado em ${canal}!` });
  }

  if (commandName === 'embed-guardar') {
    const nome      = options.getString('nome');
    const titulo    = options.getString('titulo');
    const descricao = options.getString('descricao');
    const cor       = options.getString('cor') || CONFIG.COR_PRINCIPAL;

    const data = JSON.stringify({ title: titulo, description: descricao, color: cor });

    db.prepare(`
      INSERT INTO saved_embeds (guild_id, name, data, created_by)
      VALUES (?, ?, ?, ?)
    `).run(guild.id, nome, data, user.id);

    return interaction.reply({ content: `✅ Embed **${nome}** guardado!`, ephemeral: true });
  }

  if (commandName === 'embed-enviar') {
    const nome  = options.getString('nome');
    const canal = options.getChannel('canal') || interaction.channel;

    const saved = db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? AND name = ?').get(guild.id, nome);
    if (!saved) return interaction.reply({ content: `❌ Embed **${nome}** não encontrado.`, ephemeral: true });

    const data  = JSON.parse(saved.data);
    const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp();

    await interaction.deferReply({ ephemeral: true });
    await canal.send({ embeds: [embed] });
    return interaction.editReply({ content: `✅ Embed enviado em ${canal}!` });
  }

  if (commandName === 'embed-lista') {
    const embeds = db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC').all(guild.id);
    if (!embeds.length) return interaction.reply({ content: '❌ Não há embeds guardados.', ephemeral: true });

    const embed = embedPadrao(
      '📋 Embeds Guardados',
      embeds.map((e, i) => `**${i+1}.** \`${e.name}\` — por <@${e.created_by}>`).join('\n')
    );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ─────────────────────────────────────────────
  // SUGESTÕES
  // ─────────────────────────────────────────────

  if (commandName === 'sugestao-setup') {
    const canal = options.getChannel('canal');
    const log   = options.getChannel('log');
    const ping  = options.getRole('ping');

    db.prepare(`
      INSERT INTO suggestion_config (guild_id, channel_id, log_channel, enabled, ping_role)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id=excluded.channel_id,
        log_channel=excluded.log_channel,
        ping_role=excluded.ping_role,
        enabled=1
    `).run(guild.id, canal.id, log?.id || null, ping?.id || null);

    return interaction.reply({
      content: `✅ Sistema de sugestões configurado!\n**Canal:** ${canal}\n**Log:** ${log || 'Não definido'}\n**Ping:** ${ping || 'Nenhum'}`,
      ephemeral: true
    });
  }

  if (commandName === 'sugerir') {
    const config = db.prepare('SELECT * FROM suggestion_config WHERE guild_id = ? AND enabled = 1').get(guild.id);
    if (!config) return interaction.reply({ content: '❌ O sistema de sugestões não está configurado.', ephemeral: true });

    const conteudo = options.getString('sugestao');
    const canal    = guild.channels.cache.get(config.channel_id);
    if (!canal) return interaction.reply({ content: '❌ Canal de sugestões não encontrado.', ephemeral: true });

    // Insere na BD (sem message_id ainda)
    const stmt = db.prepare(`
      INSERT INTO suggestions (guild_id, channel_id, user_id, content) VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(guild.id, canal.id, user.id, conteudo);
    const sugId = info.lastInsertRowid;

    const embed = new EmbedBuilder()
      .setTitle(`💡 Sugestão #${sugId}`)
      .setDescription(conteudo)
      .setColor(CONFIG.COR_AVISO)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .addFields(
        { name: '👍 Votos positivos', value: '0', inline: true },
        { name: '👎 Votos negativos', value: '0', inline: true },
        { name: '📊 Estado', value: '🕐 Pendente', inline: true },
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sug_up_${sugId}`).setLabel('👍 0').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sug_down_${sugId}`).setLabel('👎 0').setStyle(ButtonStyle.Danger),
    );

    const content = config.ping_role ? `<@&${config.ping_role}>` : undefined;
    const msg = await canal.send({ content, embeds: [embed], components: [row] });

    db.prepare('UPDATE suggestions SET message_id = ? WHERE id = ?').run(msg.id, sugId);

    return interaction.reply({ content: `✅ Sugestão #${sugId} submetida com sucesso!`, ephemeral: true });
  }

  if (commandName === 'sugestao-responder') {
    const id      = options.getInteger('id');
    const acao    = options.getString('acao');
    const resposta= options.getString('resposta') || 'Sem resposta adicional.';

    const sug = db.prepare('SELECT * FROM suggestions WHERE id = ? AND guild_id = ?').get(id, guild.id);
    if (!sug) return interaction.reply({ content: `❌ Sugestão #${id} não encontrada.`, ephemeral: true });

    const statusMap = {
      approve: { label: '✅ Aprovada', color: CONFIG.COR_SUCESSO },
      reject:  { label: '❌ Rejeitada', color: CONFIG.COR_ERRO },
      consider:{ label: '🤔 Em Consideração', color: CONFIG.COR_AVISO },
    };
    const s = statusMap[acao];

    db.prepare('UPDATE suggestions SET status = ?, mod_response = ? WHERE id = ?').run(acao, resposta, id);

    const canal = guild.channels.cache.get(sug.channel_id);
    if (canal && sug.message_id) {
      try {
        const msg = await canal.messages.fetch(sug.message_id);
        const oldEmbed = msg.embeds[0];
        const embed = EmbedBuilder.from(oldEmbed)
          .setColor(s.color)
          .spliceFields(2, 1, { name: '📊 Estado', value: s.label, inline: true })
          .addFields({ name: '💬 Resposta da Moderação', value: `> ${resposta}\n— <@${user.id}>` });
        await msg.edit({ embeds: [embed], components: [] });
      } catch (_) {}
    }

    return interaction.reply({ content: `✅ Sugestão #${id} marcada como **${s.label}**.`, ephemeral: true });
  }

  // ─────────────────────────────────────────────
  // MODERAÇÃO
  // ─────────────────────────────────────────────

  if (commandName === 'ban') {
    const target = options.getMember('utilizador');
    const motivo = options.getString('motivo') || 'Sem motivo especificado';
    const dias   = options.getInteger('dias') || 0;

    if (!target) return interaction.reply({ content: '❌ Utilizador não encontrado.', ephemeral: true });
    if (target.id === user.id) return interaction.reply({ content: '❌ Não te podes banir a ti próprio.', ephemeral: true });
    if (!target.bannable) return interaction.reply({ content: '❌ Não tenho permissão para banir este utilizador.', ephemeral: true });

    await interaction.deferReply();

    await target.ban({ reason: motivo, deleteMessageDays: dias });
    logMod(guild.id, 'BAN', target.id, user.id, motivo);

    const embed = embedPadrao(
      '🔨 Utilizador Banido',
      `**Utilizador:** <@${target.id}> (\`${target.user.tag}\`)\n**Moderador:** <@${user.id}>\n**Motivo:** ${motivo}`,
      CONFIG.COR_ERRO
    );

    await sendLog(guild, embed);
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'unban') {
    const targetId = options.getString('id');
    const motivo   = options.getString('motivo') || 'Sem motivo especificado';

    await interaction.deferReply();

    try {
      await guild.members.unban(targetId, motivo);
      logMod(guild.id, 'UNBAN', targetId, user.id, motivo);

      const embed = embedPadrao(
        '✅ Ban Removido',
        `**ID:** \`${targetId}\`\n**Moderador:** <@${user.id}>\n**Motivo:** ${motivo}`,
        CONFIG.COR_SUCESSO
      );
      await sendLog(guild, embed);
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      return interaction.editReply({ content: `❌ Não foi possível remover o ban: ${e.message}` });
    }
  }

  if (commandName === 'kick') {
    const target = options.getMember('utilizador');
    const motivo = options.getString('motivo') || 'Sem motivo especificado';

    if (!target?.kickable) return interaction.reply({ content: '❌ Não posso expulsar este utilizador.', ephemeral: true });

    await interaction.deferReply();

    await target.kick(motivo);
    logMod(guild.id, 'KICK', target.id, user.id, motivo);

    const embed = embedPadrao(
      '👢 Utilizador Expulso',
      `**Utilizador:** <@${target.id}>\n**Moderador:** <@${user.id}>\n**Motivo:** ${motivo}`,
      CONFIG.COR_ERRO
    );
    await sendLog(guild, embed);
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'timeout') {
    const target  = options.getMember('utilizador');
    const durStr  = options.getString('duracao');
    const motivo  = options.getString('motivo') || 'Sem motivo especificado';
    const durMs   = parseDuration(durStr);

    if (!durMs) return interaction.reply({ content: '❌ Formato de duração inválido. Usa: `10m`, `2h`, `1d`', ephemeral: true });
    if (!target?.moderatable) return interaction.reply({ content: '❌ Não posso silenciar este utilizador.', ephemeral: true });

    await interaction.deferReply();

    await target.timeout(durMs, motivo);
    logMod(guild.id, 'TIMEOUT', target.id, user.id, motivo, durStr);

    const embed = embedPadrao(
      '🔇 Utilizador Silenciado',
      `**Utilizador:** <@${target.id}>\n**Duração:** ${formatDuration(durMs)}\n**Moderador:** <@${user.id}>\n**Motivo:** ${motivo}`,
      CONFIG.COR_AVISO
    );
    await sendLog(guild, embed);
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'untimeout') {
    const target = options.getMember('utilizador');
    const motivo = options.getString('motivo') || 'Sem motivo especificado';

    if (!target) return interaction.reply({ content: '❌ Utilizador não encontrado.', ephemeral: true });

    await interaction.deferReply();

    await target.timeout(null, motivo);
    logMod(guild.id, 'UNTIMEOUT', target.id, user.id, motivo);

    const embed = embedPadrao('🔊 Silêncio Removido', `**Utilizador:** <@${target.id}>\n**Moderador:** <@${user.id}>\n**Motivo:** ${motivo}`, CONFIG.COR_SUCESSO);
    await sendLog(guild, embed);
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'warn') {
    const target = options.getMember('utilizador');
    const motivo = options.getString('motivo');

    if (!target) return interaction.reply({ content: '❌ Utilizador não encontrado.', ephemeral: true });

    await interaction.deferReply();

    db.prepare('INSERT INTO warns (guild_id, user_id, mod_id, reason) VALUES (?, ?, ?, ?)').run(guild.id, target.id, user.id, motivo);
    const total = db.prepare('SELECT COUNT(*) as c FROM warns WHERE guild_id = ? AND user_id = ?').get(guild.id, target.id).c;
    logMod(guild.id, 'WARN', target.id, user.id, motivo);

    const embed = embedPadrao(
      '⚠️ Utilizador Avisado',
      `**Utilizador:** <@${target.id}>\n**Moderador:** <@${user.id}>\n**Motivo:** ${motivo}\n**Total de avisos:** ${total}`,
      CONFIG.COR_AVISO
    );
    await sendLog(guild, embed);

    // DM ao utilizador
    try {
      await target.send({ embeds: [embedPadrao('⚠️ Recebeste um aviso', `**Servidor:** ${guild.name}\n**Motivo:** ${motivo}\n**Avisos totais:** ${total}`, CONFIG.COR_AVISO)] });
    } catch (_) {}

    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'warns') {
    const target = options.getMember('utilizador') || member;
    const avisos = db.prepare('SELECT * FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 10').all(guild.id, target.id);

    if (!avisos.length) return interaction.reply({ content: `✅ ${target} não tem avisos.`, ephemeral: true });

    const embed = embedPadrao(
      `⚠️ Avisos de ${target.user.tag}`,
      avisos.map((w, i) => `**#${i+1}** — ${w.reason}\n↳ Por <@${w.mod_id}> em <t:${Math.floor(new Date(w.created_at).getTime()/1000)}:d>`).join('\n\n')
    );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'clearwarns') {
    const target = options.getMember('utilizador');
    const res    = db.prepare('DELETE FROM warns WHERE guild_id = ? AND user_id = ?').run(guild.id, target.id);
    return interaction.reply({ content: `✅ **${res.changes}** aviso(s) removido(s) de ${target}.`, ephemeral: true });
  }

  if (commandName === 'limpar') {
    const quantidade  = options.getInteger('quantidade');
    const utilizador  = options.getUser('utilizador');

    await interaction.deferReply({ ephemeral: true });

    let msgs = await interaction.channel.messages.fetch({ limit: 100 });
    if (utilizador) msgs = msgs.filter(m => m.author.id === utilizador.id);
    msgs = [...msgs.values()].slice(0, quantidade);

    const apagadas = await interaction.channel.bulkDelete(msgs, true);
    const embed = embedPadrao('🗑️ Mensagens Apagadas', `**${apagadas.size}** mensagem(ns) apagada(s)${utilizador ? ` de ${utilizador.tag}` : ''}.`, CONFIG.COR_SUCESSO);
    await sendLog(guild, embed);

    return interaction.editReply({ embeds: [embed] });
  }

  // ─────────────────────────────────────────────
  // HELP
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // VOTAÇÃO DIÁRIA
  // ─────────────────────────────────────────────

  if (commandName === 'votação-setup') {
    const modo = options.getString('modo'); // 'recorrente' | 'unica'

    if (modo === 'recorrente') {
      const modal = new ModalBuilder()
        .setCustomId('votacao_setup_modal_recorrente')
        .setTitle('🗳️ Votação Recorrente (diária)');

      const tituloInput = new TextInputBuilder()
        .setCustomId('votacao_titulo')
        .setLabel('Título da votação')
        .setPlaceholder('Ex: Votação do Dia')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

      const descricaoInput = new TextInputBuilder()
        .setCustomId('votacao_descricao')
        .setLabel('Descrição da votação')
        .setPlaceholder('Ex: Vota na tua opção favorita do dia!')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      const opcoesInput = new TextInputBuilder()
        .setCustomId('votacao_opcoes')
        .setLabel('Opções dos botões (separadas por vírgula)')
        .setPlaceholder('Ex: Opção A, Opção B, Opção C (máx. 10)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

      const horaInicioInput = new TextInputBuilder()
        .setCustomId('votacao_hora_inicio')
        .setLabel('Hora de início (formato 24h HH:MM)')
        .setPlaceholder('Ex: 12:00')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(4)
        .setMaxLength(5);

      const horaFimInput = new TextInputBuilder()
        .setCustomId('votacao_hora_fim')
        .setLabel('Hora de fim (formato 24h HH:MM)')
        .setPlaceholder('Ex: 20:30')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(4)
        .setMaxLength(5);

      modal.addComponents(
        new ActionRowBuilder().addComponents(tituloInput),
        new ActionRowBuilder().addComponents(descricaoInput),
        new ActionRowBuilder().addComponents(opcoesInput),
        new ActionRowBuilder().addComponents(horaInicioInput),
        new ActionRowBuilder().addComponents(horaFimInput),
      );

      return interaction.showModal(modal);
    }

    // modo === 'unica'
    const modal = new ModalBuilder()
      .setCustomId('votacao_setup_modal_unica')
      .setTitle('🗳️ Votação de Um Dia Único');

    const tituloInput = new TextInputBuilder()
      .setCustomId('votacao_titulo')
      .setLabel('Título da votação')
      .setPlaceholder('Ex: Votação Especial')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    const descricaoInput = new TextInputBuilder()
      .setCustomId('votacao_descricao')
      .setLabel('Descrição da votação')
      .setPlaceholder('Ex: Vota na tua opção favorita!')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    const opcoesInput = new TextInputBuilder()
      .setCustomId('votacao_opcoes')
      .setLabel('Opções dos botões (separadas por vírgula)')
      .setPlaceholder('Ex: Opção A, Opção B, Opção C (máx. 10)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    const dataFimInput = new TextInputBuilder()
      .setCustomId('votacao_data_fim')
      .setLabel('Data em que fecha (formato DD/MM/AAAA)')
      .setPlaceholder('Ex: 20/07/2026')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(8)
      .setMaxLength(10);

    const horaFimInput = new TextInputBuilder()
      .setCustomId('votacao_hora_fim')
      .setLabel('Hora em que fecha (formato 24h HH:MM)')
      .setPlaceholder('Ex: 20:30')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(4)
      .setMaxLength(5);

    modal.addComponents(
      new ActionRowBuilder().addComponents(tituloInput),
      new ActionRowBuilder().addComponents(descricaoInput),
      new ActionRowBuilder().addComponents(opcoesInput),
      new ActionRowBuilder().addComponents(dataFimInput),
      new ActionRowBuilder().addComponents(horaFimInput),
    );

    return interaction.showModal(modal);
  }

  if (commandName === 'remover-votação') {
    const existente = db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guild.id);
    if (!existente) {
      return interaction.reply({ content: '❌ Não há nenhuma votação configurada neste servidor.', ephemeral: true });
    }
    db.prepare('DELETE FROM votacao_config WHERE guild_id = ?').run(guild.id);
    db.prepare('DELETE FROM votacao_votos WHERE guild_id = ?').run(guild.id);
    return interaction.reply({ content: '✅ Votação removida com sucesso. Não será mais publicada nem contabilizada.', ephemeral: true });
  }

  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📖 Comandos do Bot')
      .setDescription('Bem-vindo! Aqui estão todos os comandos disponíveis.\n\u200b')
      .setColor(CONFIG.COR_PRINCIPAL)
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        {
          name: '🎫 Tickets',
          value: '`/ticket-setup` · Configura o sistema de tickets\n`/ticket-painel` · Cria o painel de tickets\n`/ticket-tipo` · Adiciona um tipo de ticket\n`/ticket-tipos-lista` · Lista os tipos de ticket\n`/ticket-tipo-remover` · Remove um tipo de ticket\n`/ticket-criar` · Cria um ticket manualmente',
          inline: false,
        },
        {
          name: '⭐ Avaliações de Staff',
          value: '`/avaliar-staff` · Avalia um membro da staff\n`/ranking-staff` · Mostra o ranking de avaliações\n`/historico-staff` · Vê o histórico de avaliações de um staff',
          inline: false,
        },
        {
          name: '🔨 Moderação',
          value: '`/ban` · Bane um utilizador\n`/unban` · Remove o ban\n`/kick` · Expulsa um utilizador\n`/timeout` · Silencia temporariamente\n`/untimeout` · Remove o silêncio\n`/warn` · Avisa um utilizador\n`/warns` · Vê os avisos de um utilizador\n`/clearwarns` · Limpa os avisos\n`/limpar` · Apaga mensagens do canal',
          inline: false,
        },
        {
          name: '💡 Sugestões',
          value: '`/sugerir` · Submete uma sugestão\n`/sugestao-setup` · Configura o sistema de sugestões\n`/sugestao-responder` · Aprova ou rejeita uma sugestão',
          inline: false,
        },
        {
          name: '🎨 Embeds',
          value: '`/embed-criar` · Cria um embed personalizado\n`/embed-guardar` · Guarda um embed\n`/embed-enviar` · Envia um embed guardado\n`/embed-lista` · Lista os embeds guardados',
          inline: false,
        },
        {
          name: '👋 Boas-vindas',
          value: '`/welcome-setup` · Configura as boas-vindas\n`/welcome-desativar` · Desativa as boas-vindas\n`/welcome-testar` · Testa a mensagem de boas-vindas',
          inline: false,
        },
        {
          name: '📊 Server Stats',
          value: '`/stats-setup` · Configura os canais de estatísticas\n`/stats-atualizar` · Atualiza as estatísticas manualmente\n`/stats-desativar` · Desativa o sistema de estatísticas',
          inline: false,
        },
        {
          name: '⚙️ Configuração',
          value: '`/logs-setup` · Configura o canal de logs\n`/antispam` · Configura o sistema AntiSpam',
          inline: false,
        },
        {
          name: '🗳️ Votação',
          value: '`/votação-setup` · Configura uma votação (recorrente diária ou de um dia único)\n`/remover-votação` · Remove a votação configurada',
          inline: false,
        },
        {
          name: 'ℹ️ Informação',
          value: '`/userinfo` · Informações sobre um utilizador\n`/serverinfo` · Informações sobre o servidor',
          inline: false,
        },
      )
      .setFooter({ text: `Pedido por ${user.username}`, iconURL: user.displayAvatarURL() })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'userinfo') {
    await interaction.deferReply();
    const target = options.getMember('utilizador') || member;
    const u      = target.user;
    await target.fetch();

    const cargos = target.roles.cache.filter(r => r.id !== guild.id).sort((a,b) => b.position - a.position);
    const avisos = db.prepare('SELECT COUNT(*) as c FROM warns WHERE guild_id = ? AND user_id = ?').get(guild.id, u.id).c;

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${u.tag}`)
      .setThumbnail(u.displayAvatarURL({ dynamic: true, size: 256 }))
      .setColor(target.displayHexColor || CONFIG.COR_PRINCIPAL)
      .addFields(
        { name: '🆔 ID', value: u.id, inline: true },
        { name: '🤖 Bot', value: u.bot ? 'Sim' : 'Não', inline: true },
        { name: '⚠️ Avisos', value: `${avisos}`, inline: true },
        { name: '📅 Conta Criada', value: `<t:${Math.floor(u.createdTimestamp/1000)}:R>`, inline: true },
        { name: '📥 Entrou no Servidor', value: `<t:${Math.floor(target.joinedTimestamp/1000)}:R>`, inline: true },
        { name: '🎭 Cargo Principal', value: `${cargos.first() || 'Nenhum'}`, inline: true },
        { name: `🎭 Cargos (${cargos.size})`, value: cargos.size ? cargos.map(r => `${r}`).slice(0,10).join(' ') : 'Nenhum' },
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'serverinfo') {
    await interaction.deferReply();
    await guild.fetch();
    await guild.members.fetch().catch(() => {});

    const bots    = guild.members.cache.filter(m => m.user.bot).size;
    const humanos = guild.memberCount - bots;

    const embed = new EmbedBuilder()
      .setTitle(`🏰 ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setColor(CONFIG.COR_PRINCIPAL)
      .addFields(
        { name: '🆔 ID',           value: guild.id, inline: true },
        { name: '👑 Dono',         value: `<@${guild.ownerId}>`, inline: true },
        { name: '📅 Criado',       value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>`, inline: true },
        { name: '👥 Membros',      value: `${humanos} humanos • ${bots} bots`, inline: true },
        { name: '📢 Canais',       value: `${guild.channels.cache.size}`, inline: true },
        { name: '🎭 Cargos',       value: `${guild.roles.cache.size}`, inline: true },
        { name: '🚀 Boosts',       value: `${guild.premiumSubscriptionCount} (Nível ${guild.premiumTier})`, inline: true },
        { name: '😀 Emojis',       value: `${guild.emojis.cache.size}`, inline: true },
        { name: '🔒 Verificação',  value: `${guild.verificationLevel}`, inline: true },
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // ─────────────────────────────────────────────
  // LOGS SETUP
  // ─────────────────────────────────────────────

  if (commandName === 'logs-setup') {
    const canal   = options.getChannel('canal');
    const modLog  = options.getChannel('mod-log');

    db.prepare(`
      INSERT INTO guild_config (guild_id, log_channel, mod_log)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET log_channel=excluded.log_channel, mod_log=excluded.mod_log
    `).run(guild.id, canal.id, modLog?.id || null);

    return interaction.reply({
      content: `✅ Canal de logs definido: ${canal}\n${modLog ? `📋 Mod Log: ${modLog}` : ''}`,
      ephemeral: true
    });
  }

  // ─────────────────────────────────────────────
  // ANTISPAM
  // ─────────────────────────────────────────────

  if (commandName === 'antispam') {
    const ativo       = options.getBoolean('ativo');
    const maxMsg      = options.getInteger('max-mensagens') || 5;
    const acao        = options.getString('acao') || 'mute';
    const antiLinks   = options.getBoolean('anti-links') ? 1 : 0;
    const antiInvites = options.getBoolean('anti-convites') ? 1 : 0;
    const antiRaid    = options.getBoolean('anti-raid') ? 1 : 0;
    const logCh       = options.getChannel('log');

    db.prepare(`
      INSERT INTO antispam_config (guild_id, enabled, max_messages, action, anti_links, anti_invites, anti_raid, log_channel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled=excluded.enabled,
        max_messages=excluded.max_messages,
        action=excluded.action,
        anti_links=excluded.anti_links,
        anti_invites=excluded.anti_invites,
        anti_raid=excluded.anti_raid,
        log_channel=excluded.log_channel
    `).run(guild.id, ativo ? 1 : 0, maxMsg, acao, antiLinks, antiInvites, antiRaid, logCh?.id || null);

    const embed = embedPadrao(
      `🛡️ AntiSpam ${ativo ? 'Ativado' : 'Desativado'}`,
      [
        `**Estado:** ${ativo ? '✅ Ativo' : '❌ Inativo'}`,
        `**Máx. Mensagens:** ${maxMsg}`,
        `**Ação:** ${acao}`,
        `**Anti-Links:** ${antiLinks ? 'Sim' : 'Não'}`,
        `**Anti-Convites:** ${antiInvites ? 'Sim' : 'Não'}`,
        `**Anti-Raid:** ${antiRaid ? 'Sim' : 'Não'}`,
        `**Log:** ${logCh || 'Não definido'}`,
      ].join('\n'),
      ativo ? CONFIG.COR_SUCESSO : CONFIG.COR_ERRO
    );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

}

// ============================
// HANDLER DE BOTÕES
// ============================
async function handleButton(interaction) {
  const { customId, guild, member, user, channel } = interaction;

  // ── Criar ticket simples ──
  if (customId === 'ticket_create_simple') {
    await interaction.deferReply({ ephemeral: true });
    const result = await criarTicket(guild, user, null, interaction);
    if (result.erro) return interaction.editReply({ content: `❌ ${result.erro}` });
    return interaction.editReply({ content: `✅ Ticket criado: ${result.channel}` });
  }

  // ── Claim ticket ──
  if (customId === 'ticket_claim') {
    const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Este não é um canal de ticket.', ephemeral: true });
    if (ticket.claimed_by) return interaction.reply({ content: `❌ Este ticket já foi reclamado por <@${ticket.claimed_by}>.`, ephemeral: true });

    await interaction.deferReply();

    db.prepare('UPDATE tickets SET claimed_by = ? WHERE channel_id = ?').run(user.id, channel.id);

    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true, SendMessages: true, ManageMessages: true
    });

    const embed = embedPadrao('🙋 Ticket Reclamado', `<@${user.id}> está a tratar deste ticket!`, CONFIG.COR_SUCESSO);
    return interaction.editReply({ embeds: [embed] });
  }

  // ── Fechar ticket ──
  if (customId === 'ticket_close') {
    const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Este não é um canal de ticket.', ephemeral: true });

    // Confirmação
    const confirmEmbed = embedPadrao('🔒 Confirmar Fecho', 'Tens a certeza que queres fechar este ticket?', CONFIG.COR_AVISO);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('✅ Confirmar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
  }

  if (customId === 'ticket_close_confirm') {
    await interaction.deferReply({ ephemeral: true });
    await fecharTicket(channel, user.id, guild);
    return interaction.editReply({ content: '✅ Ticket fechado.' });
  }

  if (customId === 'ticket_close_cancel') {
    return interaction.reply({ content: '❌ Fecho cancelado.', ephemeral: true });
  }

  // ── Transcript ──
  if (customId === 'ticket_transcript') {
    await interaction.deferReply({ ephemeral: true });
    const html   = await gerarTranscript(channel);
    const buffer = Buffer.from(html, 'utf-8');
    const file   = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.html` });
    return interaction.editReply({ content: '📄 Aqui está o transcript:', files: [file] });
  }

  // ── Add User ──
  if (customId === 'ticket_adduser') {
    const modal = new ModalBuilder()
      .setCustomId('ticket_adduser_modal')
      .setTitle('➕ Adicionar Utilizador ao Ticket');
    const input = new TextInputBuilder()
      .setCustomId('user_id_input')
      .setLabel('ID do utilizador')
      .setPlaceholder('Cole o ID do utilizador aqui')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ── Remove User ──
  if (customId === 'ticket_removeuser') {
    const modal = new ModalBuilder()
      .setCustomId('ticket_removeuser_modal')
      .setTitle('➖ Remover Utilizador do Ticket');
    const input = new TextInputBuilder()
      .setCustomId('user_id_input')
      .setLabel('ID do utilizador')
      .setPlaceholder('Cole o ID do utilizador aqui')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ── Rename ticket ──
  if (customId === 'ticket_rename') {
    const modal = new ModalBuilder()
      .setCustomId('ticket_rename_modal')
      .setTitle('✏️ Renomear Ticket');
    const input = new TextInputBuilder()
      .setCustomId('new_name')
      .setLabel('Novo nome do canal')
      .setPlaceholder('Ex: ticket-vip-joao')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ── Voto na votação diária ──
  if (customId.startsWith('votacao_vote_')) {
    const opcao = customId.slice('votacao_vote_'.length);

    const config = db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guild.id);
    if (!config || !config.ativa_hoje || config.encerrada_hoje) {
      return interaction.reply({ content: '❌ Esta votação já não está ativa.', ephemeral: true });
    }

    const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
    if (config.data_atual !== hojeStr) {
      return interaction.reply({ content: '❌ Esta votação já não está ativa.', ephemeral: true });
    }

    const opcoes = JSON.parse(config.opcoes);
    if (!opcoes.includes(opcao)) {
      return interaction.reply({ content: '❌ Opção inválida.', ephemeral: true });
    }

    db.prepare(`
      INSERT INTO votacao_votos (guild_id, data, user_id, opcao)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id, data, user_id) DO UPDATE SET opcao=excluded.opcao
    `).run(guild.id, hojeStr, user.id, opcao);

    return interaction.reply({ content: `✅ O teu voto em **${opcao}** foi registado! Podes mudar de opção a qualquer momento até a votação fechar.`, ephemeral: true });
  }

  // ── Votos em sugestões ──
  if (customId.startsWith('sug_up_') || customId.startsWith('sug_down_')) {
    const [,tipo, sugId] = customId.split('_');
    const id    = parseInt(sugId);
    const voto  = tipo === 'up' ? 'up' : 'down';

    const existing = db.prepare('SELECT * FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?').get(id, user.id);

    if (existing) {
      if (existing.vote === voto) {
        // Remove voto
        db.prepare('DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?').run(id, user.id);
        if (voto === 'up') db.prepare('UPDATE suggestions SET votes_up = MAX(0, votes_up-1) WHERE id = ?').run(id);
        else db.prepare('UPDATE suggestions SET votes_down = MAX(0, votes_down-1) WHERE id = ?').run(id);
      } else {
        // Muda voto
        db.prepare('UPDATE suggestion_votes SET vote = ? WHERE suggestion_id = ? AND user_id = ?').run(voto, id, user.id);
        if (voto === 'up') {
          db.prepare('UPDATE suggestions SET votes_up = votes_up+1, votes_down = MAX(0,votes_down-1) WHERE id = ?').run(id);
        } else {
          db.prepare('UPDATE suggestions SET votes_down = votes_down+1, votes_up = MAX(0,votes_up-1) WHERE id = ?').run(id);
        }
      }
    } else {
      // Novo voto
      db.prepare('INSERT INTO suggestion_votes (suggestion_id, user_id, vote) VALUES (?,?,?)').run(id, user.id, voto);
      if (voto === 'up') db.prepare('UPDATE suggestions SET votes_up = votes_up+1 WHERE id = ?').run(id);
      else db.prepare('UPDATE suggestions SET votes_down = votes_down+1 WHERE id = ?').run(id);
    }

    const sug = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id);

    // Atualiza o embed
    const oldEmbed = interaction.message.embeds[0];
    const embed    = EmbedBuilder.from(oldEmbed)
      .spliceFields(0, 2,
        { name: '👍 Votos positivos', value: `${sug.votes_up}`, inline: true },
        { name: '👎 Votos negativos', value: `${sug.votes_down}`, inline: true },
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sug_up_${id}`).setLabel(`👍 ${sug.votes_up}`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sug_down_${id}`).setLabel(`👎 ${sug.votes_down}`).setStyle(ButtonStyle.Danger),
    );

    await interaction.update({ embeds: [embed], components: [row] });
  }
}

// ============================
// HANDLER DE SELECT MENUS
// ============================
async function handleSelectMenu(interaction) {
  const { customId, values, guild, user } = interaction;

  if (customId === 'ticket_create_select') {
    await interaction.deferReply({ ephemeral: true });
    const valor  = values[0]; // ex: "tipo_3"
    const typeId = parseInt(valor.replace('tipo_', '')) || null;
    const result = await criarTicket(guild, user, typeId, interaction);
    if (result.erro) return interaction.editReply({ content: `❌ ${result.erro}` });
    return interaction.editReply({ content: `✅ Ticket criado: ${result.channel}` });
  }
}

// ============================
// HANDLER DE MODAIS
// ============================
async function handleModal(interaction) {
  const { customId, guild, user, channel } = interaction;

  // ── Configuração da votação recorrente (diária) ──
  if (customId === 'votacao_setup_modal_recorrente') {
    const titulo    = interaction.fields.getTextInputValue('votacao_titulo').trim();
    const descricao = interaction.fields.getTextInputValue('votacao_descricao').trim();
    const opcoesRaw = interaction.fields.getTextInputValue('votacao_opcoes').trim();
    const horaInicio = interaction.fields.getTextInputValue('votacao_hora_inicio').trim();
    const horaFim     = interaction.fields.getTextInputValue('votacao_hora_fim').trim();

    const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!horaRegex.test(horaInicio) || !horaRegex.test(horaFim)) {
      return interaction.reply({ content: '❌ Formato de hora inválido. Usa o formato **HH:MM** (24h), ex: `12:00`.', ephemeral: true });
    }

    const opcoes = opcoesRaw.split(',').map(o => o.trim()).filter(o => o.length > 0);
    if (opcoes.length < 2) {
      return interaction.reply({ content: '❌ Precisas de pelo menos **2 opções** separadas por vírgula.', ephemeral: true });
    }
    if (opcoes.length > 10) {
      return interaction.reply({ content: '❌ O máximo é **10 opções** (10 botões).', ephemeral: true });
    }
    if (opcoes.some(o => o.length > 80)) {
      return interaction.reply({ content: '❌ Cada opção deve ter no máximo 80 caracteres.', ephemeral: true });
    }

    const [hiH, hiM] = horaInicio.split(':').map(Number);
    const [hfH, hfM] = horaFim.split(':').map(Number);
    if (hiH * 60 + hiM >= hfH * 60 + hfM) {
      return interaction.reply({ content: '❌ A hora de início tem de ser antes da hora de fim.', ephemeral: true });
    }

    db.prepare(`
      INSERT INTO votacao_config (guild_id, channel_id, tipo, titulo, descricao, opcoes, hora_inicio, hora_fim, data_fim, created_by, ativa_hoje, encerrada_hoje, data_atual, message_id)
      VALUES (?, ?, 'recorrente', ?, ?, ?, ?, ?, NULL, ?, 0, 0, NULL, NULL)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id=excluded.channel_id,
        tipo='recorrente',
        titulo=excluded.titulo,
        descricao=excluded.descricao,
        opcoes=excluded.opcoes,
        hora_inicio=excluded.hora_inicio,
        hora_fim=excluded.hora_fim,
        data_fim=NULL,
        created_by=excluded.created_by,
        ativa_hoje=0,
        encerrada_hoje=0,
        data_atual=NULL,
        message_id=NULL
    `).run(guild.id, channel.id, titulo, descricao, JSON.stringify(opcoes), horaInicio, horaFim, user.id);

    const embed = embedPadrao(
      '✅ Votação Recorrente Configurada',
      `**Título:** ${titulo}\n**Descrição:** ${descricao}\n**Opções:** ${opcoes.join(' • ')}\n**Início:** ${horaInicio}\n**Fim:** ${horaFim}\n**Canal:** ${channel}\n\nA votação será publicada automaticamente todos os dias às **${horaInicio}** e encerrada às **${horaFim}**.`,
      CONFIG.COR_SUCESSO
    );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Configuração da votação de um dia único (começa imediatamente) ──
  if (customId === 'votacao_setup_modal_unica') {
    const titulo    = interaction.fields.getTextInputValue('votacao_titulo').trim();
    const descricao = interaction.fields.getTextInputValue('votacao_descricao').trim();
    const opcoesRaw = interaction.fields.getTextInputValue('votacao_opcoes').trim();
    const dataFim   = interaction.fields.getTextInputValue('votacao_data_fim').trim();
    const horaFim   = interaction.fields.getTextInputValue('votacao_hora_fim').trim();

    const dataRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const dataMatch = dataFim.match(dataRegex);
    if (!dataMatch) {
      return interaction.reply({ content: '❌ Formato de data inválido. Usa o formato **DD/MM/AAAA**, ex: `20/07/2026`.', ephemeral: true });
    }

    const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!horaRegex.test(horaFim)) {
      return interaction.reply({ content: '❌ Formato de hora inválido. Usa o formato **HH:MM** (24h), ex: `20:30`.', ephemeral: true });
    }

    const opcoes = opcoesRaw.split(',').map(o => o.trim()).filter(o => o.length > 0);
    if (opcoes.length < 2) {
      return interaction.reply({ content: '❌ Precisas de pelo menos **2 opções** separadas por vírgula.', ephemeral: true });
    }
    if (opcoes.length > 10) {
      return interaction.reply({ content: '❌ O máximo é **10 opções** (10 botões).', ephemeral: true });
    }
    if (opcoes.some(o => o.length > 80)) {
      return interaction.reply({ content: '❌ Cada opção deve ter no máximo 80 caracteres.', ephemeral: true });
    }

    const [, dd, mm, yyyy] = dataMatch;
    const dataFimISO = `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD, comparável com toLocaleDateString('en-CA', ...)

    // Valida que a data/hora de fim é no futuro (fuso Europe/Lisbon)
    const agora = new Date();
    const hojeISO = agora.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
    const horaAtual = agora.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false });

    if (dataFimISO < hojeISO || (dataFimISO === hojeISO && horaFim <= horaAtual)) {
      return interaction.reply({ content: '❌ A data/hora de fim tem de ser no futuro.', ephemeral: true });
    }

    // Guarda a configuração já como ativa (a votação começa imediatamente)
    db.prepare(`
      INSERT INTO votacao_config (guild_id, channel_id, tipo, titulo, descricao, opcoes, hora_inicio, hora_fim, data_fim, created_by, ativa_hoje, encerrada_hoje, data_atual, message_id)
      VALUES (?, ?, 'unica', ?, ?, ?, NULL, ?, ?, ?, 0, 0, NULL, NULL)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id=excluded.channel_id,
        tipo='unica',
        titulo=excluded.titulo,
        descricao=excluded.descricao,
        opcoes=excluded.opcoes,
        hora_inicio=NULL,
        hora_fim=excluded.hora_fim,
        data_fim=excluded.data_fim,
        created_by=excluded.created_by,
        ativa_hoje=0,
        encerrada_hoje=0,
        data_atual=NULL,
        message_id=NULL
    `).run(guild.id, channel.id, titulo, descricao, JSON.stringify(opcoes), horaFim, dataFimISO, user.id);

    await interaction.reply({
      content: `✅ Votação de dia único configurada! Vai começar já a ser publicada, e fecha em **${dataFimISO.split('-').reverse().join('/')} às ${horaFim}**.`,
      ephemeral: true
    });

    // Publica imediatamente
    const config = db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guild.id);
    await publicarVotacao(guild, config, hojeISO).catch(err => console.error('❌ Erro ao publicar votação única:', err.message));

    return;
  }

  // ── Avaliação de staff ──
  if (customId.startsWith('rating_')) {
    const parts     = customId.split('_');
    const staffId   = parts[1];
    const ticketId  = parseInt(parts[2]) || 0;
    const channelId = parts[3] && parts[3] !== '0' ? parts[3] : null;
    const rating    = parseInt(interaction.fields.getTextInputValue('rating_value'));
    const comment   = interaction.fields.getTextInputValue('rating_comment').trim();

    if (isNaN(rating) || rating < 1 || rating > 5) {
      return interaction.reply({ content: '❌ Avaliação inválida. Usa um número de 1 a 5.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    db.prepare(`
      INSERT INTO staff_ratings (guild_id, staff_id, user_id, ticket_id, rating, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(guild.id, staffId, user.id, ticketId, rating, comment || null);

    const estrelas = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

    // Envia embed no canal selecionado
    if (channelId) {
      try {
        const canalDestino = guild.channels.cache.get(channelId);
        if (canalDestino) {
          const staffUser = await client.users.fetch(staffId).catch(() => null);
          const embed = new EmbedBuilder()
            .setAuthor({ name: `Realizado por ${user.username}`, iconURL: user.displayAvatarURL() })
            .setTitle('📋 Avaliação de Staff')
            .setColor(CONFIG.COR_PRINCIPAL)
            .addFields(
              { name: 'Staff', value: staffUser ? `${staffUser} (@${staffUser.username})` : `<@${staffId}>`, inline: false },
              { name: 'Nota', value: `${estrelas} **${rating}/5**`, inline: false },
              { name: '📝 Feedback', value: comment || '*Sem comentário*', inline: false },
            )
            .setThumbnail(staffUser?.displayAvatarURL() || null)
            .setTimestamp();
          await canalDestino.send({ embeds: [embed] });
        }
      } catch (e) {
        console.error('Erro ao enviar avaliação para canal:', e);
      }
    }

    return interaction.editReply({ content: `✅ Avaliação enviada com sucesso!` });
  }

  // ── Adicionar utilizador ao ticket ──
  if (customId === 'ticket_adduser_modal') {
    const userId = interaction.fields.getTextInputValue('user_id_input').trim();
    await interaction.deferReply({ ephemeral: true });
    try {
      const membro = await guild.members.fetch(userId);
      await channel.permissionOverwrites.edit(membro.id, {
        ViewChannel: true, SendMessages: true
      });

      const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
      if (ticket) {
        db.prepare('INSERT OR IGNORE INTO ticket_users (ticket_id, user_id, added_by) VALUES (?,?,?)').run(ticket.id, userId, user.id);
      }

      return interaction.editReply({ content: `✅ ${membro} adicionado ao ticket!` });
    } catch (e) {
      return interaction.editReply({ content: `❌ Utilizador não encontrado: ${e.message}` });
    }
  }

  // ── Remover utilizador do ticket ──
  if (customId === 'ticket_removeuser_modal') {
    const userId = interaction.fields.getTextInputValue('user_id_input').trim();
    await interaction.deferReply({ ephemeral: true });
    try {
      const membro = await guild.members.fetch(userId);
      await channel.permissionOverwrites.delete(membro.id);
      return interaction.editReply({ content: `✅ ${membro} removido do ticket!` });
    } catch (e) {
      return interaction.editReply({ content: `❌ Erro: ${e.message}` });
    }
  }

  // ── Renomear ticket ──
  if (customId === 'ticket_rename_modal') {
    const newName = interaction.fields.getTextInputValue('new_name')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    await interaction.deferReply({ ephemeral: true });
    await channel.setName(newName);
    return interaction.editReply({ content: `✅ Canal renomeado para **${newName}**!` });
  }
}

// ============================
// EVENTOS DO CLIENTE DISCORD
// ============================

// ── Bot ligado ──
client.once(Events.ClientReady, async () => {
  console.log(`\n✅ Bot online como ${client.user.tag}`);
  console.log(`📊 A servir ${client.guilds.cache.size} servidor(es)\n`);

  definirPresenca();

  await registarComandos();
  iniciarCrons();
});

// Define a presença/atividade do bot. Chamada no arranque e também
// periodicamente (via cron), porque o Discord por vezes "esquece"
// a presença definida logo no evento ready, sobretudo após reconexões.
function definirPresenca() {
  client.user.setPresence({
    activities: [{ name: '/help', type: ActivityType.Watching }],
    status: 'online',
  });
}

// Reafirma a presença sempre que a ligação ao gateway do Discord é
// restabelecida — sem isto, uma reconexão (comum em hospedagem gratuita)
// pode deixar o bot "online" mas sem nenhuma atividade visível.
client.on(Events.ShardResume, () => definirPresenca());
client.on(Events.ShardReady, () => definirPresenca());

// ── Novo membro ──
client.on(Events.GuildMemberAdd, async member => {
  await sendWelcome(member);
  await verificarRaid(member);

  // Log
  const embed = embedPadrao(
    '📥 Membro Entrou',
    `**${member.user.tag}** entrou no servidor\n🆔 ${member.id}\n📅 Conta criada: <t:${Math.floor(member.user.createdTimestamp/1000)}:R>`,
    CONFIG.COR_SUCESSO
  ).setThumbnail(member.user.displayAvatarURL());
  await sendLog(member.guild, embed);
});

// ── Membro saiu ──
client.on(Events.GuildMemberRemove, async member => {
  const embed = embedPadrao(
    '📤 Membro Saiu',
    `**${member.user.tag}** saiu do servidor\n🆔 ${member.id}`,
    CONFIG.COR_ERRO
  ).setThumbnail(member.user.displayAvatarURL());
  await sendLog(member.guild, embed);
});

// ── Mensagem criada (antispam) ──
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;
  await verificarSpam(message);
});

// ── Mensagem apagada ──
client.on(Events.MessageDelete, async message => {
  if (!message.guild || message.author?.bot) return;
  const embed = embedPadrao(
    '🗑️ Mensagem Apagada',
    `**Autor:** ${message.author?.tag}\n**Canal:** <#${message.channel.id}>\n**Conteúdo:**\n${message.content?.substring(0, 1000) || '*Sem conteúdo*'}`,
    CONFIG.COR_ERRO
  );
  await sendLog(message.guild, embed);
});

// ── Mensagem editada ──
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  const embed = embedPadrao(
    '✏️ Mensagem Editada',
    `**Autor:** ${newMsg.author?.tag}\n**Canal:** <#${newMsg.channel.id}>\n\n**Antes:**\n${oldMsg.content?.substring(0,500) || '*Sem conteúdo*'}\n\n**Depois:**\n${newMsg.content?.substring(0,500)}`,
    CONFIG.COR_AVISO
  ).addFields({ name: '🔗 Link', value: `[Ver mensagem](${newMsg.url})` });
  await sendLog(newMsg.guild, embed);
});

// ── Reaction Roles ──
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch (_) { return; }
  }

  const emojiStr = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;

  const rr = db.prepare('SELECT * FROM reaction_roles WHERE message_id = ? AND (emoji = ? OR emoji = ?)').get(
    reaction.message.id, emojiStr, reaction.emoji.name
  );
  if (!rr) return;

  const guild  = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  const role   = guild.roles.cache.get(rr.role_id);
  if (!member || !role) return;

  await member.roles.add(role).catch(() => {});
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch (_) { return; }
  }

  const emojiStr = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;

  const rr = db.prepare('SELECT * FROM reaction_roles WHERE message_id = ? AND (emoji = ? OR emoji = ?)').get(
    reaction.message.id, emojiStr, reaction.emoji.name
  );
  if (!rr) return;

  const guild  = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  const role   = guild.roles.cache.get(rr.role_id);
  if (!member || !role) return;

  await member.roles.remove(role).catch(() => {});
});

// ── Canal deletado (limpa tickets da BD) ──
client.on(Events.ChannelDelete, channel => {
  db.prepare("UPDATE tickets SET status='deleted' WHERE channel_id = ?").run(channel.id);
});

// ============================
// SISTEMA DE VOTAÇÃO DIÁRIA
// ============================

/** Publica a votação do dia no canal configurado, marcando @everyone */
async function publicarVotacao(guild, config, hojeStr) {
  const canal = guild.channels.cache.get(config.channel_id);
  if (!canal) return;

  const opcoes = JSON.parse(config.opcoes);

  const embed = new EmbedBuilder()
    .setTitle(`🗳️ ${config.titulo}`)
    .setDescription(`${config.descricao}\n\nVotação aberta até às **${config.hora_fim}**. Clica num botão para votares!`)
    .setColor(CONFIG.COR_PRINCIPAL)
    .setTimestamp();

  const rows = [];
  for (let i = 0; i < opcoes.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      opcoes.slice(i, i + 5).map(o =>
        new ButtonBuilder()
          .setCustomId(`votacao_vote_${o}`)
          .setLabel(o.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
      )
    );
    rows.push(row);
  }

  try {
    const msg = await canal.send({
      content: '@everyone',
      embeds: [embed],
      components: rows,
      allowedMentions: { parse: ['everyone'] }
    });
    db.prepare(`
      UPDATE votacao_config
      SET ativa_hoje = 1, encerrada_hoje = 0, data_atual = ?, message_id = ?
      WHERE guild_id = ?
    `).run(hojeStr, msg.id, guild.id);
  } catch (err) {
    console.error(`❌ Erro ao publicar votação em ${guild.id}:`, err.message);
  }
}

/** Encerra a votação do dia, conta os votos e anuncia o(s) vencedor(es) */
async function encerrarVotacao(guild, config, hojeStr) {
  const canal = guild.channels.cache.get(config.channel_id);

  const votos = db.prepare('SELECT opcao, COUNT(*) as total FROM votacao_votos WHERE guild_id = ? AND data = ? GROUP BY opcao').all(guild.id, hojeStr);

  const opcoes = JSON.parse(config.opcoes);
  const contagem = {};
  opcoes.forEach(o => contagem[o] = 0);
  votos.forEach(v => { contagem[v.opcao] = v.total; });

  const totalVotos = Object.values(contagem).reduce((a, b) => a + b, 0);
  const maxVotos = Math.max(0, ...Object.values(contagem));
  const vencedores = maxVotos > 0 ? Object.keys(contagem).filter(o => contagem[o] === maxVotos) : [];

  // Desativa os botões da mensagem original
  if (canal && config.message_id) {
    try {
      const msg = await canal.messages.fetch(config.message_id);
      const oldRows = msg.components.map(row =>
        new ActionRowBuilder().addComponents(
          row.components.map(c => ButtonBuilder.from(c).setDisabled(true))
        )
      );
      await msg.edit({ components: oldRows });
    } catch (_) {}
  }

  if (canal) {
    const ranking = Object.entries(contagem)
      .sort((a, b) => b[1] - a[1])
      .map(([opcao, total]) => `**${opcao}** — ${total} voto${total === 1 ? '' : 's'}`)
      .join('\n');

    let resultadoTexto;
    if (totalVotos === 0) {
      resultadoTexto = 'Ninguém votou hoje. 😕';
    } else if (vencedores.length === 1) {
      resultadoTexto = `🏆 A opção vencedora foi **${vencedores[0]}** com **${maxVotos}** voto${maxVotos === 1 ? '' : 's'}!`;
    } else {
      resultadoTexto = `🏆 Empate entre: **${vencedores.join(', ')}**, cada uma com **${maxVotos}** votos!`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🗳️ Resultado: ${config.titulo}`)
      .setDescription(`${resultadoTexto}\n\n**Resultados:**\n${ranking}\n\n**Total de votos:** ${totalVotos}`)
      .setColor(CONFIG.COR_SUCESSO)
      .setTimestamp();

    await canal.send({ embeds: [embed] }).catch(() => {});
  }

  if (config.tipo === 'unica') {
    // Votação de dia único: não repete, remove a configuração por completo
    db.prepare('DELETE FROM votacao_config WHERE guild_id = ?').run(guild.id);
    db.prepare('DELETE FROM votacao_votos WHERE guild_id = ? AND data = ?').run(guild.id, hojeStr);
  } else {
    // Votação recorrente: fica pronta para o próximo dia
    db.prepare('UPDATE votacao_config SET encerrada_hoje = 1, ativa_hoje = 0 WHERE guild_id = ?').run(guild.id);
    db.prepare('DELETE FROM votacao_votos WHERE guild_id = ? AND data = ?').run(guild.id, hojeStr);
  }
}

/** Verifica todas as votações configuradas e publica/encerra conforme a hora atual (fuso: Europe/Lisbon) */
async function verificarVotacoes() {
  const now = new Date();
  // Usa sempre a hora de Portugal, independentemente do fuso horário do servidor (Render usa UTC)
  const horaAtual = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false });
  const hojeStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' }); // formato YYYY-MM-DD

  const configs = db.prepare('SELECT * FROM votacao_config').all();

  for (const config of configs) {
    const guild = client.guilds.cache.get(config.guild_id);
    if (!guild) continue;

    if (config.tipo === 'unica') {
      // Já foi publicada no momento do /votação-setup — só falta verificar a hora/data de encerrar
      if (config.ativa_hoje && !config.encerrada_hoje && hojeStr === config.data_fim && horaAtual === config.hora_fim) {
        await encerrarVotacao(guild, config, hojeStr).catch(err => console.error('❌ Erro ao encerrar votação única:', err.message));
      }
      continue;
    }

    // Votação recorrente (diária)
    // Novo dia: reinicia flags se necessário
    if (config.data_atual !== hojeStr && (config.ativa_hoje || config.encerrada_hoje)) {
      db.prepare('UPDATE votacao_config SET ativa_hoje = 0, encerrada_hoje = 0 WHERE guild_id = ?').run(config.guild_id);
      config.ativa_hoje = 0;
      config.encerrada_hoje = 0;
    }

    // Hora de iniciar
    if (horaAtual === config.hora_inicio && !config.ativa_hoje) {
      await publicarVotacao(guild, config, hojeStr).catch(err => console.error('❌ Erro ao publicar votação:', err.message));
    }

    // Hora de encerrar
    if (horaAtual === config.hora_fim && config.ativa_hoje && !config.encerrada_hoje) {
      await encerrarVotacao(guild, config, hojeStr).catch(err => console.error('❌ Erro ao encerrar votação:', err.message));
    }
  }
}

// ============================
// CRONS (TAREFAS AGENDADAS)
// ============================
function iniciarCrons() {
  // Atualiza server stats a cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    for (const guild of client.guilds.cache.values()) {
      await atualizarStats(guild).catch(() => {});
    }
  });

  // Reafirma a presença/atividade a cada 10 minutos, como rede de segurança
  // caso o evento de reconexão do gateway não dispare por alguma razão.
  cron.schedule('*/10 * * * *', () => definirPresenca());

  // Verifica votações diárias a cada minuto (início/fim)
  cron.schedule('* * * * *', () => verificarVotacoes());

  console.log('⏰ Crons agendados.');
}

// ============================
// DASHBOARD WEB (Express.js)
// ============================
// 🔧 Desativado por defeito (DASHBOARD_ATIVO=false) para poupar RAM no plano
// gratuito do Discloud (100MB). Nenhum comando do bot depende deste bloco.
// Para reativar, define a variável de ambiente DASHBOARD_ATIVO=true.
if (CONFIG.DASHBOARD_ATIVO) {

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: CONFIG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 } // 24h
}));

// Middleware de autenticação
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.redirect('/login');
}

// ── Página Principal / Login ──
app.get('/', (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  res.send(renderLoginPage());
});

app.get('/login', (req, res) => {
  res.send(renderLoginPage());
});

// ── OAuth2 Discord ──
app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,
    redirect_uri: CONFIG.REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login?error=no_code');

  try {
    // Troca o code por token
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: CONFIG.CLIENT_ID,
      client_secret: CONFIG.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: CONFIG.REDIRECT_URI,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token } = tokenRes.data;

    // Obtém dados do utilizador
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const discordUser = userRes.data;

    // Obtém servidores
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const guilds = guildsRes.data.filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)); // Admin only

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      avatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5 || 0}.png`,
      guilds,
      token: access_token,
    };

    res.redirect('/dashboard');
  } catch (e) {
    console.error('Auth error:', e.message);
    res.redirect('/login?error=auth_failed');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ── Dashboard Principal ──
app.get('/dashboard', requireAuth, (req, res) => {
  res.send(renderDashboard(req.session.user, null));
});

app.get('/dashboard/:guildId', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  const userGuild = req.session.user.guilds?.find(g => g.id === guildId);

  if (!guild || !userGuild) {
    return res.send(renderDashboard(req.session.user, null, 'Servidor não encontrado ou sem permissões.'));
  }

  const ticketConfig = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guildId);
  const guildConfig  = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  const antispam     = db.prepare('SELECT * FROM antispam_config WHERE guild_id = ?').get(guildId);
  const statsConfig  = db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);
  const votacaoConfig = db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guildId);
  const sugestaoConfig = db.prepare('SELECT * FROM suggestion_config WHERE guild_id = ?').get(guildId);
  const rrPaineis = db.prepare('SELECT * FROM reaction_role_panels WHERE guild_id = ? ORDER BY id DESC').all(guildId);
  const reactionRoles = rrPaineis.map(p => ({
    ...p,
    itens: db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ?').all(guildId, p.message_id)
  }));
  const ticketTypes = db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num, id').all(guildId);
  const savedEmbeds = db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
  const staffRanking = getRankingStaff(guildId);

  // Stats rápidos
  const totalTickets  = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ?").get(guildId)?.c || 0;
  const openTickets   = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND status='open'").get(guildId)?.c || 0;
  const totalWarns    = db.prepare("SELECT COUNT(*) as c FROM warns WHERE guild_id = ?").get(guildId)?.c || 0;
  const totalSugs     = db.prepare("SELECT COUNT(*) as c FROM suggestions WHERE guild_id = ?").get(guildId)?.c || 0;

  const channels = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText)
    .map(c => ({ id: c.id, name: c.name }));
  const roles = guild.roles.cache
    .filter(r => r.id !== guild.id)
    .sort((a,b) => b.position - a.position)
    .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));
  const categories = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildCategory)
    .map(c => ({ id: c.id, name: c.name }));

  // Lista de membros para dropdown de moderação (pesquisável)
  let members = [];
  try {
    await guild.members.fetch();
    members = guild.members.cache
      .filter(m => !m.user.bot)
      .map(m => ({ id: m.id, name: `${m.user.username}${m.nickname ? ' ('+m.nickname+')' : ''}` }))
      .sort((a,b) => a.name.localeCompare(b.name));
  } catch (e) {
    members = guild.members.cache
      .filter(m => !m.user.bot)
      .map(m => ({ id: m.id, name: m.user.username }));
  }

  res.send(renderGuildDashboard(req.session.user, guild, {
    ticketConfig, guildConfig, antispam, statsConfig, votacaoConfig, sugestaoConfig, reactionRoles,
    ticketTypes, savedEmbeds, staffRanking, members,
    totalTickets, openTickets, totalWarns, totalSugs,
    channels, roles, categories
  }));
});

// ── API Endpoints ──
app.post('/api/:guildId/ticket-config', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { category_id, log_channel, support_role, transcript_channel, max_tickets, welcome_msg } = req.body;

  db.prepare(`
    INSERT INTO ticket_config (guild_id, category_id, log_channel, support_role, transcript_channel, max_tickets, welcome_msg, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(guild_id) DO UPDATE SET
      category_id=excluded.category_id, log_channel=excluded.log_channel,
      support_role=excluded.support_role, transcript_channel=excluded.transcript_channel,
      max_tickets=excluded.max_tickets, welcome_msg=excluded.welcome_msg, enabled=1
  `).run(guildId, category_id||null, log_channel||null, support_role||null, transcript_channel||null, parseInt(max_tickets)||3, welcome_msg||'Olá {user}!');

  res.json({ ok: true, message: 'Configuração de tickets guardada!' });
});

app.post('/api/:guildId/welcome-config', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { welcome_channel, welcome_msg, welcome_embed, autorole } = req.body;

  db.prepare(`
    INSERT INTO guild_config (guild_id, welcome_channel, welcome_msg, welcome_embed, autorole)
    VALUES (?,?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET
      welcome_channel=excluded.welcome_channel, welcome_msg=excluded.welcome_msg,
      welcome_embed=excluded.welcome_embed, autorole=excluded.autorole
  `).run(guildId, welcome_channel||null, welcome_msg||'Bem-vindo {user}!', welcome_embed==='1'?1:0, autorole||null);

  res.json({ ok: true, message: 'Configuração de boas-vindas guardada!' });
});

app.post('/api/:guildId/antispam-config', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { enabled, max_messages, action, anti_links, anti_invites, anti_raid, log_channel } = req.body;

  db.prepare(`
    INSERT INTO antispam_config (guild_id, enabled, max_messages, action, anti_links, anti_invites, anti_raid, log_channel)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET
      enabled=excluded.enabled, max_messages=excluded.max_messages, action=excluded.action,
      anti_links=excluded.anti_links, anti_invites=excluded.anti_invites,
      anti_raid=excluded.anti_raid, log_channel=excluded.log_channel
  `).run(guildId, enabled==='1'?1:0, parseInt(max_messages)||5, action||'mute',
         anti_links==='1'?1:0, anti_invites==='1'?1:0, anti_raid==='1'?1:0, log_channel||null);

  res.json({ ok: true, message: 'Configuração AntiSpam guardada!' });
});

app.post('/api/:guildId/logs-config', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { log_channel, mod_log } = req.body;

  db.prepare(`
    INSERT INTO guild_config (guild_id, log_channel, mod_log)
    VALUES (?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET log_channel=excluded.log_channel, mod_log=excluded.mod_log
  `).run(guildId, log_channel||null, mod_log||null);

  res.json({ ok: true, message: 'Configuração de logs guardada!' });
});

app.get('/api/:guildId/stats', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const totalTickets = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ?").get(guildId)?.c || 0;
  const openTickets  = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND status='open'").get(guildId)?.c || 0;
  const totalWarns   = db.prepare("SELECT COUNT(*) as c FROM warns WHERE guild_id = ?").get(guildId)?.c || 0;
  const totalSugs    = db.prepare("SELECT COUNT(*) as c FROM suggestions WHERE guild_id = ?").get(guildId)?.c || 0;
  res.json({ totalTickets, openTickets, totalWarns, totalSugs });
});

app.get('/api/:guildId/tickets', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const tickets = db.prepare("SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guildId);
  res.json(tickets);
});

app.get('/api/:guildId/warns', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const warns = db.prepare("SELECT * FROM warns WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guildId);
  res.json(warns);
});

app.get('/api/:guildId/suggestions', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const suggestions = db.prepare("SELECT * FROM suggestions WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guildId);
  res.json(suggestions);
});

app.get('/api/:guildId/staff-ranking', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const ranking = getRankingStaff(guildId);
  res.json(ranking);
});

// ── Server Stats ──
app.post('/api/:guildId/stats-config', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  const { enabled } = req.body;

  try {
    let config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);
    if (!config) {
      db.prepare('INSERT INTO server_stats (guild_id) VALUES (?)').run(guildId);
      config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);
    }

    if (enabled) {
      db.prepare('UPDATE server_stats SET enabled = 1 WHERE guild_id = ?').run(guildId);
      await setupServerStats(guild, config);
      await atualizarStats(guild);
    } else {
      db.prepare('UPDATE server_stats SET enabled = 0 WHERE guild_id = ?').run(guildId);
    }

    res.json({ ok: true, message: enabled ? '✅ Server Stats ativado e canais criados!' : '✅ Server Stats desativado.' });
  } catch (e) {
    console.error('Erro stats-config:', e.message);
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/stats-atualizar', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  try {
    await atualizarStats(guild);
    res.json({ ok: true, message: '✅ Estatísticas atualizadas!' });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

// ── Sugestões ──
app.post('/api/:guildId/sugestao-config', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { channel_id, log_channel, ping_role, enabled } = req.body;

  db.prepare(`
    INSERT INTO suggestion_config (guild_id, channel_id, log_channel, ping_role, enabled)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id=excluded.channel_id,
      log_channel=excluded.log_channel,
      ping_role=excluded.ping_role,
      enabled=excluded.enabled
  `).run(guildId, channel_id || null, log_channel || null, ping_role || null, enabled ? 1 : 0);

  res.json({ ok: true, message: '✅ Configuração de sugestões guardada!' });
});

// ── Reaction Roles (100% Dashboard) ──
// Fluxo: escolhes canal + escreves mensagem + defines 1 a 5 pares emoji->cargo.
// O bot envia a mensagem exatamente como escrita e reage com os emojis escolhidos.
app.get('/api/:guildId/reaction-roles', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const paineis = db.prepare('SELECT * FROM reaction_role_panels WHERE guild_id = ? ORDER BY id DESC').all(guildId);
  const paineisComItens = paineis.map(p => ({
    ...p,
    itens: db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ?').all(guildId, p.message_id)
  }));
  res.json(paineisComItens);
});

app.post('/api/:guildId/reaction-roles', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  const { channel_id, conteudo } = req.body;
  let emojis  = req.body['emoji[]'];
  let cargos  = req.body['cargo[]'];
  if (!emojis) emojis = [];
  if (!cargos) cargos = [];
  if (!Array.isArray(emojis)) emojis = [emojis];
  if (!Array.isArray(cargos)) cargos = [cargos];

  if (!channel_id || !conteudo || !conteudo.trim()) {
    return res.status(400).json({ ok: false, message: 'Escolhe um canal e escreve a mensagem.' });
  }

  // Filtra pares válidos (emoji + cargo preenchidos)
  const pares = [];
  for (let i = 0; i < Math.max(emojis.length, cargos.length); i++) {
    const emoji = (emojis[i] || '').trim();
    const cargo = (cargos[i] || '').trim();
    if (emoji && cargo) pares.push({ emoji, cargo });
  }

  if (pares.length < 1) return res.status(400).json({ ok: false, message: 'Define pelo menos 1 emoji com o respetivo cargo.' });
  if (pares.length > 5) return res.status(400).json({ ok: false, message: 'O máximo são 5 emojis por mensagem.' });

  // Emojis não podem repetir-se na mesma mensagem
  const emojisUnicos = new Set(pares.map(p => p.emoji));
  if (emojisUnicos.size !== pares.length) {
    return res.status(400).json({ ok: false, message: 'Não podes repetir o mesmo emoji na mesma mensagem.' });
  }

  try {
    const canal = guild.channels.cache.get(channel_id);
    if (!canal) return res.status(404).json({ ok: false, message: 'Canal não encontrado.' });

    // O bot publica a mensagem exatamente como foi escrita no dashboard
    const msg = await canal.send({ content: conteudo });

    for (const par of pares) {
      await msg.react(par.emoji);
    }

    db.prepare(`
      INSERT INTO reaction_role_panels (guild_id, channel_id, message_id, conteudo)
      VALUES (?, ?, ?, ?)
    `).run(guildId, channel_id, msg.id, conteudo);

    const insertRR = db.prepare(`
      INSERT OR REPLACE INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const par of pares) {
      insertRR.run(guildId, channel_id, msg.id, par.emoji, par.cargo);
    }

    res.json({ ok: true, message: '✅ Mensagem publicada e reaction roles configurados!' });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/reaction-roles/delete', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { message_id } = req.body;
  const guild = client.guilds.cache.get(guildId);

  const painel = db.prepare('SELECT * FROM reaction_role_panels WHERE guild_id = ? AND message_id = ?').get(guildId, message_id);

  // Tenta apagar a mensagem original no Discord (se ainda existir)
  if (guild && painel) {
    try {
      const canal = guild.channels.cache.get(painel.channel_id);
      const msg = await canal?.messages.fetch(painel.message_id).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    } catch (_) {}
  }

  db.prepare('DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ?').run(guildId, message_id);
  db.prepare('DELETE FROM reaction_role_panels WHERE guild_id = ? AND message_id = ?').run(guildId, message_id);

  res.json({ ok: true, message: '✅ Painel de reaction roles removido!' });
});

// ── Moderação (Dashboard) ──
app.get('/api/:guildId/members', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  try {
    await guild.members.fetch();
  } catch (_) {}
  const members = guild.members.cache
    .filter(m => !m.user.bot)
    .map(m => ({ id: m.id, name: `${m.user.username}${m.nickname ? ' (' + m.nickname + ')' : ''}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(members);
});

app.post('/api/:guildId/mod/ban', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { user_id, motivo, dias } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!user_id) return res.status(400).json({ ok: false, message: 'Escolhe um membro.' });

  try {
    const target = await guild.members.fetch(user_id).catch(() => null);
    if (!target) return res.status(404).json({ ok: false, message: 'Membro não encontrado.' });
    if (!target.bannable) return res.status(400).json({ ok: false, message: 'Não é possível banir este membro (cargo demasiado alto).' });

    const razao = motivo || 'Sem motivo especificado';
    await target.ban({ reason: razao, deleteMessageDays: parseInt(dias) || 0 });
    logMod(guildId, 'BAN', target.id, req.session.user.id, razao);

    const embed = embedPadrao('🔨 Utilizador Banido (via Dashboard)', `**Utilizador:** <@${target.id}> (\`${target.user.tag}\`)\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_ERRO);
    await sendLog(guild, embed);

    res.json({ ok: true, message: `✅ ${target.user.tag} foi banido.` });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/mod/unban', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { user_id, motivo } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!user_id) return res.status(400).json({ ok: false, message: 'Indica o ID do utilizador.' });

  try {
    const razao = motivo || 'Sem motivo especificado';
    await guild.members.unban(user_id, razao);
    logMod(guildId, 'UNBAN', user_id, req.session.user.id, razao);
    const embed = embedPadrao('✅ Ban Removido (via Dashboard)', `**ID:** \`${user_id}\`\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_SUCESSO);
    await sendLog(guild, embed);
    res.json({ ok: true, message: '✅ Ban removido.' });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/mod/kick', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { user_id, motivo } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!user_id) return res.status(400).json({ ok: false, message: 'Escolhe um membro.' });

  try {
    const target = await guild.members.fetch(user_id).catch(() => null);
    if (!target) return res.status(404).json({ ok: false, message: 'Membro não encontrado.' });
    if (!target.kickable) return res.status(400).json({ ok: false, message: 'Não é possível expulsar este membro.' });

    const razao = motivo || 'Sem motivo especificado';
    await target.kick(razao);
    logMod(guildId, 'KICK', target.id, req.session.user.id, razao);
    const embed = embedPadrao('👢 Utilizador Expulso (via Dashboard)', `**Utilizador:** <@${target.id}>\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_ERRO);
    await sendLog(guild, embed);

    res.json({ ok: true, message: `✅ ${target.user.tag} foi expulso.` });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/mod/timeout', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { user_id, duracao, motivo } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!user_id) return res.status(400).json({ ok: false, message: 'Escolhe um membro.' });

  const durMs = parseDuration(duracao);
  if (!durMs) return res.status(400).json({ ok: false, message: 'Duração inválida. Usa por exemplo: 10m, 2h, 1d.' });

  try {
    const target = await guild.members.fetch(user_id).catch(() => null);
    if (!target) return res.status(404).json({ ok: false, message: 'Membro não encontrado.' });
    if (!target.moderatable) return res.status(400).json({ ok: false, message: 'Não é possível silenciar este membro.' });

    const razao = motivo || 'Sem motivo especificado';
    await target.timeout(durMs, razao);
    logMod(guildId, 'TIMEOUT', target.id, req.session.user.id, razao, duracao);
    const embed = embedPadrao('🔇 Utilizador Silenciado (via Dashboard)', `**Utilizador:** <@${target.id}>\n**Duração:** ${formatDuration(durMs)}\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_AVISO);
    await sendLog(guild, embed);

    res.json({ ok: true, message: `✅ ${target.user.tag} foi silenciado por ${formatDuration(durMs)}.` });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/mod/untimeout', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { user_id, motivo } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!user_id) return res.status(400).json({ ok: false, message: 'Escolhe um membro.' });

  try {
    const target = await guild.members.fetch(user_id).catch(() => null);
    if (!target) return res.status(404).json({ ok: false, message: 'Membro não encontrado.' });

    const razao = motivo || 'Sem motivo especificado';
    await target.timeout(null, razao);
    logMod(guildId, 'UNTIMEOUT', target.id, req.session.user.id, razao);
    const embed = embedPadrao('🔊 Silêncio Removido (via Dashboard)', `**Utilizador:** <@${target.id}>\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_SUCESSO);
    await sendLog(guild, embed);

    res.json({ ok: true, message: `✅ Silêncio removido de ${target.user.tag}.` });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/mod/warn', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { user_id, motivo } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!user_id || !motivo) return res.status(400).json({ ok: false, message: 'Escolhe um membro e escreve o motivo.' });

  try {
    const target = await guild.members.fetch(user_id).catch(() => null);
    if (!target) return res.status(404).json({ ok: false, message: 'Membro não encontrado.' });

    db.prepare('INSERT INTO warns (guild_id, user_id, mod_id, reason) VALUES (?, ?, ?, ?)').run(guildId, target.id, req.session.user.id, motivo);
    const total = db.prepare('SELECT COUNT(*) as c FROM warns WHERE guild_id = ? AND user_id = ?').get(guildId, target.id).c;
    logMod(guildId, 'WARN', target.id, req.session.user.id, motivo);

    const embed = embedPadrao('⚠️ Utilizador Avisado (via Dashboard)', `**Utilizador:** <@${target.id}>\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${motivo}\n**Total de avisos:** ${total}`, CONFIG.COR_AVISO);
    await sendLog(guild, embed);
    try { await target.send({ embeds: [embedPadrao('⚠️ Recebeste um aviso', `**Servidor:** ${guild.name}\n**Motivo:** ${motivo}\n**Avisos totais:** ${total}`, CONFIG.COR_AVISO)] }); } catch (_) {}

    res.json({ ok: true, message: `✅ ${target.user.tag} foi avisado. Total: ${total}.` });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/mod/clearwarns', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ ok: false, message: 'Escolhe um membro.' });

  const result = db.prepare('DELETE FROM warns WHERE guild_id = ? AND user_id = ?').run(guildId, user_id);
  res.json({ ok: true, message: `✅ ${result.changes} aviso(s) removido(s).` });
});

app.post('/api/:guildId/mod/limpar', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { channel_id, quantidade, user_id } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!channel_id) return res.status(400).json({ ok: false, message: 'Escolhe um canal.' });

  const qtd = Math.min(Math.max(parseInt(quantidade) || 10, 1), 100);

  try {
    const canal = guild.channels.cache.get(channel_id);
    if (!canal) return res.status(404).json({ ok: false, message: 'Canal não encontrado.' });

    let msgs = await canal.messages.fetch({ limit: 100 });
    if (user_id) msgs = msgs.filter(m => m.author.id === user_id);
    msgs = [...msgs.values()].slice(0, qtd);

    const apagadas = await canal.bulkDelete(msgs, true);
    const embed = embedPadrao('🗑️ Mensagens Apagadas (via Dashboard)', `**${apagadas.size}** mensagem(ns) apagada(s) em #${canal.name}.`, CONFIG.COR_SUCESSO);
    await sendLog(guild, embed);

    res.json({ ok: true, message: `✅ ${apagadas.size} mensagem(ns) apagada(s).` });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

// ── Tipos de Ticket (Dashboard) ──
app.get('/api/:guildId/ticket-types', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const tipos = db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num, id').all(guildId);
  res.json(tipos);
});

app.post('/api/:guildId/ticket-types', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { label, description, emoji, category_id, support_role, color } = req.body;
  if (!label) return res.status(400).json({ ok: false, message: 'Indica o nome do tipo de ticket.' });

  const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM ticket_types WHERE guild_id = ?').get(guildId)?.m || 0;

  db.prepare(`
    INSERT INTO ticket_types (guild_id, label, description, emoji, category_id, support_role, color, order_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, label, description || null, emoji || '🎫', category_id || null, support_role || null, color || CONFIG.COR_PRINCIPAL, maxOrder + 1);

  res.json({ ok: true, message: '✅ Tipo de ticket adicionado!' });
});

app.post('/api/:guildId/ticket-types/delete', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare('DELETE FROM ticket_types WHERE id = ? AND guild_id = ?').run(id, guildId);
  res.json({ ok: true, message: '✅ Tipo de ticket removido!' });
});

// ── Embeds (Dashboard) ──
app.get('/api/:guildId/embeds', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const embeds = db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
  res.json(embeds);
});

app.post('/api/:guildId/embeds/enviar', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { channel_id, titulo, descricao, cor, imagem, thumbnail, footer, guardar_como } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!channel_id || !titulo || !descricao) return res.status(400).json({ ok: false, message: 'Preenche canal, título e descrição.' });

  try {
    const canal = guild.channels.cache.get(channel_id);
    if (!canal) return res.status(404).json({ ok: false, message: 'Canal não encontrado.' });

    const embed = new EmbedBuilder().setTitle(titulo).setDescription(descricao).setColor(cor || CONFIG.COR_PRINCIPAL).setTimestamp();
    if (imagem)    embed.setImage(imagem);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer)    embed.setFooter({ text: footer });

    await canal.send({ embeds: [embed] });

    if (guardar_como && guardar_como.trim()) {
      const data = JSON.stringify({ title: titulo, description: descricao, color: cor || CONFIG.COR_PRINCIPAL, image: imagem || null, thumbnail: thumbnail || null, footer: footer || null });
      db.prepare('INSERT INTO saved_embeds (guild_id, name, data, created_by) VALUES (?, ?, ?, ?)').run(guildId, guardar_como.trim(), data, req.session.user.id);
    }

    res.json({ ok: true, message: '✅ Embed enviado!' });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/embeds/guardar', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { nome, titulo, descricao, cor, imagem, thumbnail, footer } = req.body;
  if (!nome || !titulo || !descricao) return res.status(400).json({ ok: false, message: 'Preenche nome, título e descrição.' });

  const data = JSON.stringify({ title: titulo, description: descricao, color: cor || CONFIG.COR_PRINCIPAL, image: imagem || null, thumbnail: thumbnail || null, footer: footer || null });
  db.prepare('INSERT INTO saved_embeds (guild_id, name, data, created_by) VALUES (?, ?, ?, ?)').run(guildId, nome, data, req.session.user.id);

  res.json({ ok: true, message: `✅ Embed "${nome}" guardado!` });
});

app.post('/api/:guildId/embeds/enviar-guardado', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { id, channel_id } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  const saved = db.prepare('SELECT * FROM saved_embeds WHERE id = ? AND guild_id = ?').get(id, guildId);
  if (!saved) return res.status(404).json({ ok: false, message: 'Embed não encontrado.' });

  try {
    const canal = guild.channels.cache.get(channel_id);
    if (!canal) return res.status(404).json({ ok: false, message: 'Canal não encontrado.' });

    const data  = JSON.parse(saved.data);
    const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp();
    if (data.image)     embed.setImage(data.image);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.footer)    embed.setFooter({ text: data.footer });

    await canal.send({ embeds: [embed] });
    res.json({ ok: true, message: '✅ Embed enviado!' });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/embeds/delete', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare('DELETE FROM saved_embeds WHERE id = ? AND guild_id = ?').run(id, guildId);
  res.json({ ok: true, message: '✅ Embed removido!' });
});

// ── Staff (Dashboard) ──
app.get('/api/:guildId/staff/ranking', requireAuth, (req, res) => {
  const { guildId } = req.params;
  res.json(getRankingStaff(guildId));
});

app.get('/api/:guildId/staff/historico/:staffId', requireAuth, (req, res) => {
  const { guildId, staffId } = req.params;
  const historico = db.prepare('SELECT * FROM staff_ratings WHERE guild_id = ? AND staff_id = ? ORDER BY created_at DESC LIMIT 20').all(guildId, staffId);
  const stats = db.prepare('SELECT AVG(rating) as media, COUNT(*) as total, MIN(rating) as min, MAX(rating) as max FROM staff_ratings WHERE guild_id = ? AND staff_id = ?').get(guildId, staffId);
  res.json({ historico, stats });
});

app.post('/api/:guildId/staff/avaliar', requireAuth, async (req, res) => {
  const { guildId } = req.params;
  const { staff_id, rating, comment } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!staff_id || !rating) return res.status(400).json({ ok: false, message: 'Escolhe um membro da staff e uma classificação.' });

  const nota = parseInt(rating);
  if (nota < 1 || nota > 5) return res.status(400).json({ ok: false, message: 'A classificação tem de ser entre 1 e 5.' });

  db.prepare('INSERT INTO staff_ratings (guild_id, staff_id, user_id, rating, comment) VALUES (?, ?, ?, ?, ?)')
    .run(guildId, staff_id, req.session.user.id, nota, comment || null);

  res.json({ ok: true, message: '✅ Avaliação registada!' });
});

app.post('/api/:guildId/staff/remover-avaliacao', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare('DELETE FROM staff_ratings WHERE id = ? AND guild_id = ?').run(id, guildId);
  res.json({ ok: true, message: '✅ Avaliação removida!' });
});

// ── Votação ──
app.post('/api/:guildId/votacao-config', requireAuth, (req, res) => {
  const { guildId } = req.params;
  const { channel_id, tipo, titulo, descricao, opcoes_raw, hora_inicio, hora_fim, data_fim } = req.body;

  if (!channel_id || !titulo || !descricao || !opcoes_raw || !hora_fim) {
    return res.status(400).json({ ok: false, message: 'Preenche todos os campos obrigatórios.' });
  }

  const opcoes = opcoes_raw.split(',').map(o => o.trim()).filter(o => o.length > 0);
  if (opcoes.length < 2) return res.status(400).json({ ok: false, message: 'Precisas de pelo menos 2 opções separadas por vírgula.' });
  if (opcoes.length > 10) return res.status(400).json({ ok: false, message: 'O máximo é 10 opções.' });
  if (opcoes.some(o => o.length > 80)) return res.status(400).json({ ok: false, message: 'Cada opção deve ter no máximo 80 caracteres.' });

  const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!horaRegex.test(hora_fim)) return res.status(400).json({ ok: false, message: 'Formato de hora de fim inválido (HH:MM).' });

  if (tipo === 'recorrente') {
    if (!hora_inicio || !horaRegex.test(hora_inicio)) return res.status(400).json({ ok: false, message: 'Formato de hora de início inválido (HH:MM).' });
    const [hiH, hiM] = hora_inicio.split(':').map(Number);
    const [hfH, hfM] = hora_fim.split(':').map(Number);
    if (hiH * 60 + hiM >= hfH * 60 + hfM) return res.status(400).json({ ok: false, message: 'A hora de início tem de ser antes da hora de fim.' });

    db.prepare(`
      INSERT INTO votacao_config (guild_id, channel_id, tipo, titulo, descricao, opcoes, hora_inicio, hora_fim, data_fim, ativa_hoje, encerrada_hoje, data_atual, message_id)
      VALUES (?, ?, 'recorrente', ?, ?, ?, ?, ?, NULL, 0, 0, NULL, NULL)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id=excluded.channel_id, tipo='recorrente', titulo=excluded.titulo, descricao=excluded.descricao,
        opcoes=excluded.opcoes, hora_inicio=excluded.hora_inicio, hora_fim=excluded.hora_fim, data_fim=NULL,
        ativa_hoje=0, encerrada_hoje=0, data_atual=NULL, message_id=NULL
    `).run(guildId, channel_id, titulo, descricao, JSON.stringify(opcoes), hora_inicio, hora_fim);

    return res.json({ ok: true, message: '✅ Votação recorrente configurada! Publica automaticamente todos os dias.' });
  }

  // tipo === 'unica'
  if (!data_fim) return res.status(400).json({ ok: false, message: 'Escolhe a data de fim.' });
  const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dataRegex.test(data_fim)) return res.status(400).json({ ok: false, message: 'Data de fim inválida.' });

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  const agora = new Date();
  const hojeISO = agora.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
  const horaAtual = agora.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false });
  if (data_fim < hojeISO || (data_fim === hojeISO && hora_fim <= horaAtual)) {
    return res.status(400).json({ ok: false, message: 'A data/hora de fim tem de ser no futuro.' });
  }

  db.prepare(`
    INSERT INTO votacao_config (guild_id, channel_id, tipo, titulo, descricao, opcoes, hora_inicio, hora_fim, data_fim, ativa_hoje, encerrada_hoje, data_atual, message_id)
    VALUES (?, ?, 'unica', ?, ?, ?, NULL, ?, ?, 0, 0, NULL, NULL)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id=excluded.channel_id, tipo='unica', titulo=excluded.titulo, descricao=excluded.descricao,
      opcoes=excluded.opcoes, hora_inicio=NULL, hora_fim=excluded.hora_fim, data_fim=excluded.data_fim,
      ativa_hoje=0, encerrada_hoje=0, data_atual=NULL, message_id=NULL
  `).run(guildId, channel_id, titulo, descricao, JSON.stringify(opcoes), hora_fim, data_fim);

  // Publica imediatamente
  const config = db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guildId);
  publicarVotacao(guild, config, hojeISO).catch(err => console.error('❌ Erro ao publicar votação única (dashboard):', err.message));

  res.json({ ok: true, message: '✅ Votação de dia único configurada e publicada!' });
});

app.post('/api/:guildId/votacao-remove', requireAuth, (req, res) => {
  const { guildId } = req.params;
  db.prepare('DELETE FROM votacao_config WHERE guild_id = ?').run(guildId);
  db.prepare('DELETE FROM votacao_votos WHERE guild_id = ?').run(guildId);
  res.json({ ok: true, message: '✅ Votação removida!' });
});

// ============================
// TEMPLATES HTML DO DASHBOARD
// ============================

/** CSS e JS partilhados do dashboard */
const dashboardCSS = `
  :root {
    --bg: #0f1117;
    --bg2: #1a1d27;
    --bg3: #22263a;
    --accent: #5865F2;
    --accent2: #4752c4;
    --success: #57F287;
    --danger: #ED4245;
    --warning: #FEE75C;
    --text: #dcddde;
    --text2: #8b9bbf;
    --border: #2d3250;
    --card-shadow: 0 4px 20px rgba(0,0,0,0.4);
    --radius: 12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: var(--bg2); } ::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 3px; }
  a { color: var(--accent); text-decoration: none; }
  .navbar { background: var(--bg2); border-bottom: 1px solid var(--border); padding: 0 24px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; backdrop-filter: blur(10px); }
  .navbar .logo { font-size: 1.3rem; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 10px; }
  .navbar .logo span { color: var(--accent); }
  .navbar .user { display: flex; align-items: center; gap: 10px; }
  .navbar .user img { width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--accent); }
  .navbar .logout-btn { background: var(--danger); color: #fff; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; }
  .container { max-width: 1300px; margin: 0 auto; padding: 28px 20px; }
  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; box-shadow: var(--card-shadow); }
  .card h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; color: var(--text); display: flex; align-items: center; gap: 8px; }
  .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
  .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
  .stat-card { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center; transition: transform 0.2s; }
  .stat-card:hover { transform: translateY(-3px); }
  .stat-card .num { font-size: 2.2rem; font-weight: 800; color: var(--accent); }
  .stat-card .lbl { font-size: 0.85rem; color: var(--text2); margin-top: 4px; }
  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 6px; color: var(--text2); }
  .form-group input, .form-group select, .form-group textarea { width: 100%; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; color: var(--text); font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--accent); }
  .form-group select option { background: var(--bg3); }
  .toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .toggle input[type=checkbox] { width: 40px; height: 22px; appearance: none; background: var(--border); border-radius: 11px; cursor: pointer; transition: background 0.2s; position: relative; }
  .toggle input[type=checkbox]:checked { background: var(--accent); }
  .toggle input[type=checkbox]::before { content:''; position: absolute; width: 18px; height: 18px; background: #fff; border-radius: 50%; top: 2px; left: 2px; transition: left 0.2s; }
  .toggle input[type=checkbox]:checked::before { left: 20px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 8px; border: none; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent2); }
  .btn-success { background: var(--success); color: #000; }
  .btn-danger  { background: var(--danger); color: #fff; }
  .btn-warning { background: var(--warning); color: #1a1a1a; }
  .btn-secondary { background: var(--bg3); color: var(--text); border: 1px solid var(--border); }
  .tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--border); }
  .tab { padding: 10px 18px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 0.9rem; color: var(--text2); background: transparent; border: none; transition: all 0.2s; }
  .tab.active { color: var(--accent); border-bottom: 2px solid var(--accent); background: var(--bg3); }
  .tab:hover { color: var(--text); }
  .tab-content { display: none; } .tab-content.active { display: block; }
  .table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  .table th { background: var(--bg3); padding: 10px 14px; text-align: left; color: var(--text2); font-weight: 600; }
  .table td { padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .table tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; }
  .badge-green  { background: rgba(87,242,135,.15); color: var(--success); }
  .badge-red    { background: rgba(237,66,69,.15); color: var(--danger); }
  .badge-yellow { background: rgba(254,231,92,.15); color: var(--warning); }
  .badge-blue   { background: rgba(88,101,242,.15); color: var(--accent); }
  .sidebar { width: 240px; background: var(--bg2); border-right: 1px solid var(--border); height: 100vh; position: fixed; top: 60px; left: 0; overflow-y: auto; padding: 16px 0; }
  .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 20px; color: var(--text2); cursor: pointer; transition: all 0.2s; border: none; background: none; width: 100%; font-size: 0.9rem; }
  .sidebar-item:hover, .sidebar-item.active { background: var(--bg3); color: var(--text); }
  .sidebar-item.active { border-right: 2px solid var(--accent); color: var(--accent); }
  .main-content { margin-left: 240px; padding: 24px; }
  .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; }
  .alert-success { background: rgba(87,242,135,.1); border: 1px solid var(--success); color: var(--success); }
  .alert-error   { background: rgba(237,66,69,.1); border: 1px solid var(--danger); color: var(--danger); }
  .guild-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 24px; }
  .guild-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center; cursor: pointer; transition: all 0.2s; }
  .guild-card:hover { border-color: var(--accent); transform: translateY(-4px); box-shadow: 0 8px 32px rgba(88,101,242,.2); }
  .guild-card img { width: 64px; height: 64px; border-radius: 50%; margin-bottom: 10px; }
  .guild-card .name { font-weight: 700; font-size: 0.95rem; }
  .guild-card .members { font-size: 0.8rem; color: var(--text2); margin-top: 4px; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 20px; color: var(--text); box-shadow: var(--card-shadow); z-index: 9999; transform: translateY(100px); opacity: 0; transition: all 0.3s; max-width: 320px; }
  .toast.show { transform: translateY(0); opacity: 1; }
  .toast.success { border-left: 4px solid var(--success); }
  .toast.error   { border-left: 4px solid var(--danger); }
  .section-title { font-size: 1.4rem; font-weight: 800; margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }
  .section-title span { font-size: 1.6rem; }
  .data-table { width: 100%; border-collapse: collapse; }
  .data-table th, .data-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
  .data-table th { color: var(--text2); font-weight: 700; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.5px; }
`;

const dashboardJS = `
  // Toast notification
  function toast(msg, type='success') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }
  // Tab system
  function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(target)?.classList.add('active');
      });
    });
  }
  // API save helper
  async function saveConfig(guildId, endpoint, formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const data = new FormData(form);
    const body = new URLSearchParams(data).toString();
    try {
      const res = await fetch('/api/' + guildId + '/' + endpoint, {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      if (json.ok) toast('✅ ' + json.message, 'success');
      else toast('❌ Erro ao guardar', 'error');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  document.addEventListener('DOMContentLoaded', initTabs);

  // ── Reaction Roles ──
  function addRrParLinha() {
    const container = document.getElementById('rr-pares');
    const linhas = container.querySelectorAll('.rr-par');
    if (linhas.length >= 5) { toast('❌ Máximo de 5 emojis por mensagem.', 'error'); return; }
    const nova = linhas[0].cloneNode(true);
    nova.querySelectorAll('input').forEach(i => i.value = '');
    nova.querySelectorAll('select').forEach(s => s.value = '');
    container.appendChild(nova);
  }
  async function addReactionRole(guildId) {
    const form = document.getElementById('form-rr-add');
    const data = new FormData(form);
    const body = new URLSearchParams(data).toString();
    try {
      const res = await fetch('/api/' + guildId + '/reaction-roles', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function removeReactionRole(guildId, messageId) {
    if (!confirm('Remover este painel de reaction roles? A mensagem original também será apagada do Discord.')) return;
    try {
      const res = await fetch('/api/' + guildId + '/reaction-roles/delete', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'message_id=' + encodeURIComponent(messageId)
      });
      const json = await res.json();
      toast(json.ok ? json.message : '❌ Erro', json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Server Stats ──
  async function saveStatsConfig(guildId, enabled) {
    try {
      const res = await fetch('/api/' + guildId + '/stats-config', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'enabled=' + (enabled ? '1' : '')
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 1000);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function atualizarStatsNow(guildId) {
    try {
      const res = await fetch('/api/' + guildId + '/stats-atualizar', { method: 'POST' });
      const json = await res.json();
      toast(json.ok ? json.message : '❌ Erro', json.ok ? 'success' : 'error');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Votação ──
  function toggleVotacaoTipo() {
    const tipo = document.getElementById('votacao-tipo').value;
    document.getElementById('votacao-campos-recorrente').style.display = tipo === 'recorrente' ? '' : 'none';
    document.getElementById('votacao-campos-unica').style.display = tipo === 'unica' ? '' : 'none';
  }
  async function saveVotacaoConfig(guildId) {
    const form = document.getElementById('form-votacao');
    const tipo = document.getElementById('votacao-tipo').value;
    const data = new FormData(form);
    if (tipo === 'recorrente') {
      data.set('hora_fim', data.get('hora_fim_rec') || '');
    } else {
      data.set('hora_fim', data.get('hora_fim_unica') || '');
    }
    data.delete('hora_fim_rec');
    data.delete('hora_fim_unica');
    const body = new URLSearchParams(data).toString();
    try {
      const res = await fetch('/api/' + guildId + '/votacao-config', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 1000);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function removeVotacao(guildId) {
    if (!confirm('Remover a votação configurada?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/votacao-remove', { method: 'POST' });
      const json = await res.json();
      toast(json.ok ? json.message : '❌ Erro', json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Moderação ──
  async function modAction(guildId, action, formId) {
    const form = document.getElementById(formId);
    const data = new FormData(form);
    const body = new URLSearchParams(data).toString();
    if (['ban','kick','timeout'].includes(action) && !confirm('Confirmas esta ação de moderação?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/mod/' + action, {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) form.reset();
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Tipos de Ticket ──
  async function addTicketType(guildId) {
    const form = document.getElementById('form-ticket-type');
    const data = new FormData(form);
    const body = new URLSearchParams(data).toString();
    try {
      const res = await fetch('/api/' + guildId + '/ticket-types', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function removeTicketType(guildId, id) {
    if (!confirm('Remover este tipo de ticket?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/ticket-types/delete', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + id
      });
      const json = await res.json();
      toast(json.ok ? json.message : '❌ Erro', json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Embeds ──
  async function enviarEmbed(guildId) {
    const form = document.getElementById('form-embed-send');
    const data = new FormData(form);
    const body = new URLSearchParams(data).toString();
    try {
      const res = await fetch('/api/' + guildId + '/embeds/enviar', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 1000);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function enviarEmbedGuardado(guildId, id) {
    const sel = document.getElementById('embed-canal-' + id);
    const channel_id = sel ? sel.value : '';
    if (!channel_id) { toast('❌ Escolhe um canal primeiro.', 'error'); return; }
    try {
      const res = await fetch('/api/' + guildId + '/embeds/enviar-guardado', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'},
        body: 'id=' + id + '&channel_id=' + channel_id
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function removeEmbed(guildId, id) {
    if (!confirm('Remover este embed guardado?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/embeds/delete', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + id
      });
      const json = await res.json();
      toast(json.ok ? json.message : '❌ Erro', json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Staff ──
  async function avaliarStaff(guildId) {
    const form = document.getElementById('form-staff-avaliar');
    const data = new FormData(form);
    const body = new URLSearchParams(data).toString();
    try {
      const res = await fetch('/api/' + guildId + '/staff/avaliar', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) { form.reset(); if (typeof loadRatings === 'function') loadRatings(); }
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
`;

/** Renderiza a página de login */
function renderLoginPage() {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord Bot — Dashboard</title>
  <style>
    ${dashboardCSS}
    .login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--bg) 0%, #1a1f35 100%); }
    .login-card { text-align: center; padding: 48px 40px; max-width: 420px; width: 100%; }
    .login-card .logo-big { font-size: 4rem; margin-bottom: 12px; }
    .login-card h1 { font-size: 2rem; font-weight: 800; margin-bottom: 8px; }
    .login-card p { color: var(--text2); margin-bottom: 32px; }
    .discord-btn { display: inline-flex; align-items: center; gap: 12px; background: #5865F2; color: #fff; padding: 14px 28px; border-radius: 10px; font-size: 1rem; font-weight: 700; text-decoration: none; transition: all 0.2s; }
    .discord-btn:hover { background: #4752c4; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(88,101,242,.3); }
    .features { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 32px; text-align: left; }
    .feature { background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 0.85rem; }
    .feature .icon { font-size: 1.2rem; margin-bottom: 4px; }
    .feature .label { font-weight: 600; }
    .feature .desc { color: var(--text2); font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="login-page">
    <div class="login-card card">
      <div class="logo-big">🤖</div>
      <h1>Discord Bot <span style="color:var(--accent)">PT</span></h1>
      <p>Painel de controlo completo para o teu servidor Discord</p>
      <a href="/auth/discord" class="discord-btn">
        <svg width="24" height="24" viewBox="0 0 71 55" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a40.5 40.5 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.3 0A39.7 39.7 0 0 0 25.6.4 58.4 58.4 0 0 0 11 5C1.6 19 -.98 32.6.31 46c6.2 4.5 12.2 7.2 18.1 9a43.5 43.5 0 0 0 3.8-6.2 38.3 38.3 0 0 1-6-2.9c.5-.36 1-.73 1.5-1.1a41.9 41.9 0 0 0 35.6 0c.5.39 1 .76 1.5 1.1a38.2 38.2 0 0 1-6 2.9 43.6 43.6 0 0 0 3.8 6.2c5.9-1.9 11.9-4.6 18.1-9 1.5-15.6-2.5-29.1-10.6-41.1ZM23.7 37.9c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2c0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2c0 4-2.8 7.2-6.4 7.2Z"/></svg>
        Entrar com Discord
      </a>
      <div class="features">
        <div class="feature"><div class="icon">🎫</div><div class="label">Tickets</div><div class="desc">Sistema completo</div></div>
        <div class="feature"><div class="icon">🛡️</div><div class="label">AntiSpam</div><div class="desc">Proteção avançada</div></div>
        <div class="feature"><div class="icon">📊</div><div class="label">Estatísticas</div><div class="desc">Tempo real</div></div>
        <div class="feature"><div class="icon">⚙️</div><div class="label">Configuração</div><div class="desc">100% visual</div></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/** Renderiza o dashboard de seleção de servidores */
function renderDashboard(user, selectedGuild, error = null) {
  const botGuilds = [...client.guilds.cache.values()];
  const userGuilds = user.guilds || [];
  const availableGuilds = userGuilds.filter(g => botGuilds.some(bg => bg.id === g.id));
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CONFIG.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard — Seleciona o Servidor</title>
  <style>${dashboardCSS}</style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">🤖 Discord Bot <span>PT</span></div>
    <div class="user">
      <img src="${user.avatar}" alt="avatar">
      <span>${user.username}</span>
      <a href="/logout"><button class="logout-btn">Sair</button></a>
    </div>
  </nav>
  <div class="container" style="padding-top:40px">
    ${error ? `<div class="alert alert-error">${error}</div>` : ''}
    <div class="section-title"><span>🏰</span> Os Teus Servidores</div>
    <p style="color:var(--text2);margin-bottom:8px">Seleciona um servidor para configurar:</p>
    ${availableGuilds.length === 0
      ? `<div class="alert alert-error">❌ Não tens servidores em comum com o bot. <a href="${inviteUrl}" target="_blank">Adiciona o bot aqui</a></div>`
      : `<div class="guild-grid">
          ${availableGuilds.map(g => {
            const botGuild = botGuilds.find(bg => bg.id === g.id);
            const icon = g.icon
              ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`
              : 'https://cdn.discordapp.com/embed/avatars/0.png';
            return `<a href="/dashboard/${g.id}" style="text-decoration:none">
              <div class="guild-card">
                <img src="${icon}" alt="${g.name}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                <div class="name">${g.name}</div>
                <div class="members">${botGuild?.memberCount || '?'} membros</div>
              </div>
            </a>`;
          }).join('')}
        </div>`
    }
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid var(--border);color:var(--text2);font-size:0.85rem">
      Bot não está no servidor? <a href="${inviteUrl}" target="_blank">Adiciona aqui</a>
    </div>
  </div>
</body>
</html>`;
}

/** Renderiza o dashboard completo de um servidor */
function renderGuildDashboard(user, guild, data) {
  const { ticketConfig, guildConfig, antispam, statsConfig, votacaoConfig, sugestaoConfig, reactionRoles, ticketTypes, savedEmbeds, staffRanking, members, totalTickets, openTickets, totalWarns, totalSugs, channels, roles, categories } = data;

  const makeSelect = (name, options, current, placeholder='Seleciona...') =>
    `<select name="${name}" id="${name}">
      <option value="">— ${placeholder} —</option>
      ${options.map(o => `<option value="${o.id}" ${o.id === current ? 'selected' : ''}>${o.name}</option>`).join('')}
    </select>`;

  const makeMemberSelect = (name, current) =>
    `<select name="${name}" id="${name}">
      <option value="">— Escolhe um membro —</option>
      ${members.map(m => `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${m.name}</option>`).join('')}
    </select>`;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${guild.name} — Dashboard</title>
  <style>
    ${dashboardCSS}
    @media(max-width:768px){.sidebar{display:none}.main-content{margin-left:0}}
  </style>
</head>
<body>
  <nav class="navbar">
    <div class="logo">
      <a href="/dashboard" style="color:var(--text2);font-size:1rem">← Voltar</a>
      &nbsp;|&nbsp; 🤖 <span>${guild.name}</span>
    </div>
    <div class="user">
      <img src="${user.avatar}" alt="avatar">
      <span>${user.username}</span>
      <a href="/logout"><button class="logout-btn">Sair</button></a>
    </div>
  </nav>

  <!-- Sidebar -->
  <div class="sidebar">
    <div style="padding:16px 20px 8px;font-size:0.75rem;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:1px">Configuração</div>
    ${[
      ['📊','Visão Geral','overview'],
      ['🎫','Tickets','tickets'],
      ['🔨','Moderação','mod_tab'],
      ['👋','Boas-vindas','welcome'],
      ['🛡️','AntiSpam','antispam'],
      ['📋','Logs','logs'],
      ['🎨','Embeds','embeds_tab'],
      ['⭐','Avaliações Staff','ratings'],
      ['💡','Sugestões','suggestions_tab'],
      ['🎭','Reaction Roles','rr_tab'],
      ['📈','Server Stats','stats_tab'],
      ['🗳️','Votação','votacao_tab'],
    ].map(([ico,lbl,id]) => `<button class="sidebar-item" onclick="showSection('${id}')">${ico} ${lbl}</button>`).join('')}
  </div>

  <!-- Conteúdo Principal -->
  <div class="main-content" id="main">

    <!-- VISÃO GERAL -->
    <div id="overview" class="section active">
      <div class="section-title"><span>📊</span> Visão Geral</div>
      <div class="grid-4" style="margin-bottom:24px">
        <div class="stat-card"><div class="num">${totalTickets}</div><div class="lbl">Total Tickets</div></div>
        <div class="stat-card"><div class="num" style="color:var(--success)">${openTickets}</div><div class="lbl">Tickets Abertos</div></div>
        <div class="stat-card"><div class="num" style="color:var(--warning)">${totalWarns}</div><div class="lbl">Avisos</div></div>
        <div class="stat-card"><div class="num" style="color:var(--accent)">${totalSugs}</div><div class="lbl">Sugestões</div></div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h2>🎫 Últimos Tickets</h2>
          <div id="tickets-table">A carregar...</div>
        </div>
        <div class="card">
          <h2>⚠️ Últimos Avisos</h2>
          <div id="warns-table">A carregar...</div>
        </div>
      </div>
    </div>

    <!-- TICKETS -->
    <div id="tickets" class="section" style="display:none">
      <div class="section-title"><span>🎫</span> Sistema de Tickets</div>
      <div class="card">
        <h2>⚙️ Configuração de Tickets</h2>
        <form id="form-tickets">
          <div class="grid-2">
            <div class="form-group">
              <label>Categoria dos Tickets</label>
              ${makeSelect('category_id', categories, ticketConfig?.category_id, 'Categoria')}
            </div>
            <div class="form-group">
              <label>Canal de Logs</label>
              ${makeSelect('log_channel', channels, ticketConfig?.log_channel, 'Canal de logs')}
            </div>
            <div class="form-group">
              <label>Cargo de Suporte</label>
              ${makeSelect('support_role', roles, ticketConfig?.support_role, 'Cargo de suporte')}
            </div>
            <div class="form-group">
              <label>Canal de Transcripts</label>
              ${makeSelect('transcript_channel', channels, ticketConfig?.transcript_channel, 'Canal transcripts')}
            </div>
            <div class="form-group">
              <label>Máximo de Tickets por Utilizador</label>
              <input type="number" name="max_tickets" value="${ticketConfig?.max_tickets || 3}" min="1" max="10">
            </div>
          </div>
          <div class="form-group">
            <label>Mensagem de Boas-vindas ({user}, {ticket})</label>
            <textarea name="welcome_msg" rows="3">${ticketConfig?.welcome_msg || 'Olá {user}! O teu ticket foi criado. A equipa irá responder brevemente.'}</textarea>
          </div>
          <button type="button" class="btn btn-primary" onclick="saveConfig('${guild.id}','ticket-config','form-tickets')">💾 Guardar Configuração</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🏷️ Tipos de Ticket</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">Cria diferentes tipos de ticket (ex: Suporte, Denúncia, Parceria). Se houver pelo menos 1 tipo, o painel de tickets mostra um menu de seleção em vez de um botão simples.</p>
        <form id="form-ticket-type">
          <div class="grid-2">
            <div class="form-group">
              <label>Nome do Tipo</label>
              <input type="text" name="label" placeholder="Ex: Suporte Técnico" maxlength="80">
            </div>
            <div class="form-group">
              <label>Emoji</label>
              <input type="text" name="emoji" placeholder="Ex: 🎫" maxlength="10">
            </div>
            <div class="form-group">
              <label>Categoria (onde o canal é criado)</label>
              ${makeSelect('category_id', categories, '', 'Usar a categoria padrão')}
            </div>
            <div class="form-group">
              <label>Cargo de Suporte deste tipo</label>
              ${makeSelect('support_role', roles, '', 'Usar o cargo padrão')}
            </div>
          </div>
          <div class="form-group">
            <label>Descrição (aparece no menu)</label>
            <input type="text" name="description" placeholder="Ex: Para problemas técnicos com a tua conta" maxlength="100">
          </div>
          <button type="button" class="btn btn-primary" onclick="addTicketType('${guild.id}')">➕ Adicionar Tipo</button>
        </form>
        <div id="ticket-types-table" style="margin-top:16px">
          ${ticketTypes.length ? `
            <table class="data-table">
              <thead><tr><th>Emoji</th><th>Nome</th><th>Descrição</th><th></th></tr></thead>
              <tbody>
                ${ticketTypes.map(t => `
                  <tr>
                    <td>${t.emoji || '🎫'}</td>
                    <td>${t.label}</td>
                    <td style="color:var(--text2)">${t.description || '—'}</td>
                    <td><button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="removeTicketType('${guild.id}', ${t.id})">🗑️</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<p style="color:var(--text2)">Nenhum tipo de ticket criado ainda — o painel usará um botão simples.</p>`}
        </div>
      </div>
    </div>

    <!-- MODERAÇÃO -->
    <div id="mod_tab" class="section" style="display:none">
      <div class="section-title"><span>🔨</span> Moderação</div>

      <div class="grid-2">
        <div class="card">
          <h2>🔨 Banir</h2>
          <form id="form-mod-ban">
            <div class="form-group"><label>Membro</label>${makeMemberSelect('user_id')}</div>
            <div class="form-group"><label>Motivo</label><input type="text" name="motivo" placeholder="Motivo do ban"></div>
            <div class="form-group"><label>Apagar mensagens (dias)</label><input type="number" name="dias" value="0" min="0" max="7"></div>
            <button type="button" class="btn btn-danger" onclick="modAction('${guild.id}','ban','form-mod-ban')">🔨 Banir</button>
          </form>
        </div>

        <div class="card">
          <h2>✅ Remover Ban</h2>
          <form id="form-mod-unban">
            <div class="form-group"><label>ID do Utilizador</label><input type="text" name="user_id" placeholder="ID do utilizador banido"></div>
            <div class="form-group"><label>Motivo</label><input type="text" name="motivo" placeholder="Motivo"></div>
            <button type="button" class="btn btn-primary" onclick="modAction('${guild.id}','unban','form-mod-unban')">✅ Remover Ban</button>
          </form>
        </div>

        <div class="card">
          <h2>👢 Expulsar</h2>
          <form id="form-mod-kick">
            <div class="form-group"><label>Membro</label>${makeMemberSelect('user_id')}</div>
            <div class="form-group"><label>Motivo</label><input type="text" name="motivo" placeholder="Motivo da expulsão"></div>
            <button type="button" class="btn btn-danger" onclick="modAction('${guild.id}','kick','form-mod-kick')">👢 Expulsar</button>
          </form>
        </div>

        <div class="card">
          <h2>🔇 Silenciar (Timeout)</h2>
          <form id="form-mod-timeout">
            <div class="form-group"><label>Membro</label>${makeMemberSelect('user_id')}</div>
            <div class="form-group"><label>Duração</label><input type="text" name="duracao" placeholder="Ex: 10m, 2h, 1d"></div>
            <div class="form-group"><label>Motivo</label><input type="text" name="motivo" placeholder="Motivo"></div>
            <button type="button" class="btn btn-warning" onclick="modAction('${guild.id}','timeout','form-mod-timeout')">🔇 Silenciar</button>
          </form>
        </div>

        <div class="card">
          <h2>🔊 Remover Silêncio</h2>
          <form id="form-mod-untimeout">
            <div class="form-group"><label>Membro</label>${makeMemberSelect('user_id')}</div>
            <div class="form-group"><label>Motivo</label><input type="text" name="motivo" placeholder="Motivo"></div>
            <button type="button" class="btn btn-primary" onclick="modAction('${guild.id}','untimeout','form-mod-untimeout')">🔊 Remover Silêncio</button>
          </form>
        </div>

        <div class="card">
          <h2>⚠️ Avisar</h2>
          <form id="form-mod-warn">
            <div class="form-group"><label>Membro</label>${makeMemberSelect('user_id')}</div>
            <div class="form-group"><label>Motivo</label><input type="text" name="motivo" placeholder="Motivo do aviso"></div>
            <button type="button" class="btn btn-warning" onclick="modAction('${guild.id}','warn','form-mod-warn')">⚠️ Avisar</button>
          </form>
        </div>

        <div class="card">
          <h2>🧹 Limpar Avisos</h2>
          <form id="form-mod-clearwarns">
            <div class="form-group"><label>Membro</label>${makeMemberSelect('user_id')}</div>
            <button type="button" class="btn btn-danger" onclick="modAction('${guild.id}','clearwarns','form-mod-clearwarns')">🧹 Limpar Avisos</button>
          </form>
        </div>

        <div class="card">
          <h2>🗑️ Limpar Mensagens</h2>
          <form id="form-mod-limpar">
            <div class="form-group"><label>Canal</label>${makeSelect('channel_id', channels, '', 'Canal')}</div>
            <div class="form-group"><label>Quantidade (1-100)</label><input type="number" name="quantidade" value="10" min="1" max="100"></div>
            <div class="form-group"><label>Só de um Membro (opcional)</label>${makeMemberSelect('user_id')}</div>
            <button type="button" class="btn btn-danger" onclick="modAction('${guild.id}','limpar','form-mod-limpar')">🗑️ Limpar Mensagens</button>
          </form>
        </div>
      </div>
    </div>

    <!-- EMBEDS -->
    <div id="embeds_tab" class="section" style="display:none">
      <div class="section-title"><span>🎨</span> Embeds</div>
      <div class="card">
        <h2>➕ Criar / Enviar Embed</h2>
        <form id="form-embed-send">
          <div class="grid-2">
            <div class="form-group">
              <label>Canal onde Enviar</label>
              ${makeSelect('channel_id', channels, '', 'Canal')}
            </div>
            <div class="form-group">
              <label>Cor (hex)</label>
              <input type="text" name="cor" value="${CONFIG.COR_PRINCIPAL}" placeholder="#5865F2">
            </div>
          </div>
          <div class="form-group">
            <label>Título</label>
            <input type="text" name="titulo" placeholder="Título do embed" maxlength="256">
          </div>
          <div class="form-group">
            <label>Descrição</label>
            <textarea name="descricao" rows="4" placeholder="Conteúdo do embed"></textarea>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>URL da Imagem (opcional)</label>
              <input type="text" name="imagem" placeholder="https://...">
            </div>
            <div class="form-group">
              <label>URL da Thumbnail (opcional)</label>
              <input type="text" name="thumbnail" placeholder="https://...">
            </div>
          </div>
          <div class="form-group">
            <label>Rodapé (opcional)</label>
            <input type="text" name="footer" placeholder="Texto do rodapé">
          </div>
          <div class="form-group">
            <label>Guardar como (opcional — dá-lhe um nome para reutilizares depois)</label>
            <input type="text" name="guardar_como" placeholder="Ex: regras-servidor">
          </div>
          <button type="button" class="btn btn-primary" onclick="enviarEmbed('${guild.id}')">🚀 Enviar Embed</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>📋 Embeds Guardados</h2>
        <div id="embeds-table">
          ${savedEmbeds.length ? `
            <table class="data-table">
              <thead><tr><th>Nome</th><th>Título</th><th>Enviar para</th><th></th></tr></thead>
              <tbody>
                ${savedEmbeds.map(e => {
                  let titulo = '—';
                  try { titulo = JSON.parse(e.data).title || '—'; } catch(_) {}
                  return `
                  <tr>
                    <td>${e.name}</td>
                    <td>${titulo}</td>
                    <td>
                      <select id="embed-canal-${e.id}" style="width:auto;display:inline-block;padding:4px 8px;font-size:0.8rem">
                        <option value="">Canal...</option>
                        ${channels.map(c => `<option value="${c.id}">#${c.name}</option>`).join('')}
                      </select>
                      <button type="button" class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem" onclick="enviarEmbedGuardado('${guild.id}', ${e.id})">📤</button>
                    </td>
                    <td><button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="removeEmbed('${guild.id}', ${e.id})">🗑️</button></td>
                  </tr>
                `}).join('')}
              </tbody>
            </table>
          ` : `<p style="color:var(--text2)">Nenhum embed guardado ainda.</p>`}
        </div>
      </div>
    </div>

    <!-- BOAS-VINDAS -->
    <div id="welcome" class="section" style="display:none">
      <div class="section-title"><span>👋</span> Boas-vindas & AutoRole</div>
      <div class="card">
        <form id="form-welcome">
          <div class="grid-2">
            <div class="form-group">
              <label>Canal de Boas-vindas</label>
              ${makeSelect('welcome_channel', channels, guildConfig?.welcome_channel, 'Canal')}
            </div>
            <div class="form-group">
              <label>AutoRole (Cargo automático)</label>
              ${makeSelect('autorole', roles, guildConfig?.autorole, 'Nenhum')}
            </div>
          </div>
          <div class="form-group">
            <label>Mensagem de Boas-vindas ({user}, {server}, {count})</label>
            <textarea name="welcome_msg" rows="3">${guildConfig?.welcome_msg || 'Bem-vindo(a) {user} ao {server}!'}</textarea>
          </div>
          <div class="form-group">
            <label class="toggle">
              <input type="checkbox" name="welcome_embed" value="1" ${guildConfig?.welcome_embed ? 'checked' : ''}>
              <span>Usar Embed nas boas-vindas</span>
            </label>
          </div>
          <button type="button" class="btn btn-primary" onclick="saveConfig('${guild.id}','welcome-config','form-welcome')">💾 Guardar</button>
        </form>
      </div>
    </div>

    <!-- ANTISPAM -->
    <div id="antispam" class="section" style="display:none">
      <div class="section-title"><span>🛡️</span> AntiSpam & Proteção</div>
      <div class="card">
        <form id="form-antispam">
          <div class="form-group">
            <label class="toggle">
              <input type="checkbox" name="enabled" value="1" ${antispam?.enabled ? 'checked' : ''}>
              <span><strong>Ativar AntiSpam</strong></span>
            </label>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Máx. Mensagens antes de Punir</label>
              <input type="number" name="max_messages" value="${antispam?.max_messages || 5}" min="2" max="20">
            </div>
            <div class="form-group">
              <label>Ação ao Detetar Spam</label>
              <select name="action">
                ${['mute','kick','ban'].map(a => `<option value="${a}" ${antispam?.action===a?'selected':''}>${a.charAt(0).toUpperCase()+a.slice(1)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Canal de Log do AntiSpam</label>
              ${makeSelect('log_channel', channels, antispam?.log_channel, 'Canal')}
            </div>
          </div>
          <div class="grid-2" style="margin-bottom:16px">
            <label class="toggle"><input type="checkbox" name="anti_links" value="1" ${antispam?.anti_links?'checked':''}><span>Bloquear Links Externos</span></label>
            <label class="toggle"><input type="checkbox" name="anti_invites" value="1" ${antispam?.anti_invites?'checked':''}><span>Bloquear Convites Discord</span></label>
            <label class="toggle"><input type="checkbox" name="anti_raid" value="1" ${antispam?.anti_raid?'checked':''}><span>Proteção Anti-Raid</span></label>
          </div>
          <button type="button" class="btn btn-primary" onclick="saveConfig('${guild.id}','antispam-config','form-antispam')">💾 Guardar</button>
        </form>
      </div>
    </div>

    <!-- LOGS -->
    <div id="logs" class="section" style="display:none">
      <div class="section-title"><span>📋</span> Sistema de Logs</div>
      <div class="card">
        <form id="form-logs">
          <div class="grid-2">
            <div class="form-group">
              <label>Canal de Logs Gerais</label>
              ${makeSelect('log_channel', channels, guildConfig?.log_channel, 'Canal')}
            </div>
            <div class="form-group">
              <label>Canal de Mod Log</label>
              ${makeSelect('mod_log', channels, guildConfig?.mod_log, 'Canal')}
            </div>
          </div>
          <div style="margin-top:8px;padding:12px;background:var(--bg3);border-radius:8px;font-size:0.85rem;color:var(--text2)">
            <strong>ℹ️ O que é registado:</strong> Entradas/saídas de membros, mensagens apagadas/editadas, bans, kicks, warns, timeouts.
          </div>
          <button type="button" class="btn btn-primary" style="margin-top:16px" onclick="saveConfig('${guild.id}','logs-config','form-logs')">💾 Guardar</button>
        </form>
      </div>
    </div>

    <!-- AVALIAÇÕES -->
    <div id="ratings" class="section" style="display:none">
      <div class="section-title"><span>⭐</span> Avaliações de Staff</div>

      <div class="card">
        <h2>➕ Avaliar Membro da Staff</h2>
        <form id="form-staff-avaliar">
          <div class="grid-2">
            <div class="form-group"><label>Membro da Staff</label>${makeMemberSelect('staff_id')}</div>
            <div class="form-group">
              <label>Classificação</label>
              <select name="rating">
                <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                <option value="4">⭐⭐⭐⭐ (4)</option>
                <option value="3">⭐⭐⭐ (3)</option>
                <option value="2">⭐⭐ (2)</option>
                <option value="1">⭐ (1)</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Comentário (opcional)</label>
            <textarea name="comment" rows="2" placeholder="Como correu o atendimento?"></textarea>
          </div>
          <button type="button" class="btn btn-primary" onclick="avaliarStaff('${guild.id}')">⭐ Enviar Avaliação</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🏆 Ranking de Staff</h2>
        <div id="ratings-table">A carregar...</div>
      </div>
    </div>

    <!-- SUGESTÕES -->
    <div id="suggestions_tab" class="section" style="display:none">
      <div class="section-title"><span>💡</span> Sugestões</div>
      <div class="card">
        <h2>⚙️ Configuração</h2>
        <form id="form-sugestao">
          <div class="form-group">
            <label class="toggle">
              <input type="checkbox" name="enabled" value="1" ${sugestaoConfig?.enabled ? 'checked' : ''}>
              <span><strong>Ativar Sistema de Sugestões</strong></span>
            </label>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Canal de Sugestões</label>
              ${makeSelect('channel_id', channels, sugestaoConfig?.channel_id, 'Canal')}
            </div>
            <div class="form-group">
              <label>Canal de Log</label>
              ${makeSelect('log_channel', channels, sugestaoConfig?.log_channel, 'Canal')}
            </div>
            <div class="form-group">
              <label>Cargo a Mencionar (opcional)</label>
              ${makeSelect('ping_role', roles, sugestaoConfig?.ping_role, 'Nenhum')}
            </div>
          </div>
          <button type="button" class="btn btn-primary" onclick="saveConfig('${guild.id}','sugestao-config','form-sugestao')">💾 Guardar Configuração</button>
        </form>
      </div>
      <div class="card" style="margin-top:20px">
        <h2>📋 Sugestões Recentes</h2>
        <div id="sugs-table">A carregar...</div>
      </div>
    </div>

    <!-- REACTION ROLES -->
    <div id="rr_tab" class="section" style="display:none">
      <div class="section-title"><span>🎭</span> Reaction Roles</div>
      <div class="card">
        <h2>➕ Criar Novo Painel de Reaction Roles</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Escolhe o canal, escreve a mensagem e define entre 1 a 5 emojis, cada um associado a um cargo.
          O bot publica exatamente a mensagem que escreveres nesse canal e reage automaticamente com os emojis escolhidos.
          Quando alguém reagir, recebe o cargo correspondente — se remover a reação, perde o cargo.
        </p>
        <form id="form-rr-add">
          <div class="form-group">
            <label>Canal onde publicar a mensagem</label>
            ${makeSelect('channel_id', channels, '', 'Canal')}
          </div>
          <div class="form-group">
            <label>Mensagem a publicar</label>
            <textarea name="conteudo" rows="4" placeholder="Ex: Reage para escolheres os teus cargos!&#10;✅ - Anúncios&#10;🎮 - Gamer"></textarea>
          </div>

          <div class="form-group">
            <label>Emojis e Cargos (mínimo 1, máximo 5)</label>
            <div id="rr-pares">
              <div class="grid-2 rr-par" style="margin-bottom:10px">
                <input type="text" name="emoji[]" placeholder="Emoji, ex: ✅">
                ${makeSelect('cargo[]', roles, '', 'Cargo')}
              </div>
            </div>
            <button type="button" class="btn" style="margin-top:4px" onclick="addRrParLinha('${guild.id}')">➕ Adicionar outro emoji</button>
          </div>

          <button type="button" class="btn btn-primary" style="margin-top:16px" onclick="addReactionRole('${guild.id}')">🚀 Publicar Mensagem e Ativar Reaction Roles</button>
        </form>
      </div>
      <div class="card" style="margin-top:20px">
        <h2>📋 Painéis de Reaction Roles Configurados</h2>
        <div id="rr-table">
          ${reactionRoles.length ? reactionRoles.map(p => `
            <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
                <div>
                  <div style="font-size:0.75rem;color:var(--text2);margin-bottom:4px">Canal: ${channels.find(c=>c.id===p.channel_id)?.name ? '#'+channels.find(c=>c.id===p.channel_id).name : p.channel_id}</div>
                  <div style="white-space:pre-wrap;font-size:0.9rem;margin-bottom:8px">${(p.conteudo || '').replace(/</g,'&lt;')}</div>
                </div>
                <button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem;flex-shrink:0" onclick="removeReactionRole('${guild.id}', '${p.message_id}')">🗑️ Remover</button>
              </div>
              <table class="data-table" style="margin-top:6px">
                <thead><tr><th>Emoji</th><th>Cargo</th></tr></thead>
                <tbody>
                  ${(p.itens || []).map(rr => `
                    <tr>
                      <td>${rr.emoji}</td>
                      <td>${roles.find(r=>r.id===rr.role_id)?.name || rr.role_id}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `).join('') : `<p style="color:var(--text2)">Ainda não há painéis de reaction roles configurados.</p>`}
        </div>
      </div>
    </div>

    <!-- SERVER STATS -->
    <div id="stats_tab" class="section" style="display:none">
      <div class="section-title"><span>📈</span> Server Stats</div>
      <div class="card">
        <div class="form-group">
          <label class="toggle">
            <input type="checkbox" id="stats-enabled" ${statsConfig?.enabled ? 'checked' : ''}>
            <span><strong>Ativar Server Stats</strong> (cria canais de voz com contagens que se atualizam sozinhas)</span>
          </label>
        </div>
        <div style="margin:8px 0 16px;padding:12px;background:var(--bg3);border-radius:8px;font-size:0.85rem;color:var(--text2)">
          <strong>ℹ️ Como funciona:</strong> ao ativar, o bot cria automaticamente uma categoria com canais de voz (membros, bots, canais, cargos, online, boosts) que mostram as contagens no próprio nome do canal, atualizados a cada 5 minutos.
        </div>
        <div class="grid-2">
          <button type="button" class="btn btn-primary" onclick="saveStatsConfig('${guild.id}', true)">✅ Ativar / Criar Canais</button>
          <button type="button" class="btn btn-danger" onclick="saveStatsConfig('${guild.id}', false)">⛔ Desativar</button>
        </div>
        ${statsConfig?.enabled ? `
          <button type="button" class="btn btn-primary" style="margin-top:12px" onclick="atualizarStatsNow('${guild.id}')">🔄 Forçar Atualização Agora</button>
        ` : ''}
      </div>
    </div>

    <!-- VOTAÇÃO -->
    <div id="votacao_tab" class="section" style="display:none">
      <div class="section-title"><span>🗳️</span> Votação</div>
      <div class="card">
        <h2>⚙️ Configurar Votação</h2>
        <form id="form-votacao">
          <div class="form-group">
            <label>Tipo de Votação</label>
            <select name="tipo" id="votacao-tipo" onchange="toggleVotacaoTipo()">
              <option value="recorrente" ${(!votacaoConfig || votacaoConfig.tipo==='recorrente') ? 'selected' : ''}>Recorrente (todos os dias)</option>
              <option value="unica" ${votacaoConfig?.tipo==='unica' ? 'selected' : ''}>Um dia único (começa agora ao guardar)</option>
            </select>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Canal onde publicar</label>
              ${makeSelect('channel_id', channels, votacaoConfig?.channel_id, 'Canal')}
            </div>
          </div>
          <div class="form-group">
            <label>Título</label>
            <input type="text" name="titulo" value="${votacaoConfig?.titulo || ''}" placeholder="Ex: Votação do Dia" maxlength="200">
          </div>
          <div class="form-group">
            <label>Descrição</label>
            <textarea name="descricao" rows="2" placeholder="Ex: Vota na tua opção favorita!">${votacaoConfig?.descricao || ''}</textarea>
          </div>
          <div class="form-group">
            <label>Opções dos botões (separadas por vírgula, máx. 10)</label>
            <input type="text" name="opcoes_raw" value="${votacaoConfig ? JSON.parse(votacaoConfig.opcoes).join(', ') : ''}" placeholder="Ex: Opção A, Opção B, Opção C">
          </div>
          <div class="grid-2" id="votacao-campos-recorrente" style="${votacaoConfig?.tipo==='unica' ? 'display:none' : ''}">
            <div class="form-group">
              <label>Hora de Início (diária, HH:MM)</label>
              <input type="text" name="hora_inicio" value="${votacaoConfig?.hora_inicio || ''}" placeholder="Ex: 12:00">
            </div>
            <div class="form-group">
              <label>Hora de Fim (diária, HH:MM)</label>
              <input type="text" name="hora_fim_rec" value="${votacaoConfig?.tipo!=='unica' ? (votacaoConfig?.hora_fim || '') : ''}" placeholder="Ex: 20:30">
            </div>
          </div>
          <div class="grid-2" id="votacao-campos-unica" style="${votacaoConfig?.tipo==='unica' ? '' : 'display:none'}">
            <div class="form-group">
              <label>Data de Fim</label>
              <input type="date" name="data_fim" value="${votacaoConfig?.data_fim || ''}">
            </div>
            <div class="form-group">
              <label>Hora de Fim (HH:MM)</label>
              <input type="text" name="hora_fim_unica" value="${votacaoConfig?.tipo==='unica' ? (votacaoConfig?.hora_fim || '') : ''}" placeholder="Ex: 20:30">
            </div>
          </div>
          <div style="margin:8px 0 16px;padding:12px;background:var(--bg3);border-radius:8px;font-size:0.85rem;color:var(--text2)">
            ⚠️ Guardar substitui qualquer votação já configurada neste servidor. Se for "Um dia único", a votação é publicada imediatamente com @everyone.
          </div>
          <div class="grid-2">
            <button type="button" class="btn btn-primary" onclick="saveVotacaoConfig('${guild.id}')">💾 Guardar e Publicar</button>
            ${votacaoConfig ? `<button type="button" class="btn btn-danger" onclick="removeVotacao('${guild.id}')">🗑️ Remover Votação Atual</button>` : ''}
          </div>
        </form>
        ${votacaoConfig ? `
          <div style="margin-top:20px;padding:12px;background:var(--bg3);border-radius:8px;font-size:0.85rem">
            <strong>Estado atual:</strong> ${votacaoConfig.ativa_hoje ? '🟢 Ativa neste momento' : '⚪ Inativa (aguarda a próxima hora de início)'}
          </div>
        ` : ''}
      </div>
    </div>

  </div><!-- /main-content -->

  <div class="toast" id="toast"></div>

  <script>
    const GUILD_ID = '${guild.id}';
    ${dashboardJS}

    function showSection(id) {
      document.querySelectorAll('.section').forEach(s => s.style.display='none');
      document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
      const section = document.getElementById(id);
      if(section) section.style.display='block';
      event.target.classList.add('active');
      if(id==='overview') loadOverviewData();
      if(id==='ratings') loadRatings();
      if(id==='suggestions_tab') loadSuggestions();
    }

    async function loadOverviewData() {
      // Tickets
      try {
        const r = await fetch('/api/'+GUILD_ID+'/tickets');
        const tickets = await r.json();
        const html = tickets.length ? '<table class="table"><thead><tr><th>#</th><th>Utilizador</th><th>Estado</th><th>Data</th></tr></thead><tbody>' +
          tickets.slice(0,8).map(t => '<tr><td>#'+String(t.ticket_number).padStart(4,'0')+'</td><td>'+t.user_id+'</td><td><span class="badge badge-'+(t.status==='open'?'green':'red')+'">'+t.status+'</span></td><td>'+new Date(t.created_at).toLocaleDateString('pt-PT')+'</td></tr>').join('') +
          '</tbody></table>' : '<p style="color:var(--text2)">Nenhum ticket ainda.</p>';
        document.getElementById('tickets-table').innerHTML = html;
      } catch(e) { document.getElementById('tickets-table').innerHTML = '<p style="color:var(--danger)">Erro ao carregar tickets</p>'; }

      // Warns
      try {
        const r2 = await fetch('/api/'+GUILD_ID+'/warns');
        const warns = await r2.json();
        const html2 = warns.length ? '<table class="table"><thead><tr><th>Utilizador</th><th>Motivo</th><th>Mod</th><th>Data</th></tr></thead><tbody>' +
          warns.slice(0,8).map(w => '<tr><td>'+w.user_id+'</td><td>'+w.reason+'</td><td>'+w.mod_id+'</td><td>'+new Date(w.created_at).toLocaleDateString('pt-PT')+'</td></tr>').join('') +
          '</tbody></table>' : '<p style="color:var(--text2)">Nenhum aviso ainda.</p>';
        document.getElementById('warns-table').innerHTML = html2;
      } catch(e) { document.getElementById('warns-table').innerHTML = '<p style="color:var(--danger)">Erro ao carregar avisos</p>'; }
    }

    async function loadRatings() {
      try {
        const r = await fetch('/api/'+GUILD_ID+'/staff-ranking');
        const ranking = await r.json();
        const html = ranking.length ? '<table class="table"><thead><tr><th>Posição</th><th>Staff ID</th><th>Média</th><th>Total</th><th>Min/Max</th></tr></thead><tbody>' +
          ranking.map((r,i) => '<tr><td>'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1))+'</td><td>'+r.staff_id+'</td><td>⭐ '+parseFloat(r.media).toFixed(1)+'/5</td><td>'+r.total+'</td><td>'+r.minimo+'/'+r.maximo+'</td></tr>').join('') +
          '</tbody></table>' : '<p style="color:var(--text2)">Sem avaliações ainda.</p>';
        document.getElementById('ratings-table').innerHTML = html;
      } catch(e) {}
    }

    async function loadSuggestions() {
      try {
        const r = await fetch('/api/'+GUILD_ID+'/suggestions');
        const sugs = await r.json();
        const statusMap = {pending:'🕐 Pendente',approve:'✅ Aprovada',reject:'❌ Rejeitada',consider:'🤔 Consideração'};
        const html = sugs.length ? '<table class="table"><thead><tr><th>#</th><th>Conteúdo</th><th>Utilizador</th><th>Estado</th><th>Votos</th></tr></thead><tbody>' +
          sugs.slice(0,15).map(s => '<tr><td>'+s.id+'</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.content+'</td><td>'+s.user_id+'</td><td>'+statusMap[s.status]+'</td><td>👍 '+s.votes_up+' / 👎 '+s.votes_down+'</td></tr>').join('') +
          '</tbody></table>' : '<p style="color:var(--text2)">Sem sugestões ainda.</p>';
        document.getElementById('sugs-table').innerHTML = html;
      } catch(e) {}
    }

    // Carrega dados iniciais
    loadOverviewData();
  </script>
</body>
</html>`;
}

// ============================
// INICIA O SERVIDOR WEB
// ============================
app.listen(CONFIG.DASHBOARD_PORT, () => {
  console.log(`\n🌐 Dashboard disponível em: http://localhost:${CONFIG.DASHBOARD_PORT}`);
});

} else {
  console.log('🌐 Dashboard web desativado (DASHBOARD_ATIVO=false) — a poupar RAM.');
}

// ============================
// INICIA O BOT DISCORD
// ============================
client.login(CONFIG.TOKEN).catch(err => {
  console.error('❌ Erro ao fazer login no Discord:', err.message);
  console.error('👉 Verifica se o TOKEN está correto no ficheiro.');
  process.exit(1);
});

// ============================
// TRATAMENTO DE ERROS
// ============================
process.on('unhandledRejection', err => {
  console.error('⚠️ UnhandledRejection:', err?.message || err);
});
process.on('uncaughtException', err => {
  console.error('⚠️ UncaughtException:', err?.message || err);
});

// ============================
// FIM DO FICHEIRO index.js
// ============================
