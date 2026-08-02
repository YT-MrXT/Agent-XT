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
  ActivityType, WebhookClient
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
// 🔴 IMPORTANTE: no Render, sem um Persistent Disk, este ficheiro é apagado
// a cada novo deploy e perdes toda a configuração guardada.
// Define a variável de ambiente DB_PATH a apontar para o disco persistente
// (ex: DB_PATH=/var/data/discord_bot.db) nas Environment Variables do Render.
// Se DB_PATH não estiver definida, usa-se o caminho local (bom para testar no PC).
const DB_PATH = process.env.DB_PATH || './discord_bot.db';

// Garante que a pasta do caminho da BD existe (necessário para discos montados vazios)
const dbDir = path.dirname(DB_PATH);
if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
console.log(`📂 A usar base de dados em: ${DB_PATH}`);

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
      bot_nickname  TEXT,
      bot_avatar_url TEXT,
      bot_webhook_name TEXT,
      immune_roles  TEXT DEFAULT '[]',
      immune_admins INTEGER DEFAULT 0,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Migração: garante as colunas de identidade do bot em bases de dados já existentes
  try {
    const gcCols = db.prepare("PRAGMA table_info(guild_config)").all();
    if (!gcCols.some(c => c.name === 'bot_nickname'))     db.exec('ALTER TABLE guild_config ADD COLUMN bot_nickname TEXT');
    if (!gcCols.some(c => c.name === 'bot_avatar_url'))   db.exec('ALTER TABLE guild_config ADD COLUMN bot_avatar_url TEXT');
    if (!gcCols.some(c => c.name === 'bot_webhook_name')) db.exec('ALTER TABLE guild_config ADD COLUMN bot_webhook_name TEXT');
    if (!gcCols.some(c => c.name === 'immune_roles'))     db.exec("ALTER TABLE guild_config ADD COLUMN immune_roles TEXT DEFAULT '[]'");
    if (!gcCols.some(c => c.name === 'immune_admins'))    db.exec('ALTER TABLE guild_config ADD COLUMN immune_admins INTEGER DEFAULT 0');
  } catch (e) { console.error('❌ Erro na migração de guild_config (identidade do bot):', e.message); }

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
      order_num   INTEGER DEFAULT 0,
      has_form    INTEGER DEFAULT 0
    );
  `);
  // Migração: garante a coluna has_form em bases de dados já existentes
  try {
    const cols = db.prepare("PRAGMA table_info(ticket_types)").all();
    if (!cols.some(c => c.name === 'has_form')) {
      db.exec('ALTER TABLE ticket_types ADD COLUMN has_form INTEGER DEFAULT 0');
    }
  } catch (e) { console.error('❌ Erro na migração de ticket_types.has_form:', e.message); }

  // Perguntas do formulário de cada tipo de ticket
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_form_questions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      type_id    INTEGER NOT NULL,
      question   TEXT NOT NULL,
      style      TEXT DEFAULT 'short',
      required   INTEGER DEFAULT 1,
      order_num  INTEGER DEFAULT 0
    );
  `);

  // Respostas dadas pelo utilizador ao criar o ticket
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_form_answers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   INTEGER NOT NULL,
      question    TEXT NOT NULL,
      answer      TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
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
      update_interval   INTEGER DEFAULT 5,
      show_emoji        INTEGER DEFAULT 1,
      show_members      INTEGER DEFAULT 1,
      show_bots         INTEGER DEFAULT 1,
      show_channels     INTEGER DEFAULT 1,
      show_roles        INTEGER DEFAULT 1,
      show_boosts       INTEGER DEFAULT 1
    );
  `);

  // Migração: adiciona colunas novas a instalações antigas de server_stats
  try {
    const cols = db.prepare("PRAGMA table_info(server_stats)").all().map(c => c.name);
    const novasColunas = [
      ['show_emoji', 'INTEGER DEFAULT 1'],
      ['show_members', 'INTEGER DEFAULT 1'],
      ['show_bots', 'INTEGER DEFAULT 1'],
      ['show_channels', 'INTEGER DEFAULT 1'],
      ['show_roles', 'INTEGER DEFAULT 1'],
      ['show_boosts', 'INTEGER DEFAULT 1'],
    ];
    for (const [nome, tipo] of novasColunas) {
      if (!cols.includes(nome)) {
        db.exec(`ALTER TABLE server_stats ADD COLUMN ${nome} ${tipo}`);
      }
    }
  } catch (e) {
    console.error('❌ Erro na migração da tabela server_stats:', e.message);
  }

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

  // Moderação - Blacklist (ban automático ao entrar, por servidor)
  db.exec(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      user_id     TEXT,
      username    TEXT NOT NULL,
      reason      TEXT,
      added_by    TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, username)
    );
  `);

  // Migração: instalações antigas tinham user_id NOT NULL + UNIQUE(guild_id, user_id).
  // Se detetarmos esse schema antigo, recriamos a tabela preservando os dados.
  try {
    const cols = db.prepare("PRAGMA table_info(blacklist)").all();
    const userIdCol = cols.find(c => c.name === 'user_id');
    const usernameCol = cols.find(c => c.name === 'username');
    const precisaMigrar = (userIdCol && userIdCol.notnull === 1) || (usernameCol && usernameCol.notnull === 0);
    if (precisaMigrar) {
      db.exec(`
        ALTER TABLE blacklist RENAME TO blacklist_old;
        CREATE TABLE blacklist (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id    TEXT NOT NULL,
          user_id     TEXT,
          username    TEXT NOT NULL,
          reason      TEXT,
          added_by    TEXT NOT NULL,
          created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(guild_id, username)
        );
        INSERT INTO blacklist (guild_id, user_id, username, reason, added_by, created_at)
          SELECT guild_id, user_id, COALESCE(NULLIF(username, ''), user_id), reason, added_by, created_at FROM blacklist_old;
        DROP TABLE blacklist_old;
      `);
      console.log('✅ Migração da tabela blacklist concluída.');
    }
  } catch (e) {
    console.error('❌ Erro na migração da tabela blacklist:', e.message);
  }

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
      log_channel     TEXT,
      trap_channel    TEXT,
      anti_bot_add    INTEGER DEFAULT 0,
      blocked_words   TEXT DEFAULT '[]',
      blocked_links   TEXT DEFAULT '[]'
    );
  `);

  // Migração suave: garante as colunas novas em bases de dados já existentes
  try { db.exec(`ALTER TABLE antispam_config ADD COLUMN trap_channel TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE antispam_config ADD COLUMN anti_bot_add INTEGER DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE antispam_config ADD COLUMN blocked_words TEXT DEFAULT '[]'`); } catch (_) {}
  try { db.exec(`ALTER TABLE antispam_config ADD COLUMN blocked_links TEXT DEFAULT '[]'`); } catch (_) {}

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
  // Migração suave: colunas de agendamento (envio automático de X em X tempo)
  try { db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_channel TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_interval_minutes INTEGER`); } catch (_) {}
  try { db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_active INTEGER DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_next_send DATETIME`); } catch (_) {}
  try { db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_quantity INTEGER DEFAULT 1`); } catch (_) {}
  // Envio diário a horas fixas (até 5 horários "HH:MM" separados por vírgula, ex: "08:00,13:30,20:00")
  try { db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_daily_times TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_daily_active INTEGER DEFAULT 0`); } catch (_) {}
  try { db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_daily_channel TEXT`); } catch (_) {}
  // Guarda "YYYY-MM-DD HH:MM" do último envio diário feito para cada horário, para não repetir no mesmo minuto/dia
  try { db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_daily_last_sent TEXT DEFAULT '{}'`); } catch (_) {}

  // Corrige agendamentos ativos gravados no formato ISO (bug antigo: new Date().toISOString()
  // não é comparável com datetime('now') do SQLite) — recalcula usando o formato correto.
  try {
    const comBugPotencial = db.prepare(
      `SELECT id, schedule_interval_minutes FROM saved_embeds WHERE schedule_active = 1 AND schedule_next_send LIKE '%T%'`
    ).all();
    for (const row of comBugPotencial) {
      db.prepare(
        `UPDATE saved_embeds SET schedule_next_send = datetime('now', '+' || ? || ' minutes') WHERE id = ?`
      ).run(row.schedule_interval_minutes || 60, row.id);
    }
    if (comBugPotencial.length) console.log(`✅ Corrigidos ${comBugPotencial.length} agendamento(s) de embed com formato de data inválido.`);
  } catch (_) {}

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

  // Cargos — AutoRole (pessoas e bots, multi-cargo) e Exclusividade de Cargos
  db.exec(`
    CREATE TABLE IF NOT EXISTS autorole_config (
      guild_id     TEXT NOT NULL,
      role_id      TEXT NOT NULL,
      target       TEXT NOT NULL DEFAULT 'human', -- 'human' ou 'bot'
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, role_id, target)
    );
  `);

  // Exclusividade de Cargos: quem ganha 'gain_role_id' perde 'lose_role_id'
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_exclusivity (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      gain_role_id TEXT NOT NULL,
      lose_role_id TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, gain_role_id, lose_role_id)
    );
  `);

  // Perguntas à comunidade (cria embed + tópico/thread com botão de resposta)
  db.exec(`
    CREATE TABLE IF NOT EXISTS perguntas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      channel_id   TEXT NOT NULL,
      message_id   TEXT,
      thread_id    TEXT,
      pergunta     TEXT NOT NULL,
      created_by   TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
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

/**
 * Envia uma pergunta a um canal de texto: cria a embed da pergunta, cria um
 * tópico (thread) associado para as respostas, e adiciona um botão na
 * mensagem original a levar diretamente para esse tópico.
 * Retorna { ok, message, perguntaId? }.
 */
async function enviarPergunta(guild, canal, texto, criadoPorId) {
  if (!canal || canal.type !== ChannelType.GuildText) {
    return { ok: false, message: 'Canal inválido — escolhe um canal de texto.' };
  }

  try {
    const embed = new EmbedBuilder()
      .setTitle('❓ Pergunta à Comunidade')
      .setDescription(texto)
      .setColor(CONFIG.COR_PRINCIPAL)
      .setFooter({ text: '✍️ Deixe aqui as suas respostas!' })
      .setTimestamp();

    const msg = await canal.send({ embeds: [embed] });

    // Cria o tópico (thread) associado à mensagem para as pessoas responderem
    const thread = await msg.startThread({
      name: texto.length > 90 ? texto.slice(0, 87) + '...' : texto,
      autoArchiveDuration: 10080, // 7 dias
      reason: 'Tópico de respostas para pergunta à comunidade',
    });

    // Botão que leva diretamente ao tópico criado
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('✍️ Deixe aqui as suas respostas!')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${guild.id}/${thread.id}`)
    );

    await msg.edit({ embeds: [embed], components: [row] });

    const info = db.prepare(`
      INSERT INTO perguntas (guild_id, channel_id, message_id, thread_id, pergunta, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(guild.id, canal.id, msg.id, thread.id, texto, criadoPorId || null);

    return { ok: true, message: 'Pergunta enviada com sucesso.', perguntaId: info.lastInsertRowid };
  } catch (err) {
    console.error('❌ Erro ao enviar pergunta:', err.message);
    return { ok: false, message: `Erro ao enviar pergunta: ${err.message}` };
  }
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

/**
 * Aplica o apelido (nickname) do bot num servidor específico.
 * Isto É suportado nativamente pelo Discord (PATCH /guilds/{id}/members/@me).
 */
async function aplicarNicknameBot(guild, nickname) {
  try {
    if (!guild?.members?.me) return { ok: false, error: 'Bot não encontrado no servidor.' };
    await guild.members.me.setNickname(nickname && nickname.trim() ? nickname.trim() : null);
    return { ok: true };
  } catch (e) {
    console.error('❌ Erro ao aplicar nickname do bot:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * O Discord NÃO permite avatar diferente por servidor para bots (só nickname).
 * Como alternativa, criamos/reutilizamos um Webhook no canal indicado e enviamos
 * a mensagem através dele, definindo "username" e "avatarURL" próprios daquele
 * servidor. A mensagem aparece com o nome/foto escolhidos, mas continua a contar
 * como vinda do "bot" para quem está a ver o canal.
 * Isto só se aplica às mensagens enviadas desta forma — o perfil/membro do bot
 * mantém o avatar global do Discord.
 */
async function getOuCriarWebhookCanal(channel, nomeWebhook = 'Bot Identity') {
  try {
    if (!channel || !channel.fetchWebhooks) return null;
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(w => w.owner?.id === client.user.id);
    if (!webhook) {
      webhook = await channel.createWebhook({
        name: nomeWebhook,
        reason: 'Webhook criado para identidade personalizada do bot neste servidor',
      });
    }
    return webhook;
  } catch (e) {
    console.error('❌ Erro ao obter/criar webhook do canal:', e.message);
    return null;
  }
}

/**
 * Envia uma mensagem "como o bot" respeitando o nome/avatar personalizados
 * configurados no dashboard para este servidor (via webhook). Se não houver
 * configuração de avatar personalizado, cai automaticamente para client.send normal.
 */
async function enviarComoIdentidadeDoBot(channel, payload) {
  try {
    const config = getGuildConfig(channel.guild.id);
    if (!config?.bot_avatar_url && !config?.bot_webhook_name) {
      return channel.send(payload);
    }
    const webhook = await getOuCriarWebhookCanal(channel, config.bot_webhook_name || client.user.username);
    if (!webhook) return channel.send(payload);

    return webhook.send({
      ...payload,
      username: config.bot_webhook_name || client.user.username,
      avatarURL: config.bot_avatar_url || client.user.displayAvatarURL(),
    });
  } catch (e) {
    console.error('❌ Erro ao enviar como identidade do bot:', e.message);
    try { return channel.send(payload); } catch (_) {}
  }
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

/** Converte o nome de um tipo de ticket num slug válido para nome de canal (ex: "Carta de Condução" -> "carta-de-condução") */
function slugifyTipoTicket(text) {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u00C0-\u017F-]/g, '')
    .substring(0, 30) || 'ticket';
}

/** Devolve o ID do cargo de suporte efetivo de um ticket (tipo específico ou o padrão do servidor) */
function obterCargoSuporteTicket(ticket, ticketConfig) {
  if (!ticket) return ticketConfig?.support_role || null;
  const tipo = ticket.type_id ? db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(ticket.type_id) : null;
  return tipo?.support_role || ticketConfig?.support_role || null;
}

/** Verifica se o membro faz parte da equipa de admins/suporte autorizada a reclamar tickets */
function isEquipaAdminTicket(member, guild, ticket) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const ticketConfig = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guild.id);
  const cargoId = obterCargoSuporteTicket(ticket, ticketConfig);
  if (cargoId && member.roles.cache.has(cargoId)) return true;
  return false;
}

/** Cria um ticket para o utilizador (respostas: array opcional de { question, answer } do formulário) */
async function criarTicket(guild, user, typeId, interaction, respostas = []) {
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
  const tipoSlug = tipo?.label ? slugifyTipoTicket(tipo.label) : 'ticket';
  const channel = await guild.channels.create({
    name: `${tipoSlug}-${String(ticketNum).padStart(4, '0')}-${user.username.toLowerCase().replace(/\s/g, '-').substring(0, 15)}`,
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
    new ButtonBuilder().setCustomId('ticket_close_reason').setLabel('📝 Fechar com Motivo').setStyle(ButtonStyle.Danger),
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

  // Se o tipo de ticket tinha formulário, guarda e mostra as respostas
  if (respostas && respostas.length) {
    const insertAns = db.prepare('INSERT INTO ticket_form_answers (ticket_id, question, answer) VALUES (?, ?, ?)');
    for (const r of respostas) insertAns.run(ticketId, r.question, r.answer || '');

    const embedForm = new EmbedBuilder()
      .setTitle('📋 Respostas do Formulário')
      .setColor(CONFIG.COR_PRINCIPAL)
      .addFields(respostas.map(r => ({
        name: `❓ ${r.question}`.substring(0, 256),
        value: (r.answer && r.answer.trim()) ? r.answer.substring(0, 1024) : '_(sem resposta)_',
      })))
      .setTimestamp();
    await channel.send({ embeds: [embedForm] });
  }

  return { channel, ticketNum, ticketId };
}

/** Fecha um ticket */
async function fecharTicket(channel, closedBy, guild, reason = null) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
  if (!ticket) return;

  // Gera transcript ANTES de apagar o canal (precisa das mensagens)
  const html   = await gerarTranscript(channel);
  const buffer = Buffer.from(html, 'utf-8');

  // Atualiza BD
  db.prepare(`UPDATE tickets SET status='closed', closed_at=CURRENT_TIMESTAMP WHERE channel_id=?`).run(channel.id);

  // Deleta o canal já a seguir — sem esperar por DMs ou envio de logs
  try {
    await channel.delete();
  } catch (err) {
    console.error(`❌ Erro ao eliminar canal do ticket #${ticket.ticket_number} (${channel.id}):`, err.message);
    await channel.send({
      content: `⚠️ Não foi possível eliminar este canal automaticamente (\`${err.message}\`). Verifica se o bot tem a permissão **Gerir Canais** aqui, ou apaga manualmente.`
    }).catch(() => {});
  }

  // ── A partir daqui corre em background, não atrasa o fecho do ticket ──

  // Envia transcript ao utilizador
  (async () => {
    try {
      const attachmentUser = new AttachmentBuilder(buffer, { name: `transcript-${ticket.ticket_number}.html` });
      const user = await client.users.fetch(ticket.user_id);
      const embedUser = embedPadrao(
        '🎫 Ticket Fechado',
        `O teu ticket **#${String(ticket.ticket_number).padStart(4,'0')}** foi fechado.${reason ? `\n\n📝 **Motivo do encerramento:**\n${reason}` : ''}\nAqui está o transcript da conversa:`,
        CONFIG.COR_AVISO
      );
      await user.send({ embeds: [embedUser], files: [attachmentUser] }).catch(() => {});
    } catch (_) {}
  })();

  // Envia transcript para o canal de transcripts
  (async () => {
    try {
      const ticketConfig = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guild.id);
      if (ticketConfig?.transcript_channel) {
        const ch = guild.channels.cache.get(ticketConfig.transcript_channel);
        if (ch) {
          const attachmentLog = new AttachmentBuilder(buffer, { name: `transcript-${ticket.ticket_number}.html` });
          const embed = new EmbedBuilder()
            .setTitle(`📄 Transcript - Ticket #${String(ticket.ticket_number).padStart(4,'0')}`)
            .setColor(CONFIG.COR_AVISO)
            .addFields(
              { name: '👤 Utilizador', value: `<@${ticket.user_id}>`, inline: true },
              { name: '🔒 Fechado por', value: `<@${closedBy}>`, inline: true },
              { name: '📅 Fechado em', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
              ...(reason ? [{ name: '📝 Motivo', value: reason }] : []),
            )
            .setTimestamp();
          await ch.send({ embeds: [embed], files: [attachmentLog] });
        }
      }
    } catch (_) {}
  })();
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

/** Definição de todos os canais de stats disponíveis */
const STATS_CANAIS_DEF = [
  { key: 'members_channel',  showKey: 'show_members',  emoji: '👥', label: 'Membros' },
  { key: 'bots_channel',     showKey: 'show_bots',     emoji: '🤖', label: 'Bots' },
  { key: 'channels_channel', showKey: 'show_channels', emoji: '📢', label: 'Canais' },
  { key: 'roles_channel',    showKey: 'show_roles',    emoji: '🎭', label: 'Cargos' },
  { key: 'boosts_channel',   showKey: 'show_boosts',   emoji: '🚀', label: 'Boosts' },
];

/** Cria, atualiza e apaga canais de server stats conforme a configuração escolhida */
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
  const valores = { members: stats.membros, bots: stats.bots, channels: stats.canais, roles: stats.cargos, boosts: stats.boosts };
  const comEmoji = config.show_emoji !== 0;

  const updates = { category_id: categoryId };

  for (const c of STATS_CANAIS_DEF) {
    const ativo = config[c.showKey] !== 0; // default: ativo
    const valorAtual = valores[c.key.replace('_channel', '')];
    const nome = comEmoji ? `${c.emoji} ${c.label}: ${valorAtual}` : `${c.label}: ${valorAtual}`;
    let ch = config[c.key] ? guild.channels.cache.get(config[c.key]) : null;

    if (!ativo) {
      // Canal desmarcado: apaga se existir
      if (ch) await ch.delete().catch(() => {});
      updates[c.key] = null;
      continue;
    }

    if (!ch) {
      ch = await guild.channels.create({
        name: nome,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.Connect] }
        ]
      });
    } else {
      await ch.setName(nome).catch(() => {});
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

/** Apaga todos os canais (e a categoria, se ficar vazia) de server stats deste servidor */
async function apagarCanaisServerStats(guild, config) {
  for (const c of STATS_CANAIS_DEF) {
    const chId = config[c.key];
    if (!chId) continue;
    const ch = guild.channels.cache.get(chId);
    if (ch) await ch.delete().catch(() => {});
  }
  if (config.category_id) {
    const cat = guild.channels.cache.get(config.category_id);
    if (cat) {
      const temFilhos = guild.channels.cache.some(c => c.parentId === config.category_id);
      if (!temFilhos) await cat.delete().catch(() => {});
    }
  }
  db.prepare(`
    UPDATE server_stats SET
      category_id=NULL, members_channel=NULL, bots_channel=NULL,
      channels_channel=NULL, roles_channel=NULL, boosts_channel=NULL
    WHERE guild_id=?
  `).run(guild.id);
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

/** Atualiza todos os canais de stats ativos */
async function atualizarStats(guild) {
  const config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ? AND enabled = 1').get(guild.id);
  if (!config) return;

  const stats = await calcularStats(guild);
  const valores = { members: stats.membros, bots: stats.bots, channels: stats.canais, roles: stats.cargos, boosts: stats.boosts };
  const comEmoji = config.show_emoji !== 0;

  for (const c of STATS_CANAIS_DEF) {
    if (config[c.showKey] === 0) continue;
    const id = config[c.key];
    if (!id) continue;
    const valorAtual = valores[c.key.replace('_channel', '')];
    const nome = comEmoji ? `${c.emoji} ${c.label}: ${valorAtual}` : `${c.label}: ${valorAtual}`;
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

  // Autorole (legado — cargo único configurado em welcome-setup)
  if (config.autorole) {
    const role = member.guild.roles.cache.get(config.autorole);
    if (role) await member.roles.add(role).catch(() => {});
  }

  // Autorole (novo — multi-cargo, aba "Cargos" do dashboard)
  await aplicarAutoRole(member);
}

/**
 * Dá a um membro (pessoa ou bot) todos os cargos configurados como AutoRole
 * para o seu tipo (humano ou bot), e aplica exclusividade de cargos de seguida.
 */
async function aplicarAutoRole(member) {
  const target = member.user.bot ? 'bot' : 'human';
  const linhas = db.prepare('SELECT role_id FROM autorole_config WHERE guild_id = ? AND target = ?').all(member.guild.id, target);
  if (!linhas.length) return;

  for (const { role_id } of linhas) {
    const role = member.guild.roles.cache.get(role_id);
    if (role) await member.roles.add(role).catch(() => {});
  }

  await aplicarExclusividadeCargos(member);
}

/**
 * Verifica todos os cargos atuais de um membro e, para cada par de exclusividade
 * configurado (ganhar X remove Y), remove o cargo Y se o membro tiver o cargo X.
 */
async function aplicarExclusividadeCargos(member) {
  const pares = db.prepare('SELECT gain_role_id, lose_role_id FROM role_exclusivity WHERE guild_id = ?').all(member.guild.id);
  if (!pares.length) return;

  const cargosAtuais = member.roles.cache;
  const paraRemover = new Set();

  for (const { gain_role_id, lose_role_id } of pares) {
    if (cargosAtuais.has(gain_role_id) && cargosAtuais.has(lose_role_id)) {
      paraRemover.add(lose_role_id);
    }
  }

  for (const roleId of paraRemover) {
    const role = member.guild.roles.cache.get(roleId);
    if (role) await member.roles.remove(role).catch(() => {});
  }
}

// ============================
// SISTEMA DE ANTISPAM
// ============================

/** Verifica se a mensagem foi enviada no canal-armadilha (trap) e bane de imediato */
async function verificarTrapChannel(message) {
  if (!message.guild || message.author.bot) return false;

  // O trap-channel funciona independentemente do antispam estar "enabled",
  // pois é uma proteção crítica e isolada.
  const config = db.prepare('SELECT trap_channel, log_channel FROM antispam_config WHERE guild_id = ?').get(message.guild.id);
  if (!config || !config.trap_channel) return false;
  if (message.channel.id !== config.trap_channel) return false;
  if (isImune(message.member)) return false;

  // Apaga a mensagem primeiro
  await message.delete().catch(() => {});

  // Bane o utilizador (apaga mensagens dos últimos 7 dias, só deste utilizador)
  const banned = await message.member?.ban({
    reason: 'AutoMod: Enviou mensagem no canal-armadilha (trap channel)',
    deleteMessageSeconds: 7 * 86400
  }).catch(() => null);

  // Log
  if (config.log_channel) {
    const ch = message.guild.channels.cache.get(config.log_channel);
    if (ch) {
      const embed = embedPadrao(
        '🪤 Canal-Armadilha Acionado',
        `**Utilizador:** <@${message.author.id}> (${message.author.tag})\n**Canal:** <#${message.channel.id}>\n**Ação:** ${banned ? '✅ Banido' : '⚠️ Falhou o ban'}`,
        CONFIG.COR_ERRO
      );
      await ch.send({ embeds: [embed] });
    }
  }

  return true;
}

/**
 * Verifica se um membro é imune ao automod (anti-spam, anti-links, anti-invites, anti-raid, trap channel).
 * NÃO afeta ban/kick manuais — só protege contra ações automáticas do bot.
 */
function isImune(member) {
  if (!member || !member.guild) return false;
  const config = db.prepare('SELECT immune_roles, immune_admins FROM guild_config WHERE guild_id = ?').get(member.guild.id);
  if (!config) return false;

  if (config.immune_admins && member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  let immuneRoles = [];
  try { immuneRoles = JSON.parse(config.immune_roles || '[]'); } catch (_) {}
  if (immuneRoles.length && member.roles.cache.some(r => immuneRoles.includes(r.id))) return true;

  return false;
}

/** Verifica spam numa mensagem */
async function verificarSpam(message) {
  if (!message.guild || message.author.bot) return;
  if (isImune(message.member)) return;

  const config = db.prepare('SELECT * FROM antispam_config WHERE guild_id = ? AND enabled = 1').get(message.guild.id);
  if (!config) return;

  // Verificar whitelist
  const whitelistRoles    = JSON.parse(config.whitelist_roles || '[]');
  const whitelistChannels = JSON.parse(config.whitelist_channels || '[]');

  if (whitelistChannels.includes(message.channel.id)) return;
  if (message.member?.roles.cache.some(r => whitelistRoles.includes(r.id))) return;

  // Palavras Bloqueadas (lista definida pelo utilizador)
  const blockedWords = JSON.parse(config.blocked_words || '[]');
  if (blockedWords.length) {
    const conteudoLower = message.content.toLowerCase();
    const palavraEncontrada = blockedWords.find(p => conteudoLower.includes(p.toLowerCase()));
    if (palavraEncontrada) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`<@${message.author.id}> ⚠️ A tua mensagem continha uma palavra/expressão bloqueada!`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
  }

  // Links Bloqueados (lista específica de domínios definida pelo utilizador)
  const blockedLinks = JSON.parse(config.blocked_links || '[]');
  if (blockedLinks.length) {
    const conteudoLower = message.content.toLowerCase();
    const linkEncontrado = blockedLinks.find(dominio => conteudoLower.includes(dominio.toLowerCase()));
    if (linkEncontrado) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`<@${message.author.id}> ⚠️ Esse link não é permitido aqui!`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
  }

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
      await message.member.ban({ reason: 'AutoMod: Spam detectado', deleteMessageSeconds: 7 * 86400 }).catch(() => {});
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

/** Envia um aviso no canal-armadilha para avisar que quem escrever ali é banido */
async function enviarAvisoTrapChannel(guild, channelId) {
  if (!channelId) return;
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return;
  const embed = embedPadrao(
    '🪤 Canal Proibido',
    '**Não envies nenhuma mensagem neste canal.**\n\nQuem enviar uma mensagem aqui será **banido automaticamente** do servidor.',
    CONFIG.COR_ERRO
  );
  await ch.send({ embeds: [embed] }).catch(() => {});
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
    .setDescription('Cria um ticket manualmente')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Staff Rating ──
  new SlashCommandBuilder()
    .setName('ranking-staff')
    .setDescription('Mostra o ranking de avaliações da staff')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('top').setDescription('Quantos staff mostrar').setRequired(false).setMinValue(1).setMaxValue(10)),

  // ⚠️ Comando disponível para todos os membros (sem exigir Administrador)
  new SlashCommandBuilder()
    .setName('avaliar-staff')
    .setDescription('Avalia um membro da staff')
    .addUserOption(o => o.setName('staff').setDescription('Membro da staff a avaliar').setRequired(true)),

  new SlashCommandBuilder()
    .setName('historico-staff')
    .setDescription('Vê o histórico de avaliações de um staff')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    .addStringOption(o => o.setName('mensagem').setDescription('Mensagem enviada fora do embed').setRequired(false))
    .addChannelOption(o => o.setName('canal').setDescription('Canal onde enviar (padrão: atual)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('embed-guardar')
    .setDescription('Guarda um embed para usar depois')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName('nome').setDescription('Nome para identificar o embed').setRequired(true))
    .addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true))
    .addStringOption(o => o.setName('cor').setDescription('Cor').setRequired(false))
    .addStringOption(o => o.setName('imagem').setDescription('URL da imagem').setRequired(false))
    .addStringOption(o => o.setName('thumbnail').setDescription('URL do thumbnail').setRequired(false))
    .addStringOption(o => o.setName('footer').setDescription('Rodapé').setRequired(false))
    .addStringOption(o => o.setName('mensagem').setDescription('Mensagem enviada fora do embed').setRequired(false)),

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

  // ── Perguntas à comunidade ──
  new SlashCommandBuilder()
    .setName('pergunta')
    .setDescription('Faz uma pergunta à comunidade num canal, criando um tópico para respostas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('canal').setDescription('Canal onde enviar a pergunta').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addStringOption(o => o.setName('pergunta').setDescription('O texto da pergunta').setRequired(true).setMaxLength(2000)),

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
    .addIntegerOption(o => o.setName('dias').setDescription('Apagar mensagens dos últimos X dias (padrão: 7)').setRequired(false).setMinValue(0).setMaxValue(7)),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Remove o ban de um utilizador')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(o => o.setName('id').setDescription('ID do utilizador').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)),

  new SlashCommandBuilder()
    .setName('blacklist-add')
    .setDescription('Bane automaticamente pelo username, mesmo que a conta nunca tenha entrado no servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('username').setDescription('Username do utilizador a bloquear').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo (ex: raid anterior)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('blacklist-remove')
    .setDescription('Remove um utilizador da blacklist (por ID ou username)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('id').setDescription('ID ou username a remover').setRequired(true)),

  new SlashCommandBuilder()
    .setName('blacklist-lista')
    .setDescription('Mostra os utilizadores atualmente na blacklist deste servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador (padrão: tu)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Mostra informações sobre o servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
    .addChannelOption(o => o.setName('log').setDescription('Canal de log do AntiSpam').setRequired(false))
    .addChannelOption(o => o.setName('canal-armadilha').setDescription('Canal onde quem escrever é banido automaticamente').setRequired(false))
    .addBooleanOption(o => o.setName('anti-bot').setDescription('Banir automaticamente quem adicionar bots sem ser admin').setRequired(false)),

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

  // ── Cargos ──
  new SlashCommandBuilder()
    .setName('role-add-remove')
    .setDescription('Adiciona um cargo e remove outro cargo de um utilizador (apenas admins)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('utilizador').setDescription('Utilizador a alterar').setRequired(true))
    .addRoleOption(o => o.setName('adicionar').setDescription('Cargo a adicionar').setRequired(true))
    .addRoleOption(o => o.setName('remover').setDescription('Cargo a remover').setRequired(true)),

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
    const config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guild.id);
    db.prepare('UPDATE server_stats SET enabled = 0 WHERE guild_id = ?').run(guild.id);
    if (config) await apagarCanaisServerStats(guild, config).catch(() => {});
    return interaction.reply({ content: '✅ Sistema de estatísticas desativado e canais removidos.', ephemeral: true });
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
    const mensagem  = options.getString('mensagem');
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
    await canal.send({ content: mensagem || undefined, embeds: [embed] });
    return interaction.editReply({ content: `✅ Embed enviado em ${canal}!` });
  }

  if (commandName === 'embed-guardar') {
    const nome      = options.getString('nome');
    const titulo    = options.getString('titulo');
    const descricao = options.getString('descricao');
    const cor       = options.getString('cor') || CONFIG.COR_PRINCIPAL;
    const imagem    = options.getString('imagem');
    const thumbnail = options.getString('thumbnail');
    const footer    = options.getString('footer');
    const mensagem  = options.getString('mensagem');

    const data = JSON.stringify({
      title: titulo, description: descricao, color: cor,
      image: imagem || null, thumbnail: thumbnail || null,
      footer: footer || null, content: mensagem || null,
    });

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
    if (data.image)     embed.setImage(data.image);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.footer)    embed.setFooter({ text: data.footer });

    await interaction.deferReply({ ephemeral: true });
    await canal.send({ content: data.content || undefined, embeds: [embed] });
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
  // PERGUNTAS À COMUNIDADE
  // ─────────────────────────────────────────────

  if (commandName === 'pergunta') {
    const canal    = options.getChannel('canal');
    const conteudo = options.getString('pergunta');

    await interaction.deferReply({ ephemeral: true });
    const resultado = await enviarPergunta(guild, canal, conteudo, interaction.user.id);
    if (!resultado.ok) return interaction.editReply({ content: `❌ ${resultado.message}` });
    return interaction.editReply({ content: `✅ Pergunta enviada em ${canal}! Tópico criado para respostas.` });
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
    // Por padrão apaga 7 dias de mensagens do banido; o admin pode escolher outro valor (0-7)
    const diasOpcao = options.getInteger('dias');
    const dias = diasOpcao !== null ? diasOpcao : 7;

    if (!target) return interaction.reply({ content: '❌ Utilizador não encontrado.', ephemeral: true });
    if (target.id === user.id) return interaction.reply({ content: '❌ Não te podes banir a ti próprio.', ephemeral: true });
    if (!target.bannable) return interaction.reply({ content: '❌ Não tenho permissão para banir este utilizador.', ephemeral: true });

    await interaction.deferReply();

    await target.ban({ reason: motivo, deleteMessageSeconds: dias * 86400 });
    logMod(guild.id, 'BAN', target.id, user.id, motivo);

    const embed = embedPadrao(
      '🔨 Utilizador Banido',
      `**Utilizador:** <@${target.id}> (\`${target.user.tag}\`)\n**Moderador:** <@${user.id}>\n**Motivo:** ${motivo}\n**Mensagens apagadas:** últimos ${dias} dia(s)`,
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

  if (commandName === 'blacklist-add') {
    const usernameInput = options.getString('username').trim().replace(/^@/, '').toLowerCase();
    const motivo = options.getString('motivo') || 'Sem motivo especificado';

    await interaction.deferReply();

    try {
      db.prepare('INSERT INTO blacklist (guild_id, user_id, username, reason, added_by) VALUES (?, NULL, ?, ?, ?)')
        .run(guild.id, usernameInput, motivo, user.id);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return interaction.editReply({ content: `⚠️ **${usernameInput}** já está na blacklist deste servidor.` });
      }
      return interaction.editReply({ content: `❌ Erro ao guardar na blacklist: ${e.message}` });
    }

    // Se a conta já estiver no servidor agora (por username), bane imediatamente
    let jaBanido = false;
    let membroEncontrado = null;
    try {
      await guild.members.fetch();
      membroEncontrado = guild.members.cache.find(m => m.user.username.toLowerCase() === usernameInput) || null;
    } catch (_) {}

    if (membroEncontrado) {
      if (membroEncontrado.id === user.id) {
        return interaction.editReply({ content: '❌ Não te podes adicionar a ti próprio à blacklist.' });
      }
      if (membroEncontrado.bannable) {
        await membroEncontrado.ban({ reason: `Blacklist: ${motivo}`, deleteMessageSeconds: 7 * 86400 }).catch(() => {});
        jaBanido = true;
        // Guarda o ID para referência futura (ex: /blacklist-remove por ID)
        db.prepare('UPDATE blacklist SET user_id = ? WHERE guild_id = ? AND username = ?')
          .run(membroEncontrado.id, guild.id, usernameInput);
      }
    }

    logMod(guild.id, 'BLACKLIST-ADD', membroEncontrado?.id || usernameInput, user.id, motivo);

    const embed = embedPadrao(
      '🚫 Utilizador Adicionado à Blacklist',
      `**Username:** \`${usernameInput}\`\n**Moderador:** <@${user.id}>\n**Motivo:** ${motivo}\n\n${jaBanido ? '⚠️ Este utilizador já estava no servidor e foi banido agora.' : '✅ Se uma conta com este username entrar no servidor, será banida automaticamente — mesmo que nunca tenha estado aqui antes.'}`,
      CONFIG.COR_ERRO
    );
    await sendLog(guild, embed);
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'blacklist-remove') {
    const inputRaw = options.getString('id').trim().replace(/^@/, '');
    const isId = /^\d{15,25}$/.test(inputRaw);
    const res = isId
      ? db.prepare('DELETE FROM blacklist WHERE guild_id = ? AND user_id = ?').run(guild.id, inputRaw)
      : db.prepare('DELETE FROM blacklist WHERE guild_id = ? AND username = ?').run(guild.id, inputRaw.toLowerCase());

    if (res.changes === 0) return interaction.reply({ content: `⚠️ \`${inputRaw}\` não estava na blacklist.`, ephemeral: true });

    logMod(guild.id, 'BLACKLIST-REMOVE', inputRaw, user.id, 'Removido da blacklist');
    return interaction.reply({ content: `✅ \`${inputRaw}\` removido da blacklist.`, ephemeral: true });
  }

  if (commandName === 'blacklist-lista') {
    const lista = db.prepare('SELECT * FROM blacklist WHERE guild_id = ? ORDER BY created_at DESC LIMIT 25').all(guild.id);

    if (!lista.length) return interaction.reply({ content: '✅ A blacklist deste servidor está vazia.', ephemeral: true });

    const embed = embedPadrao(
      '🚫 Blacklist do Servidor',
      lista.map(b => `**${b.username}**${b.user_id ? ` (\`${b.user_id}\`)` : ' (nunca visto no servidor)'}\n↳ Motivo: ${b.reason} — por <@${b.added_by}>`).join('\n\n')
    );
    return interaction.reply({ embeds: [embed], ephemeral: true });
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

  // ─────────────────────────────────────────────
  // CARGOS
  // ─────────────────────────────────────────────

  if (commandName === 'role-add-remove') {
    await interaction.deferReply({ ephemeral: true });
    const alvo      = options.getUser('utilizador');
    const cargoAdd  = options.getRole('adicionar');
    const cargoRem  = options.getRole('remover');

    if (cargoAdd.id === cargoRem.id) {
      return interaction.editReply({ content: '❌ O cargo a adicionar e o cargo a remover não podem ser o mesmo.' });
    }

    const membroAlvo = await guild.members.fetch(alvo.id).catch(() => null);
    if (!membroAlvo) {
      return interaction.editReply({ content: '❌ Não encontrei esse utilizador neste servidor.' });
    }

    try {
      await membroAlvo.roles.add(cargoAdd);
      await membroAlvo.roles.remove(cargoRem);
    } catch (err) {
      return interaction.editReply({ content: `❌ Não consegui alterar os cargos: ${err.message}\n👉 Verifica se o cargo do bot está acima dos cargos ${cargoAdd} e ${cargoRem}.` });
    }

    const embed = embedPadrao(
      '🎭 Cargos Atualizados',
      `**Utilizador:** ${membroAlvo}\n✅ **Adicionado:** ${cargoAdd}\n❌ **Removido:** ${cargoRem}\n👮 **Por:** ${user}`,
      CONFIG.COR_SUCESSO
    );
    await sendLog(guild, embed);

    return interaction.editReply({ content: `✅ Cargo ${cargoAdd} adicionado e cargo ${cargoRem} removido de ${membroAlvo}.` });
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
          value: '`/ban` · Bane um utilizador\n`/unban` · Remove o ban\n`/kick` · Expulsa um utilizador\n`/timeout` · Silencia temporariamente\n`/untimeout` · Remove o silêncio\n`/warn` · Avisa um utilizador\n`/warns` · Vê os avisos de um utilizador\n`/clearwarns` · Limpa os avisos\n`/limpar` · Apaga mensagens do canal\n`/blacklist-add` · Bane automaticamente se este username entrar no servidor\n`/blacklist-remove` · Remove um ID da blacklist\n`/blacklist-lista` · Lista os utilizadores na blacklist',
          inline: false,
        },
        {
          name: '💡 Sugestões',
          value: '`/sugerir` · Submete uma sugestão\n`/sugestao-setup` · Configura o sistema de sugestões\n`/sugestao-responder` · Aprova ou rejeita uma sugestão',
          inline: false,
        },
        {
          name: '❓ Perguntas',
          value: '`/pergunta` · Envia uma pergunta a um canal e cria um tópico para respostas',
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
          name: '🎖️ Cargos',
          value: '`/role-add-remove` · Adiciona um cargo e remove outro cargo de um utilizador',
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
    const trapCh      = options.getChannel('canal-armadilha');
    const antiBotAdd  = options.getBoolean('anti-bot') ? 1 : 0;

    db.prepare(`
      INSERT INTO antispam_config (guild_id, enabled, max_messages, action, anti_links, anti_invites, anti_raid, log_channel, trap_channel, anti_bot_add)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        enabled=excluded.enabled,
        max_messages=excluded.max_messages,
        action=excluded.action,
        anti_links=excluded.anti_links,
        anti_invites=excluded.anti_invites,
        anti_raid=excluded.anti_raid,
        log_channel=excluded.log_channel,
        trap_channel=COALESCE(excluded.trap_channel, antispam_config.trap_channel),
        anti_bot_add=excluded.anti_bot_add
    `).run(guild.id, ativo ? 1 : 0, maxMsg, acao, antiLinks, antiInvites, antiRaid, logCh?.id || null, trapCh?.id || null, antiBotAdd);

    if (trapCh) await enviarAvisoTrapChannel(guild, trapCh.id);

    const embed = embedPadrao(
      `🛡️ AntiSpam ${ativo ? 'Ativado' : 'Desativado'}`,
      [
        `**Estado:** ${ativo ? '✅ Ativo' : '❌ Inativo'}`,
        `**Máx. Mensagens:** ${maxMsg}`,
        `**Ação:** ${acao}`,
        `**Anti-Links:** ${antiLinks ? 'Sim' : 'Não'}`,
        `**Anti-Convites:** ${antiInvites ? 'Sim' : 'Não'}`,
        `**Anti-Raid:** ${antiRaid ? 'Sim' : 'Não'}`,
        `**Canal-Armadilha:** ${trapCh ? `<#${trapCh.id}>` : 'Não definido'}`,
        `**Anti-Bot (não-admin):** ${antiBotAdd ? 'Sim' : 'Não'}`,
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
    if (!isEquipaAdminTicket(member, guild, ticket)) {
      return interaction.reply({ content: '❌ Apenas a equipa de administração pode reclamar este ticket.', ephemeral: true });
    }
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

  // ── Fechar ticket com motivo ──
  if (customId === 'ticket_close_reason') {
    const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Este não é um canal de ticket.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId('ticket_close_reason_modal')
      .setTitle('📝 Fechar Ticket com Motivo');
    const input = new TextInputBuilder()
      .setCustomId('motivo_input')
      .setLabel('Motivo do encerramento')
      .setPlaceholder('Escreve aqui o motivo do encerramento...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
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
    const valor  = values[0]; // ex: "tipo_3"
    const typeId = parseInt(valor.replace('tipo_', '')) || null;

    // Se o tipo de ticket tiver formulário configurado, mostra o modal antes de criar o ticket
    const tipo = typeId ? db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(typeId) : null;
    if (tipo?.has_form) {
      const perguntas = db.prepare('SELECT * FROM ticket_form_questions WHERE type_id = ? ORDER BY order_num, id').all(typeId);
      if (perguntas.length) {
        const modal = new ModalBuilder()
          .setCustomId(`ticket_form_modal_${typeId}`)
          .setTitle((tipo.label || 'Novo Ticket').substring(0, 45));
        perguntas.slice(0, 5).forEach(q => {
          const input = new TextInputBuilder()
            .setCustomId(`ticket_form_q_${q.id}`)
            .setLabel(q.question.substring(0, 45))
            .setStyle(q.style === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(!!q.required)
            .setMaxLength(q.style === 'long' ? 1000 : 200);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
        });
        return interaction.showModal(modal);
      }
    }

    await interaction.deferReply({ ephemeral: true });
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

  // ── Formulário de criação de ticket ──
  if (customId.startsWith('ticket_form_modal_')) {
    const typeId = parseInt(customId.replace('ticket_form_modal_', '')) || null;
    await interaction.deferReply({ ephemeral: true });

    const perguntas = typeId ? db.prepare('SELECT * FROM ticket_form_questions WHERE type_id = ? ORDER BY order_num, id').all(typeId) : [];
    const respostas = perguntas.slice(0, 5).map(q => {
      let valor = '';
      try { valor = interaction.fields.getTextInputValue(`ticket_form_q_${q.id}`); } catch (_) {}
      return { question: q.question, answer: valor };
    });

    const result = await criarTicket(guild, user, typeId, interaction, respostas);
    if (result.erro) return interaction.editReply({ content: `❌ ${result.erro}` });
    return interaction.editReply({ content: `✅ Ticket criado: ${result.channel}` });
  }

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

  // ── Fechar ticket com motivo ──
  if (customId === 'ticket_close_reason_modal') {
    const motivo = interaction.fields.getTextInputValue('motivo_input').trim();
    await interaction.deferReply({ ephemeral: true });
    await fecharTicket(channel, user.id, guild, motivo);
    return interaction.editReply({ content: '✅ Ticket fechado com o motivo registado.' });
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

// ── Bot adicionado a um novo servidor ──
client.on(Events.GuildCreate, async guild => {
  try {
    console.log(`➕ Bot adicionado ao servidor: ${guild.name} (${guild.id})`);

    // Escolhe o primeiro canal de texto onde o bot pode enviar mensagens:
    // prioriza "geral"/"general"/"boas-vindas", senão usa o primeiro disponível.
    await guild.channels.fetch().catch(() => {});
    const canaisTexto = guild.channels.cache.filter(c =>
      c.type === ChannelType.GuildText &&
      c.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks])
    );
    if (!canaisTexto.size) return;

    const preferido = canaisTexto.find(c => /geral|general|boas.?vindas|welcome|inicio|início/i.test(c.name));
    const canal = preferido || canaisTexto.sort((a, b) => a.position - b.position).first();
    if (!canal) return;

    const DASHBOARD_URL = 'https://agent-xt.onrender.com';

    const embed = new EmbedBuilder()
      .setTitle('🎉 Obrigado por escolher o Bot!')
      .setDescription(
        `Olá! Obrigado por me adicionares a **${guild.name}**. 🙌\n\n` +
        `Sou um bot completo feito para ajudar a gerir o teu servidor, com sistemas de:\n` +
        `🎫 **Tickets** — suporte organizado por categorias\n` +
        `🔨 **Moderação** — avisos, blacklist, antispam e logs\n` +
        `👋 **Boas-vindas & AutoRole** — recebe novos membros com estilo\n` +
        `🎭 **Reaction Roles** — cargos por reação, geridos pelo dashboard\n` +
        `🎖️ **Cargos** — autorole e exclusividade de cargos\n` +
        `🎨 **Embeds personalizados** — envio manual, por intervalo ou a horas fixas todos os dias\n` +
        `⭐ **Avaliações de Staff** e **Sugestões** da comunidade\n` +
        `📈 **Estatísticas** do servidor e **Votações** diárias\n\n` +
        `Tudo isto é configurado de forma simples e visual — sem precisares de decorar comandos.`
      )
      .setColor(CONFIG.COR_PRINCIPAL)
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .addFields({
        name: '🌐 Dashboard de Configuração',
        value: `Configura tudo em: **[${DASHBOARD_URL}](${DASHBOARD_URL})**`,
      })
      .setFooter({ text: 'Usa /help no Discord para veres os comandos disponíveis.' })
      .setTimestamp();

    await canal.send({ embeds: [embed] });
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem de boas-vindas ao servidor:', err.message);
  }
});

// ── Novo membro ──
client.on(Events.GuildMemberAdd, async member => {
  // Verifica blacklist: bane de imediato se o ID OU o username (case-insensitive)
  // desta conta estiver bloqueado neste servidor — cobre também contas que
  // nunca tinham entrado no servidor antes de serem adicionadas à blacklist.
  const usernameLower = member.user.username.toLowerCase();
  const blEntry = db.prepare(
    'SELECT * FROM blacklist WHERE guild_id = ? AND (user_id = ? OR LOWER(username) = ?)'
  ).get(member.guild.id, member.id, usernameLower);
  if (blEntry) {
    await member.ban({ reason: `Blacklist: ${blEntry.reason || 'Conta bloqueada'}`, deleteMessageSeconds: 7 * 86400 }).catch(() => {});
    // Guarda o ID descoberto agora, para futuras referências (ex: remover por ID)
    if (!blEntry.user_id) {
      db.prepare('UPDATE blacklist SET user_id = ? WHERE id = ?').run(member.id, blEntry.id);
    }
    const embed = embedPadrao(
      '🚫 Blacklist: Utilizador Banido Automaticamente',
      `**Utilizador:** ${member.user.tag} (\`${member.id}\`)\n**Motivo original:** ${blEntry.reason || 'Sem motivo especificado'}\n**Adicionado à blacklist por:** <@${blEntry.added_by}>`,
      CONFIG.COR_ERRO
    );
    await sendLog(member.guild, embed);
    return;
  }

  // Se for um bot, verifica a proteção anti-raid de adição de bots
  if (member.user.bot) {
    const tratado = await verificarAntiBotAdd(member);
    if (tratado) return; // o bot e/ou quem o adicionou já foram tratados
    // Bots não recebem mensagem de boas-vindas, mas recebem AutoRole de bot
    await aplicarAutoRole(member);
    return;
  }

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

// Quando os cargos de um membro mudam (por qualquer via — Discord UI, outro bot, etc.),
// aplica a exclusividade de cargos configurada na aba "Cargos" do dashboard.
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    if (oldMember.roles.cache.size === newMember.roles.cache.size &&
        oldMember.roles.cache.every(r => newMember.roles.cache.has(r.id))) {
      return; // cargos não mudaram, ignora (evita trabalho desnecessário)
    }
    await aplicarExclusividadeCargos(newMember);
  } catch (err) {
    console.error('❌ Erro ao aplicar exclusividade de cargos:', err.message);
  }
});

/**
 * Verifica se um bot foi adicionado por alguém sem permissão de Administrador.
 * Se a proteção "anti_bot_add" estiver ativa, expulsa o bot e bane quem o adicionou.
 * Retorna true se a situação foi tratada (bot é raid), false caso contrário.
 */
async function verificarAntiBotAdd(botMember) {
  const guild = botMember.guild;
  const config = db.prepare('SELECT * FROM antispam_config WHERE guild_id = ? AND enabled = 1 AND anti_bot_add = 1').get(guild.id);
  if (!config) return false;

  // Vai buscar ao audit log quem adicionou o bot (BotAdd = tipo 28)
  let executor = null;
  try {
    const audit = await guild.fetchAuditLogs({ type: 28, limit: 5 }); // AuditLogEvent.BotAdd
    const entry = audit.entries.find(e => e.target?.id === botMember.id);
    executor = entry?.executor || null;
  } catch (_) { /* falta permissão de ver audit log, ou falhou */ }

  if (!executor) return false;

  // Verifica se quem adicionou tem permissão de Administrador
  const executorMember = await guild.members.fetch(executor.id).catch(() => null);
  const isAdmin = executorMember?.permissions.has(PermissionFlagsBits.Administrator);

  if (isAdmin) return false; // adição legítima, não faz nada

  // Não é admin → remove o bot e bane quem o adicionou
  await botMember.kick('AutoMod: Anti-Raid - bot adicionado por não-administrador').catch(() => {});
  await guild.members.ban(executor.id, {
    reason: 'AutoMod: Anti-Raid - adicionou um bot ao servidor sem ser administrador'
  }).catch(() => {});

  const config2 = db.prepare('SELECT log_channel FROM antispam_config WHERE guild_id = ?').get(guild.id);
  if (config2?.log_channel) {
    const ch = guild.channels.cache.get(config2.log_channel);
    if (ch) {
      const embed = embedPadrao(
        '🚨 Anti-Raid: Bot Bloqueado',
        `**Bot:** ${botMember.user.tag} (${botMember.id})\n**Adicionado por:** <@${executor.id}> (${executor.tag})\n**Ação:** Bot expulso e utilizador banido.`,
        CONFIG.COR_ERRO
      );
      await ch.send({ embeds: [embed] });
    }
  }

  return true;
}

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
  const banido = await verificarTrapChannel(message);
  if (banido) return; // já foi banido, não faz mais verificações
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

/**
 * Envia embeds guardadas configuradas com "horários fixos diários" (até 5 horas
 * HH:MM por embed). Corre a cada minuto: verifica se a hora atual (fuso do
 * servidor onde o processo corre) bate certo com algum dos horários configurados
 * e, se ainda não foi enviado hoje a essa hora, envia.
 */
async function processarEmbedsHorasFixas() {
  let ativos;
  try {
    ativos = db.prepare(`
      SELECT * FROM saved_embeds
      WHERE schedule_daily_active = 1
        AND schedule_daily_times IS NOT NULL
        AND schedule_daily_times != ''
    `).all();
  } catch (e) {
    return; // colunas ainda não existem (BD muito antiga) — ignora silenciosamente
  }

  if (!ativos.length) return;

  const agora = new Date();
  const hojeStr = agora.toISOString().slice(0, 10); // YYYY-MM-DD
  const horaAtual = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');

  for (const saved of ativos) {
    try {
      const horarios = saved.schedule_daily_times.split(',').map(h => h.trim()).filter(Boolean).slice(0, 5);
      if (!horarios.includes(horaAtual)) continue;

      let ultimosEnvios = {};
      try { ultimosEnvios = JSON.parse(saved.schedule_daily_last_sent || '{}'); } catch (_) { ultimosEnvios = {}; }

      const chave = horaAtual; // um registo por horário do dia
      if (ultimosEnvios[chave] === hojeStr) continue; // já enviado hoje a esta hora

      const guild = client.guilds.cache.get(saved.guild_id);
      const canal = guild?.channels.cache.get(saved.schedule_daily_channel);
      if (!guild || !canal) {
        db.prepare('UPDATE saved_embeds SET schedule_daily_active = 0 WHERE id = ?').run(saved.id);
        continue;
      }

      const data  = JSON.parse(saved.data);
      const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp();
      if (data.image)     embed.setImage(data.image);
      if (data.thumbnail) embed.setThumbnail(data.thumbnail);
      if (data.footer)    embed.setFooter({ text: data.footer });

      await canal.send({ content: data.content || undefined, embeds: [embed] });

      ultimosEnvios[chave] = hojeStr;
      db.prepare('UPDATE saved_embeds SET schedule_daily_last_sent = ? WHERE id = ?')
        .run(JSON.stringify(ultimosEnvios), saved.id);
    } catch (err) {
      console.error(`❌ Erro ao enviar embed (horário fixo) "${saved.name}" (id ${saved.id}):`, err.message);
    }
  }
}

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

  // Verifica embeds guardadas com envio automático agendado (a cada minuto)
  cron.schedule('* * * * *', () => processarEmbedsAgendadas());

  // Verifica embeds guardadas com envio diário a horas fixas (a cada minuto)
  cron.schedule('* * * * *', () => processarEmbedsHorasFixas());

  console.log('⏰ Crons agendados.');
}

/** Envia embeds guardadas que estejam com agendamento ativo e cuja hora de envio já passou */
async function processarEmbedsAgendadas() {
  let pendentes;
  try {
    pendentes = db.prepare(`
      SELECT * FROM saved_embeds
      WHERE schedule_active = 1
        AND schedule_next_send IS NOT NULL
        AND schedule_next_send <= datetime('now')
    `).all();
  } catch (e) {
    return; // colunas ainda não existem (BD muito antiga) — ignora silenciosamente
  }

  for (const saved of pendentes) {
    try {
      const guild = client.guilds.cache.get(saved.guild_id);
      const canal = guild?.channels.cache.get(saved.schedule_channel);
      if (!guild || !canal) {
        // canal ou servidor deixaram de existir — desativa o agendamento para não ficar preso a tentar
        db.prepare('UPDATE saved_embeds SET schedule_active = 0 WHERE id = ?').run(saved.id);
        continue;
      }

      const data  = JSON.parse(saved.data);
      const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp();
      if (data.image)     embed.setImage(data.image);
      if (data.thumbnail) embed.setThumbnail(data.thumbnail);
      if (data.footer)    embed.setFooter({ text: data.footer });

      // Envia a quantidade configurada de seguida (mínimo 1), com um pequeno intervalo
      // entre cada uma para não sermos rate-limited pelo Discord.
      const quantidade = saved.schedule_quantity && saved.schedule_quantity > 0 ? saved.schedule_quantity : 1;
      for (let i = 0; i < quantidade; i++) {
        await canal.send({ content: data.content || undefined, embeds: [embed] });
        if (i < quantidade - 1) await new Promise(r => setTimeout(r, 1000));
      }

      // Usa datetime('now', '+N minutes') do próprio SQLite — mesmo formato usado na
      // condição WHERE acima, evita o bug de comparar strings ISO com strings SQLite.
      db.prepare(`
        UPDATE saved_embeds
        SET schedule_next_send = datetime('now', '+' || ? || ' minutes')
        WHERE id = ?
      `).run(saved.schedule_interval_minutes, saved.id);
    } catch (err) {
      console.error(`❌ Erro ao enviar embed agendada "${saved.name}" (id ${saved.id}):`, err.message);
    }
  }
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

// ── Refresh automático dos guilds da sessão ──
// Antes, session.user.guilds só era preenchido no login, por isso quando alguém
// ganhava/perdia permissão de Admin num servidor, só via a mudança refletida
// depois de sair e voltar a entrar. Agora, vamos buscar a lista atualizada ao
// Discord em cada pedido ao dashboard, com um cache curto (60s) para não
// exceder o rate limit da API do Discord.
const guildsCache = new Map(); // userId -> { guilds, expiresAt }
const GUILDS_CACHE_TTL = 60 * 1000; // 60 segundos

async function refreshUserGuilds(req) {
  const user = req.session?.user;
  if (!user?.token) return;

  const cached = guildsCache.get(user.id);
  if (cached && cached.expiresAt > Date.now()) {
    user.guilds = cached.guilds;
    return;
  }

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${user.token}` }
    });
    const guilds = guildsRes.data.filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8));
    user.guilds = guilds;
    guildsCache.set(user.id, { guilds, expiresAt: Date.now() + GUILDS_CACHE_TTL });
  } catch (e) {
    // Se o token expirou ou a chamada falhou, mantém a última lista conhecida
    console.error('⚠️ Erro ao atualizar guilds do utilizador:', e.message);
  }
}

// Middleware que garante que a lista de servidores/permissões está atualizada
// antes de qualquer rota do dashboard correr.
async function withFreshGuilds(req, res, next) {
  await refreshUserGuilds(req);
  next();
}

// Verifica se o utilizador da sessao tem permissao de Administrador no guildId indicado.
// Usa sempre a permissao vinda do OAuth2/Discord (session.user.guilds), nunca apenas
// o facto de estar autenticado.
function userIsGuildAdmin(req, guildId) {
  if (!req.session?.user) return false;
  const userGuild = req.session.user.guilds?.find(g => g.id === guildId);
  if (!userGuild) return false;
  try {
    return (BigInt(userGuild.permissions) & BigInt(0x8)) === BigInt(0x8);
  } catch (e) {
    return false;
  }
}

// Middleware para rotas de pagina (dashboard): exige sessao + Administrador no guildId.
async function requireGuildAdminPage(req, res, next) {
  if (!req.session?.user) return res.redirect('/login');
  await refreshUserGuilds(req);
  const { guildId } = req.params;
  if (!userIsGuildAdmin(req, guildId)) {
    return res.status(403).send(renderDashboard(req.session.user, null, 'Acesso negado: so administradores deste servidor podem aceder ao dashboard.'));
  }
  next();
}

// Middleware para rotas de API: exige sessao + Administrador no guildId. Responde 403 JSON.
async function requireGuildAdminApi(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'not_authenticated' });
  await refreshUserGuilds(req);
  const { guildId } = req.params;
  if (!userIsGuildAdmin(req, guildId)) {
    return res.status(403).json({ error: 'forbidden', message: 'Nao tens permissao de Administrador neste servidor.' });
  }
  next();
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
app.get('/dashboard', requireAuth, withFreshGuilds, (req, res) => {
  res.send(renderDashboard(req.session.user, null));
});

app.get('/dashboard/:guildId', requireAuth, requireGuildAdminPage, async (req, res) => {
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
  const autoroleHumanos = db.prepare("SELECT role_id FROM autorole_config WHERE guild_id = ? AND target = 'human'").all(guildId).map(r => r.role_id);
  const autoroleBots    = db.prepare("SELECT role_id FROM autorole_config WHERE guild_id = ? AND target = 'bot'").all(guildId).map(r => r.role_id);
  const roleExclusivity = db.prepare('SELECT * FROM role_exclusivity WHERE guild_id = ? ORDER BY id DESC').all(guildId);
  const blacklist = db.prepare('SELECT * FROM blacklist WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
  let immuneRoles = [];
  try { immuneRoles = JSON.parse(guildConfig?.immune_roles || '[]'); } catch (_) {}
  const reactionRoles = rrPaineis.map(p => ({
    ...p,
    itens: db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ?').all(guildId, p.message_id)
  }));
  const ticketTypes = db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num, id').all(guildId);
  const savedEmbeds = db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
  const perguntas = db.prepare('SELECT * FROM perguntas WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50').all(guildId);
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
    ticketTypes, savedEmbeds, perguntas, staffRanking, members,
    totalTickets, openTickets, totalWarns, totalSugs,
    channels, roles, categories,
    autoroleHumanos, autoroleBots, roleExclusivity, blacklist, immuneRoles
  }));
});

// ── API Endpoints ──
app.post('/api/:guildId/ticket-config', requireGuildAdminApi, (req, res) => {
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

// Envia o painel de tickets (equivalente ao /ticket-painel), a partir do Dashboard
app.post('/api/:guildId/ticket-painel', requireGuildAdminApi, async (req, res) => {
  const { guildId } = req.params;
  const { channel_id, titulo, descricao } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });
  if (!channel_id) return res.status(400).json({ ok: false, message: 'Escolhe um canal para o painel.' });

  const ticketConfig = db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guildId);
  if (!ticketConfig) return res.status(400).json({ ok: false, message: 'Configura primeiro o sistema de tickets (categoria, etc.) antes de enviar o painel.' });

  try {
    const canal = guild.channels.cache.get(channel_id);
    if (!canal) return res.status(404).json({ ok: false, message: 'Canal não encontrado.' });

    const tituloFinal    = (titulo && titulo.trim()) || '🎫 Suporte';
    const descricaoFinal = (descricao && descricao.trim()) || 'Clica no botão abaixo para abrir um ticket de suporte.\nA nossa equipa irá responder o mais brevemente possível!';

    const tipos = db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num').all(guildId);

    const embed = new EmbedBuilder()
      .setTitle(tituloFinal)
      .setDescription(descricaoFinal)
      .setColor(CONFIG.COR_PRINCIPAL)
      .setTimestamp();

    let components = [];
    if (tipos.length > 0) {
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
      const btn = new ButtonBuilder()
        .setCustomId('ticket_create_simple')
        .setLabel('🎫 Abrir Ticket')
        .setStyle(ButtonStyle.Primary);
      components.push(new ActionRowBuilder().addComponents(btn));
    }

    const msg = await canal.send({ embeds: [embed], components });

    db.prepare(`UPDATE ticket_config SET panel_msg_id=?, panel_channel_id=? WHERE guild_id=?`).run(msg.id, canal.id, guildId);

    res.json({ ok: true, message: `✅ Painel de tickets enviado em #${canal.name}!` });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/welcome-config', requireGuildAdminApi, (req, res) => {
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

app.post('/api/:guildId/antispam-config', requireGuildAdminApi, async (req, res) => {
  const { guildId } = req.params;
  const { enabled, max_messages, action, mute_duration, anti_links, anti_invites, anti_raid, log_channel, trap_channel, anti_bot_add } = req.body;

  const muteDurationSeconds = Math.min(Math.max(parseInt(mute_duration) || 300, 10), 2419200);

  db.prepare(`
    INSERT INTO antispam_config (guild_id, enabled, max_messages, action, mute_duration, anti_links, anti_invites, anti_raid, log_channel, trap_channel, anti_bot_add)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET
      enabled=excluded.enabled, max_messages=excluded.max_messages, action=excluded.action,
      mute_duration=excluded.mute_duration,
      anti_links=excluded.anti_links, anti_invites=excluded.anti_invites,
      anti_raid=excluded.anti_raid, log_channel=excluded.log_channel,
      trap_channel=excluded.trap_channel, anti_bot_add=excluded.anti_bot_add
  `).run(guildId, enabled==='1'?1:0, parseInt(max_messages)||5, action||'mute', muteDurationSeconds,
         anti_links==='1'?1:0, anti_invites==='1'?1:0, anti_raid==='1'?1:0, log_channel||null,
         trap_channel||null, anti_bot_add==='1'?1:0);

  // Envia o aviso no canal-armadilha (se foi definido/alterado a partir do dashboard)
  if (trap_channel) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) await enviarAvisoTrapChannel(guild, trap_channel);
  }

  res.json({ ok: true, message: 'Configuração AntiSpam guardada!' });
});

app.post('/api/:guildId/antispam-blocked-words', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { words } = req.body;
  if (!Array.isArray(words)) return res.status(400).json({ ok: false, message: 'Lista inválida.' });

  const palavras = words.map(w => String(w).trim()).filter(w => w).slice(0, 100);

  db.prepare('INSERT OR IGNORE INTO antispam_config (guild_id) VALUES (?)').run(guildId);
  db.prepare('UPDATE antispam_config SET blocked_words = ? WHERE guild_id = ?')
    .run(JSON.stringify(palavras), guildId);

  res.json({ ok: true, message: `✅ ${palavras.length} palavra(s) bloqueada(s) guardada(s)!` });
});

app.post('/api/:guildId/antispam-blocked-links', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { links } = req.body;
  if (!Array.isArray(links)) return res.status(400).json({ ok: false, message: 'Lista inválida.' });

  const dominios = links.map(l => String(l).trim().toLowerCase()).filter(l => l).slice(0, 100);

  db.prepare('INSERT OR IGNORE INTO antispam_config (guild_id) VALUES (?)').run(guildId);
  db.prepare('UPDATE antispam_config SET blocked_links = ? WHERE guild_id = ?')
    .run(JSON.stringify(dominios), guildId);

  res.json({ ok: true, message: `✅ ${dominios.length} link(s)/domínio(s) bloqueado(s) guardado(s)!` });
});

app.post('/api/:guildId/logs-config', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { log_channel, mod_log } = req.body;

  db.prepare(`
    INSERT INTO guild_config (guild_id, log_channel, mod_log)
    VALUES (?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET log_channel=excluded.log_channel, mod_log=excluded.mod_log
  `).run(guildId, log_channel||null, mod_log||null);

  res.json({ ok: true, message: 'Configuração de logs guardada!' });
});

app.post('/api/:guildId/bot-identity', requireGuildAdminApi, async (req, res) => {
  const { guildId } = req.params;
  const { bot_nickname } = req.body;

  const nickname = (bot_nickname || '').trim().slice(0, 32) || null;

  db.prepare(`
    INSERT INTO guild_config (guild_id, bot_nickname)
    VALUES (?,?)
    ON CONFLICT(guild_id) DO UPDATE SET
      bot_nickname=excluded.bot_nickname
  `).run(guildId, nickname);

  const guild = client.guilds.cache.get(guildId);
  let nickResult = { ok: true };
  if (guild) nickResult = await aplicarNicknameBot(guild, nickname);

  res.json({
    ok: true,
    message: nickResult.ok
      ? '✅ Apelido do bot guardado e atualizado neste servidor!'
      : `⚠️ Guardado, mas não foi possível mudar o nickname automaticamente: ${nickResult.error}`,
  });
});

app.get('/api/:guildId/bot-identity', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const config = getGuildConfig(guildId);
  res.json({
    bot_nickname: config?.bot_nickname || '',
  });
});

app.get('/api/:guildId/stats', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const totalTickets = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ?").get(guildId)?.c || 0;
  const openTickets  = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND status='open'").get(guildId)?.c || 0;
  const totalWarns   = db.prepare("SELECT COUNT(*) as c FROM warns WHERE guild_id = ?").get(guildId)?.c || 0;
  const totalSugs    = db.prepare("SELECT COUNT(*) as c FROM suggestions WHERE guild_id = ?").get(guildId)?.c || 0;
  res.json({ totalTickets, openTickets, totalWarns, totalSugs });
});

app.get('/api/:guildId/tickets', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const tickets = db.prepare("SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guildId);
  res.json(tickets);
});

app.get('/api/:guildId/warns', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const warns = db.prepare("SELECT * FROM warns WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guildId);
  res.json(warns);
});

app.get('/api/:guildId/suggestions', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const suggestions = db.prepare("SELECT * FROM suggestions WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guildId);
  res.json(suggestions);
});

app.get('/api/:guildId/staff-ranking', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const ranking = getRankingStaff(guildId);
  res.json(ranking);
});

// ── Server Stats ──
app.post('/api/:guildId/stats-config', requireGuildAdminApi, async (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  const { enabled, show_emoji, show_members, show_bots, show_channels, show_roles, show_boosts } = req.body;

  try {
    let config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);
    if (!config) {
      db.prepare('INSERT INTO server_stats (guild_id) VALUES (?)').run(guildId);
      config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);
    }

    if (enabled) {
      if (!show_members && !show_bots && !show_channels && !show_roles && !show_boosts) {
        return res.status(400).json({ ok: false, message: '❌ Escolhe pelo menos um canal para mostrar.' });
      }

      db.prepare(`
        UPDATE server_stats SET
          enabled = 1, show_emoji = ?, show_members = ?, show_bots = ?,
          show_channels = ?, show_roles = ?, show_boosts = ?
        WHERE guild_id = ?
      `).run(
        show_emoji ? 1 : 0,
        show_members ? 1 : 0,
        show_bots ? 1 : 0,
        show_channels ? 1 : 0,
        show_roles ? 1 : 0,
        show_boosts ? 1 : 0,
        guildId
      );
      config = db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);

      await setupServerStats(guild, config);
      await atualizarStats(guild);
    } else {
      db.prepare('UPDATE server_stats SET enabled = 0 WHERE guild_id = ?').run(guildId);
      // Apaga os canais existentes ao desativar
      await apagarCanaisServerStats(guild, config);
    }

    res.json({ ok: true, message: enabled ? '✅ Server Stats ativado e canais criados!' : '✅ Server Stats desativado e canais removidos.' });
  } catch (e) {
    console.error('Erro stats-config:', e.message);
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/stats-atualizar', requireGuildAdminApi, async (req, res) => {
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

// ── Cargos: AutoRole ──
app.post('/api/:guildId/autorole', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { target, role_ids } = req.body;

  if (target !== 'human' && target !== 'bot') {
    return res.status(400).json({ ok: false, message: 'Alvo inválido.' });
  }
  if (!Array.isArray(role_ids)) {
    return res.status(400).json({ ok: false, message: 'Lista de cargos inválida.' });
  }

  const del = db.prepare('DELETE FROM autorole_config WHERE guild_id = ? AND target = ?');
  const ins = db.prepare('INSERT INTO autorole_config (guild_id, role_id, target) VALUES (?, ?, ?)');

  const tx = db.transaction((ids) => {
    del.run(guildId, target);
    for (const roleId of ids) {
      if (roleId) ins.run(guildId, roleId, target);
    }
  });
  tx(role_ids);

  res.json({ ok: true, message: `AutoRole de ${target === 'bot' ? 'bots' : 'pessoas'} guardado! (${role_ids.length} cargo(s))` });
});

// ── Imunidade ao AutoMod ──
app.post('/api/:guildId/immunity-config', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { immune_admins, immune_role_ids } = req.body;

  if (!Array.isArray(immune_role_ids)) {
    return res.status(400).json({ ok: false, message: 'Lista de cargos inválida.' });
  }

  const rolesFiltrados = immune_role_ids.filter(id => id);

  db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
  db.prepare('UPDATE guild_config SET immune_admins = ?, immune_roles = ? WHERE guild_id = ?')
    .run(immune_admins ? 1 : 0, JSON.stringify(rolesFiltrados), guildId);

  res.json({ ok: true, message: `✅ Imunidade guardada! (${rolesFiltrados.length} cargo(s) imunes${immune_admins ? ', administradores imunes' : ''})` });
});

// ── Cargos: Exclusividade ──
app.post('/api/:guildId/role-exclusivity', requireGuildAdminApi, async (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  // Aceita tanto array (multi-select, vários cargos "a ganhar") como string única (compatibilidade)
  let gainRoleIds = req.body.gain_role_ids || req.body.gain_role_id;
  if (!gainRoleIds) gainRoleIds = [];
  if (!Array.isArray(gainRoleIds)) gainRoleIds = [gainRoleIds];
  gainRoleIds = gainRoleIds.filter(Boolean);

  let loseRoleIds = req.body.lose_role_ids;
  // Aceita tanto array (multi-select) como string única (compatibilidade)
  if (!loseRoleIds) loseRoleIds = [];
  if (!Array.isArray(loseRoleIds)) loseRoleIds = [loseRoleIds];
  loseRoleIds = loseRoleIds.filter(Boolean);

  if (!gainRoleIds.length || !loseRoleIds.length) {
    return res.status(400).json({ ok: false, message: 'Escolhe pelo menos um cargo a ganhar e pelo menos um cargo a perder.' });
  }

  try {
    const ins = db.prepare(`
      INSERT INTO role_exclusivity (guild_id, gain_role_id, lose_role_id)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id, gain_role_id, lose_role_id) DO NOTHING
    `);
    const tx = db.transaction((gains, loses) => {
      for (const gainId of gains) {
        for (const loseId of loses) {
          if (loseId === gainId) continue; // um cargo não pode excluir-se a si mesmo
          ins.run(guildId, gainId, loseId);
        }
      }
    });
    tx(gainRoleIds, loseRoleIds);

    // Responde já: a regra já está gravada na DB, não vale a pena o browser
    // ficar à espera de aplicar retroativamente a todos os membros.
    res.json({ ok: true, message: 'Regra(s) adicionada(s)! A aplicar retroativamente aos membros em segundo plano...' });

    // Aplica retroativamente em background: todos os membros que JÁ têm algum dos
    // cargos ganhos perdem já os cargos escolhidos. Pode demorar em servidores
    // grandes, por isso corre depois de já termos respondido ao pedido.
    (async () => {
      try {
        await guild.members.fetch();
        for (const gainId of gainRoleIds) {
          const loseIdsForThisGain = loseRoleIds.filter(id => id !== gainId);
          if (!loseIdsForThisGain.length) continue;
          const membrosComCargo = guild.members.cache.filter(m => m.roles.cache.has(gainId));
          for (const m of membrosComCargo.values()) {
            for (const loseId of loseIdsForThisGain) {
              if (m.roles.cache.has(loseId)) {
                await m.roles.remove(loseId).catch(() => {});
              }
            }
          }
        }
      } catch (bgErr) {
        console.error('❌ Erro ao aplicar exclusividade retroativamente:', bgErr.message);
      }
    })();
    return;
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/role-exclusivity/delete', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare('DELETE FROM role_exclusivity WHERE guild_id = ? AND id = ?').run(guildId, id);
  res.json({ ok: true, message: 'Regra removida!' });
});

// ── Sugestões ──
app.post('/api/:guildId/sugestao-config', requireGuildAdminApi, (req, res) => {
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

// ── Perguntas à comunidade (envio + listagem + remoção) ──
app.post('/api/:guildId/perguntas', requireGuildAdminApi, async (req, res) => {
  const { guildId } = req.params;
  const { channel_id, pergunta } = req.body;

  if (!channel_id || !pergunta || !pergunta.trim()) {
    return res.status(400).json({ ok: false, message: 'Escolhe um canal e escreve a pergunta.' });
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  const canal = guild.channels.cache.get(channel_id);
  if (!canal) return res.status(404).json({ ok: false, message: 'Canal não encontrado.' });

  const resultado = await enviarPergunta(guild, canal, pergunta.trim(), req.session.user.id);
  if (!resultado.ok) return res.status(500).json(resultado);
  res.json({ ok: true, message: `✅ Pergunta enviada em #${canal.name}! Tópico criado para respostas.` });
});

app.post('/api/:guildId/perguntas/delete', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare('DELETE FROM perguntas WHERE id = ? AND guild_id = ?').run(id, guildId);
  res.json({ ok: true, message: '✅ Registo removido do histórico.' });
});

// ── Reaction Roles (100% Dashboard) ──
// Fluxo: escolhes canal + escreves mensagem + defines 1 a 5 pares emoji->cargo.
// O bot envia a mensagem exatamente como escrita e reage com os emojis escolhidos.
app.get('/api/:guildId/reaction-roles', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const paineis = db.prepare('SELECT * FROM reaction_role_panels WHERE guild_id = ? ORDER BY id DESC').all(guildId);
  const paineisComItens = paineis.map(p => ({
    ...p,
    itens: db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ?').all(guildId, p.message_id)
  }));
  res.json(paineisComItens);
});

app.post('/api/:guildId/reaction-roles', requireGuildAdminApi, async (req, res) => {
  const { guildId } = req.params;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  const { channel_id, conteudo } = req.body;
  let emojis  = req.body.emoji;
  let cargos  = req.body.cargo;
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

app.post('/api/:guildId/reaction-roles/delete', requireGuildAdminApi, async (req, res) => {
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
app.get('/api/:guildId/members', requireGuildAdminApi, async (req, res) => {
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

app.post('/api/:guildId/mod/ban', requireGuildAdminApi, async (req, res) => {
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
    // Por padrão apaga 7 dias de mensagens do banido; só muda se explicitamente enviado outro valor
    const diasApagar = (dias !== undefined && dias !== null && dias !== '') ? parseInt(dias) : 7;
    await target.ban({ reason: razao, deleteMessageSeconds: diasApagar * 86400 });
    logMod(guildId, 'BAN', target.id, req.session.user.id, razao);

    const embed = embedPadrao('🔨 Utilizador Banido (via Dashboard)', `**Utilizador:** <@${target.id}> (\`${target.user.tag}\`)\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_ERRO);
    await sendLog(guild, embed);

    res.json({ ok: true, message: `✅ ${target.user.tag} foi banido.` });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/mod/unban', requireGuildAdminApi, async (req, res) => {
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

app.post('/api/:guildId/mod/kick', requireGuildAdminApi, async (req, res) => {
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

app.post('/api/:guildId/mod/timeout', requireGuildAdminApi, async (req, res) => {
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

app.post('/api/:guildId/mod/untimeout', requireGuildAdminApi, async (req, res) => {
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

app.post('/api/:guildId/mod/warn', requireGuildAdminApi, async (req, res) => {
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

app.post('/api/:guildId/mod/clearwarns', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ ok: false, message: 'Escolhe um membro.' });

  const result = db.prepare('DELETE FROM warns WHERE guild_id = ? AND user_id = ?').run(guildId, user_id);
  res.json({ ok: true, message: `✅ ${result.changes} aviso(s) removido(s).` });
});

app.post('/api/:guildId/mod/limpar', requireGuildAdminApi, async (req, res) => {
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

// ── Blacklist (Dashboard) ──
app.post('/api/:guildId/mod/blacklist-add', requireGuildAdminApi, async (req, res) => {
  const { guildId } = req.params;
  const { username, motivo } = req.body;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ ok: false, message: 'Servidor não encontrado.' });

  const usernameInput = (username || '').trim().replace(/^@/, '').toLowerCase();
  if (!usernameInput) return res.status(400).json({ ok: false, message: 'Indica o username.' });

  const razao = motivo || 'Sem motivo especificado';

  try {
    db.prepare('INSERT INTO blacklist (guild_id, user_id, username, reason, added_by) VALUES (?, NULL, ?, ?, ?)')
      .run(guildId, usernameInput, razao, req.session.user.id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(400).json({ ok: false, message: `⚠️ "${usernameInput}" já está na blacklist deste servidor.` });
    }
    return res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }

  // Se a conta já estiver no servidor agora (por username), bane imediatamente
  let jaBanido = false;
  try {
    await guild.members.fetch();
    const membroEncontrado = guild.members.cache.find(m => m.user.username.toLowerCase() === usernameInput);
    if (membroEncontrado && membroEncontrado.bannable) {
      await membroEncontrado.ban({ reason: `Blacklist: ${razao}` }).catch(() => {});
      jaBanido = true;
      db.prepare('UPDATE blacklist SET user_id = ? WHERE guild_id = ? AND username = ?')
        .run(membroEncontrado.id, guildId, usernameInput);
    }
  } catch (_) {}

  logMod(guildId, 'BLACKLIST-ADD', usernameInput, req.session.user.id, razao);
  const embed = embedPadrao(
    '🚫 Utilizador Adicionado à Blacklist (via Dashboard)',
    `**Username:** \`${usernameInput}\`\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}\n\n${jaBanido ? '⚠️ Este utilizador já estava no servidor e foi banido agora.' : '✅ Se uma conta com este username entrar no servidor, será banida automaticamente.'}`,
    CONFIG.COR_ERRO
  );
  await sendLog(guild, embed);

  res.json({ ok: true, message: jaBanido ? `✅ "${usernameInput}" adicionado à blacklist e banido agora.` : `✅ "${usernameInput}" adicionado à blacklist.` });
});

app.post('/api/:guildId/mod/blacklist-remove', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  const result = db.prepare('DELETE FROM blacklist WHERE guild_id = ? AND id = ?').run(guildId, id);
  if (result.changes === 0) return res.status(404).json({ ok: false, message: 'Entrada não encontrada.' });
  logMod(guildId, 'BLACKLIST-REMOVE', id, req.session.user.id, 'Removido via dashboard');
  res.json({ ok: true, message: '✅ Removido da blacklist.' });
});


app.get('/api/:guildId/ticket-types', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const tipos = db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num, id').all(guildId);
  res.json(tipos);
});

app.post('/api/:guildId/ticket-types', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { label, description, emoji, category_id, support_role, color, has_form } = req.body;
  if (!label) return res.status(400).json({ ok: false, message: 'Indica o nome do tipo de ticket.' });

  const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM ticket_types WHERE guild_id = ?').get(guildId)?.m || 0;

  db.prepare(`
    INSERT INTO ticket_types (guild_id, label, description, emoji, category_id, support_role, color, order_num, has_form)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, label, description || null, emoji || '🎫', category_id || null, support_role || null, color || CONFIG.COR_PRINCIPAL, maxOrder + 1, has_form ? 1 : 0);

  res.json({ ok: true, message: '✅ Tipo de ticket adicionado!' });
});

app.post('/api/:guildId/ticket-types/delete', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare('DELETE FROM ticket_types WHERE id = ? AND guild_id = ?').run(id, guildId);
  db.prepare('DELETE FROM ticket_form_questions WHERE type_id = ? AND guild_id = ?').run(id, guildId);
  res.json({ ok: true, message: '✅ Tipo de ticket removido!' });
});

// ── Ativar/desativar formulário de um tipo de ticket ──
app.post('/api/:guildId/ticket-types/toggle-form', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  const tipo = db.prepare('SELECT * FROM ticket_types WHERE id = ? AND guild_id = ?').get(id, guildId);
  if (!tipo) return res.status(404).json({ ok: false, message: 'Tipo de ticket não encontrado.' });
  db.prepare('UPDATE ticket_types SET has_form = ? WHERE id = ? AND guild_id = ?').run(tipo.has_form ? 0 : 1, id, guildId);
  res.json({ ok: true, message: `✅ Formulário ${tipo.has_form ? 'desativado' : 'ativado'} para este tipo de ticket!` });
});

// ── Perguntas do formulário de um tipo de ticket ──
app.get('/api/:guildId/ticket-types/:typeId/questions', requireGuildAdminApi, (req, res) => {
  const { guildId, typeId } = req.params;
  const perguntas = db.prepare('SELECT * FROM ticket_form_questions WHERE guild_id = ? AND type_id = ? ORDER BY order_num, id').all(guildId, typeId);
  res.json(perguntas);
});

app.post('/api/:guildId/ticket-types/:typeId/questions', requireGuildAdminApi, (req, res) => {
  const { guildId, typeId } = req.params;
  const { question, style, required } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ ok: false, message: 'Indica o texto da pergunta.' });

  const total = db.prepare('SELECT COUNT(*) as c FROM ticket_form_questions WHERE guild_id = ? AND type_id = ?').get(guildId, typeId).c;
  if (total >= 5) return res.status(400).json({ ok: false, message: '❌ Cada formulário pode ter no máximo 5 perguntas (limite dos modais do Discord).' });

  const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM ticket_form_questions WHERE guild_id = ? AND type_id = ?').get(guildId, typeId)?.m || 0;

  db.prepare(`
    INSERT INTO ticket_form_questions (guild_id, type_id, question, style, required, order_num)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, typeId, question.trim(), style === 'long' ? 'long' : 'short', required ? 1 : 0, maxOrder + 1);

  res.json({ ok: true, message: '✅ Pergunta adicionada!' });
});

app.post('/api/:guildId/ticket-types/:typeId/questions/delete', requireGuildAdminApi, (req, res) => {
  const { guildId, typeId } = req.params;
  const { id } = req.body;
  db.prepare('DELETE FROM ticket_form_questions WHERE id = ? AND guild_id = ? AND type_id = ?').run(id, guildId, typeId);
  res.json({ ok: true, message: '✅ Pergunta removida!' });
});

// ── Embeds (Dashboard) ──
app.get('/api/:guildId/embeds', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const embeds = db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
  res.json(embeds);
});

app.post('/api/:guildId/embeds/enviar', requireGuildAdminApi, async (req, res) => {
  const { guildId } = req.params;
  const { channel_id, titulo, descricao, cor, imagem, thumbnail, footer, mensagem, guardar_como } = req.body;
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

    await canal.send({ content: (mensagem && mensagem.trim()) || undefined, embeds: [embed] });

    if (guardar_como && guardar_como.trim()) {
      const data = JSON.stringify({ title: titulo, description: descricao, color: cor || CONFIG.COR_PRINCIPAL, image: imagem || null, thumbnail: thumbnail || null, footer: footer || null, content: (mensagem && mensagem.trim()) || null });
      db.prepare('INSERT INTO saved_embeds (guild_id, name, data, created_by) VALUES (?, ?, ?, ?)').run(guildId, guardar_como.trim(), data, req.session.user.id);
    }

    res.json({ ok: true, message: '✅ Embed enviado!' });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/embeds/guardar', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { nome, titulo, descricao, cor, imagem, thumbnail, footer, mensagem } = req.body;
  if (!nome || !titulo || !descricao) return res.status(400).json({ ok: false, message: 'Preenche nome, título e descrição.' });

  const data = JSON.stringify({ title: titulo, description: descricao, color: cor || CONFIG.COR_PRINCIPAL, image: imagem || null, thumbnail: thumbnail || null, footer: footer || null, content: (mensagem && mensagem.trim()) || null });
  db.prepare('INSERT INTO saved_embeds (guild_id, name, data, created_by) VALUES (?, ?, ?, ?)').run(guildId, nome, data, req.session.user.id);

  res.json({ ok: true, message: `✅ Embed "${nome}" guardado!` });
});

app.post('/api/:guildId/embeds/enviar-guardado', requireGuildAdminApi, async (req, res) => {
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

    await canal.send({ content: data.content || undefined, embeds: [embed] });
    res.json({ ok: true, message: '✅ Embed enviado!' });
  } catch (e) {
    res.status(500).json({ ok: false, message: `Erro: ${e.message}` });
  }
});

app.post('/api/:guildId/embeds/agendar', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id, channel_id, interval_minutes, quantity } = req.body;

  const saved = db.prepare('SELECT * FROM saved_embeds WHERE id = ? AND guild_id = ?').get(id, guildId);
  if (!saved) return res.status(404).json({ ok: false, message: 'Embed não encontrado.' });

  const guild = client.guilds.cache.get(guildId);
  const canal = guild?.channels.cache.get(channel_id);
  if (!canal) return res.status(404).json({ ok: false, message: 'Canal não encontrado.' });

  const minutos = parseInt(interval_minutes, 10);
  if (!minutos || minutos < 1) return res.status(400).json({ ok: false, message: 'Intervalo inválido. Indica um número de minutos maior que 0.' });

  const quantidade = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 20);

  // Usa datetime('now', '+N minutes') do próprio SQLite para garantir o mesmo formato
  // usado na comparação em processarEmbedsAgendadas (evita bug de formato ISO vs SQLite).
  db.prepare(`
    UPDATE saved_embeds
    SET schedule_channel = ?, schedule_interval_minutes = ?, schedule_active = 1,
        schedule_next_send = datetime('now', '+' || ? || ' minutes'), schedule_quantity = ?
    WHERE id = ? AND guild_id = ?
  `).run(channel_id, minutos, minutos, quantidade, id, guildId);

  res.json({ ok: true, message: `✅ Envio automático ativado — ${quantidade}x a cada ${minutos} minuto(s) em #${canal.name}.` });
});

app.post('/api/:guildId/embeds/agendar-parar', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare(`UPDATE saved_embeds SET schedule_active = 0 WHERE id = ? AND guild_id = ?`).run(id, guildId);
  res.json({ ok: true, message: '⏹️ Envio automático desativado.' });
});

// ── Embeds: envio diário a horas fixas (até 5 horários HH:MM, todos os dias) ──
app.post('/api/:guildId/embeds/agendar-horas-fixas', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id, channel_id, times } = req.body;

  const saved = db.prepare('SELECT * FROM saved_embeds WHERE id = ? AND guild_id = ?').get(id, guildId);
  if (!saved) return res.status(404).json({ ok: false, message: 'Embed não encontrado.' });

  const guild = client.guilds.cache.get(guildId);
  const canal = guild?.channels.cache.get(channel_id);
  if (!canal) return res.status(404).json({ ok: false, message: 'Canal não encontrado.' });

  let horarios = Array.isArray(times) ? times : (times ? [times] : []);
  horarios = horarios.map(h => String(h).trim()).filter(Boolean);
  // Valida formato HH:MM
  const regexHora = /^([01]\d|2[0-3]):([0-5]\d)$/;
  horarios = horarios.filter(h => regexHora.test(h));
  // Remove duplicados e limita a 5
  horarios = [...new Set(horarios)].slice(0, 5);

  if (!horarios.length) {
    return res.status(400).json({ ok: false, message: 'Indica pelo menos um horário válido (formato HH:MM), até 5.' });
  }

  db.prepare(`
    UPDATE saved_embeds
    SET schedule_daily_channel = ?, schedule_daily_times = ?, schedule_daily_active = 1, schedule_daily_last_sent = '{}'
    WHERE id = ? AND guild_id = ?
  `).run(channel_id, horarios.join(','), id, guildId);

  res.json({ ok: true, message: `✅ Envio diário ativado às ${horarios.join(', ')} em #${canal.name}.` });
});

app.post('/api/:guildId/embeds/agendar-horas-fixas-parar', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare(`UPDATE saved_embeds SET schedule_daily_active = 0 WHERE id = ? AND guild_id = ?`).run(id, guildId);
  res.json({ ok: true, message: '⏹️ Envio diário a horas fixas desativado.' });
});

app.post('/api/:guildId/embeds/delete', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare('DELETE FROM saved_embeds WHERE id = ? AND guild_id = ?').run(id, guildId);
  res.json({ ok: true, message: '✅ Embed removido!' });
});

// ── Staff (Dashboard) ──
app.get('/api/:guildId/staff/ranking', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  res.json(getRankingStaff(guildId));
});

app.get('/api/:guildId/staff/historico/:staffId', requireGuildAdminApi, (req, res) => {
  const { guildId, staffId } = req.params;
  const historico = db.prepare('SELECT * FROM staff_ratings WHERE guild_id = ? AND staff_id = ? ORDER BY created_at DESC LIMIT 20').all(guildId, staffId);
  const stats = db.prepare('SELECT AVG(rating) as media, COUNT(*) as total, MIN(rating) as min, MAX(rating) as max FROM staff_ratings WHERE guild_id = ? AND staff_id = ?').get(guildId, staffId);
  res.json({ historico, stats });
});

app.post('/api/:guildId/staff/avaliar', requireGuildAdminApi, async (req, res) => {
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

app.post('/api/:guildId/staff/remover-avaliacao', requireGuildAdminApi, (req, res) => {
  const { guildId } = req.params;
  const { id } = req.body;
  db.prepare('DELETE FROM staff_ratings WHERE id = ? AND guild_id = ?').run(id, guildId);
  res.json({ ok: true, message: '✅ Avaliação removida!' });
});

// ── Votação ──
app.post('/api/:guildId/votacao-config', requireGuildAdminApi, (req, res) => {
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

app.post('/api/:guildId/votacao-remove', requireGuildAdminApi, (req, res) => {
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
    --bg: #0b0d13;
    --bg2: #171a24;
    --bg3: #1f2333;
    --bg4: #262b40;
    --accent: #5865F2;
    --accent2: #4752c4;
    --accent-glow: rgba(88,101,242,.35);
    --success: #57F287;
    --danger: #ED4245;
    --warning: #FEE75C;
    --text: #e3e5ec;
    --text2: #8b92b8;
    --border: #2a2e45;
    --card-shadow: 0 4px 24px rgba(0,0,0,0.35);
    --card-shadow-hover: 0 8px 32px rgba(0,0,0,0.45);
    --radius: 14px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: radial-gradient(circle at 15% 0%, #14182a 0%, var(--bg) 45%);
    color: var(--text); font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    min-height: 100vh; letter-spacing: 0.1px;
  }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: var(--bg2); }
  ::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--accent); }
  a { color: var(--accent); text-decoration: none; }
  .navbar {
    background: rgba(23,26,36,0.85); border-bottom: 1px solid var(--border); padding: 0 24px; height: 60px;
    display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100;
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  }
  .navbar .logo { font-size: 1.3rem; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 10px; }
  .navbar .logo span { color: var(--accent); text-shadow: 0 0 20px var(--accent-glow); }
  .navbar .user { display: flex; align-items: center; gap: 10px; }
  .navbar .user img { width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--accent); box-shadow: 0 0 0 3px rgba(88,101,242,.12); }
  .navbar .logout-btn { background: var(--danger); color: #fff; border: none; padding: 7px 16px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all 0.2s; }
  .navbar .logout-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .container { max-width: 1300px; margin: 0 auto; padding: 28px 20px; }
  .card {
    background: linear-gradient(180deg, var(--bg2) 0%, var(--bg2) 100%);
    border: 1px solid var(--border); border-radius: var(--radius); padding: 24px;
    box-shadow: var(--card-shadow); transition: box-shadow 0.25s ease, border-color 0.25s ease;
  }
  .card:hover { border-color: #363c5c; box-shadow: var(--card-shadow-hover); }
  .card h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 16px; color: var(--text); display: flex; align-items: center; gap: 8px; }
  .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
  .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
  .stat-card {
    background: linear-gradient(155deg, var(--bg3) 0%, var(--bg2) 100%);
    border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .stat-card:hover { transform: translateY(-4px); border-color: var(--accent); box-shadow: 0 6px 24px rgba(88,101,242,.15); }
  .stat-card .num { font-size: 2.2rem; font-weight: 800; color: var(--accent); text-shadow: 0 0 24px var(--accent-glow); }
  .stat-card .lbl { font-size: 0.85rem; color: var(--text2); margin-top: 4px; }
  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 6px; color: var(--text2); }
  .form-group input, .form-group select, .form-group textarea {
    width: 100%; background: var(--bg3); border: 1px solid var(--border); border-radius: 9px; padding: 10px 14px;
    color: var(--text); font-size: 0.9rem; outline: none; transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(88,101,242,.15); }
  .form-group select option { background: var(--bg3); }
  .toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .toggle input[type=checkbox] { width: 40px; height: 22px; appearance: none; background: var(--border); border-radius: 11px; cursor: pointer; transition: background 0.2s; position: relative; }
  .toggle input[type=checkbox]:checked { background: var(--accent); box-shadow: 0 0 12px var(--accent-glow); }
  .toggle input[type=checkbox]::before { content:''; position: absolute; width: 18px; height: 18px; background: #fff; border-radius: 50%; top: 2px; left: 2px; transition: left 0.2s; }
  .toggle input[type=checkbox]:checked::before { left: 20px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 9px; border: none; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.18s ease; }
  .btn:active { transform: scale(0.97); }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent2); box-shadow: 0 4px 16px var(--accent-glow); transform: translateY(-1px); }
  .btn-success { background: var(--success); color: #000; }
  .btn-success:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .btn-danger  { background: var(--danger); color: #fff; }
  .btn-danger:hover { filter: brightness(1.1); transform: translateY(-1px); }
  .btn-warning { background: var(--warning); color: #1a1a1a; }
  .btn-warning:hover { filter: brightness(1.05); transform: translateY(-1px); }
  .btn-secondary { background: var(--bg3); color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { background: var(--bg4); border-color: #3a4066; }
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
  .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 11px 20px; color: var(--text2); cursor: pointer; transition: all 0.18s ease; border: none; background: none; width: 100%; font-size: 0.9rem; border-right: 2px solid transparent; }
  .sidebar-item:hover { background: var(--bg3); color: var(--text); }
  .sidebar-item.active { background: var(--bg3); color: var(--accent); border-right: 2px solid var(--accent); font-weight: 600; }
  .main-content { margin-left: 240px; padding: 24px; }
  .alert { padding: 12px 16px; border-radius: 9px; margin-bottom: 16px; font-size: 0.9rem; }
  .alert-success { background: rgba(87,242,135,.1); border: 1px solid var(--success); color: var(--success); }
  .alert-error   { background: rgba(237,66,69,.1); border: 1px solid var(--danger); color: var(--danger); }
  .guild-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 24px; }
  .guild-card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center; cursor: pointer; transition: all 0.22s ease; }
  .guild-card:hover { border-color: var(--accent); transform: translateY(-4px); box-shadow: 0 8px 32px rgba(88,101,242,.2); }
  .guild-card img { width: 64px; height: 64px; border-radius: 50%; margin-bottom: 10px; }
  .guild-card .name { font-weight: 700; font-size: 0.95rem; }
  .guild-card .members { font-size: 0.8rem; color: var(--text2); margin-top: 4px; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 20px; color: var(--text); box-shadow: var(--card-shadow-hover); z-index: 9999; transform: translateY(100px); opacity: 0; transition: all 0.3s; max-width: 320px; }
  .toast.show { transform: translateY(0); opacity: 1; }
  .toast.success { border-left: 4px solid var(--success); }
  .toast.error   { border-left: 4px solid var(--danger); }
  .section-title { font-size: 1.4rem; font-weight: 800; margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }
  .section-title span { font-size: 1.6rem; }
  .data-table { width: 100%; border-collapse: collapse; }
  .data-table th, .data-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
  .data-table th { color: var(--text2); font-weight: 700; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.5px; }
  .data-table tr { transition: background 0.15s ease; }
  .data-table tbody tr:hover { background: rgba(255,255,255,0.02); }
  .role-picker-row { transition: opacity 0.15s ease; }
  .role-picker-select { background: var(--bg3); border: 1px solid var(--border); border-radius: 9px; padding: 10px 14px; color: var(--text); font-size: 0.9rem; outline: none; transition: border-color 0.2s ease; }
  .role-picker-select:focus { border-color: var(--accent); }
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
    nova.querySelectorAll('select').forEach(s => { s.value = ''; s.removeAttribute('id'); });
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

  // ── Cargos ──
  function addRolePickerRow(containerId) {
    const container = document.getElementById(containerId);
    const optionsHtml = ['<option value="">— Seleciona um cargo —</option>']
      .concat(ALL_ROLES.map(r => '<option value="' + r.id + '">' + r.name + '</option>'))
      .join('');
    const row = document.createElement('div');
    row.className = 'role-picker-row';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
    row.innerHTML = '<select class="role-picker-select" style="flex:1">' + optionsHtml + '</select>' +
      '<button type="button" class="btn btn-danger role-picker-remove" style="padding:6px 12px" onclick="this.parentElement.remove()">✕</button>';
    container.appendChild(row);
  }

  function getRolePickerValues(containerId) {
    const container = document.getElementById(containerId);
    return Array.from(container.querySelectorAll('.role-picker-select'))
      .map(s => s.value)
      .filter(v => v);
  }

  async function saveAutoRole(guildId, target) {
    const containerId = target === 'bot' ? 'autorole_bot_roles' : 'autorole_human_roles';
    const roleIds = getRolePickerValues(containerId);
    try {
      const res = await fetch('/api/' + guildId + '/autorole', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ target, role_ids: roleIds })
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function saveImmunitySettings(guildId) {
    const immuneAdmins = document.getElementById('immune-admins').checked;
    const immuneRoleIds = getRolePickerValues('immune_roles');
    try {
      const res = await fetch('/api/' + guildId + '/immunity-config', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ immune_admins: immuneAdmins, immune_role_ids: immuneRoleIds })
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Palavras e Links Bloqueados (AntiSpam) ──
  function addBlockedWordRow() {
    const container = document.getElementById('blocked-words-list');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center';
    row.innerHTML = '<input type="text" class="blocked-word-input" style="flex:1" placeholder="Palavra ou expressão">' +
      '<button type="button" class="btn btn-danger" style="padding:6px 12px" onclick="this.parentElement.remove()">✕</button>';
    container.appendChild(row);
    row.querySelector('input').focus();
  }

  function addBlockedLinkRow() {
    const container = document.getElementById('blocked-links-list');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center';
    row.innerHTML = '<input type="text" class="blocked-link-input" style="flex:1" placeholder="Ex: youtube.com">' +
      '<button type="button" class="btn btn-danger" style="padding:6px 12px" onclick="this.parentElement.remove()">✕</button>';
    container.appendChild(row);
    row.querySelector('input').focus();
  }

  async function saveBlockedWords(guildId) {
    const words = Array.from(document.querySelectorAll('#blocked-words-list .blocked-word-input'))
      .map(i => i.value.trim()).filter(v => v);
    try {
      const res = await fetch('/api/' + guildId + '/antispam-blocked-words', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ words })
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function saveBlockedLinks(guildId) {
    const links = Array.from(document.querySelectorAll('#blocked-links-list .blocked-link-input'))
      .map(i => i.value.trim()).filter(v => v);
    try {
      const res = await fetch('/api/' + guildId + '/antispam-blocked-links', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ links })
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function addExclusividade(guildId) {
    const gainIds = getRolePickerValues('gain_role_ids');
    const loseIds = getRolePickerValues('lose_role_ids');
    if (!gainIds.length || !loseIds.length) { toast('❌ Escolhe pelo menos um cargo a ganhar e pelo menos um cargo a perder.', 'error'); return; }
    try {
      const res = await fetch('/api/' + guildId + '/role-exclusivity', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ gain_role_ids: gainIds, lose_role_ids: loseIds })
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function removeExclusividade(guildId, id) {
    if (!confirm('Remover esta regra de exclusividade de cargos?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/role-exclusivity/delete', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'},
        body: 'id=' + encodeURIComponent(id)
      });
      const json = await res.json();
      toast(json.ok ? json.message : '❌ Erro', json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Server Stats ──
  async function saveStatsConfig(guildId, enabled) {
    try {
      const params = new URLSearchParams();
      params.set('enabled', enabled ? '1' : '');
      if (enabled) {
        params.set('show_emoji', document.getElementById('stats-show-emoji').checked ? '1' : '');
        params.set('show_members', document.getElementById('stats-show-members').checked ? '1' : '');
        params.set('show_bots', document.getElementById('stats-show-bots').checked ? '1' : '');
        params.set('show_channels', document.getElementById('stats-show-channels').checked ? '1' : '');
        params.set('show_roles', document.getElementById('stats-show-roles').checked ? '1' : '');
        params.set('show_boosts', document.getElementById('stats-show-boosts').checked ? '1' : '');
      }
      const res = await fetch('/api/' + guildId + '/stats-config', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: params.toString()
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

  // ── Blacklist ──
  async function addBlacklist(guildId) {
    const form = document.getElementById('form-mod-blacklist');
    const data = new FormData(form);
    const body = new URLSearchParams(data).toString();
    try {
      const res = await fetch('/api/' + guildId + '/mod/blacklist-add', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) { form.reset(); setTimeout(() => location.reload(), 800); }
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function removeBlacklist(guildId, id) {
    if (!confirm('Remover este utilizador da blacklist?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/mod/blacklist-remove', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + encodeURIComponent(id)
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
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
  async function toggleTicketForm(guildId, typeId) {
    try {
      const res = await fetch('/api/' + guildId + '/ticket-types/toggle-form', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + typeId
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function toggleQuestionsPanel(guildId, typeId) {
    const row = document.getElementById('questions-row-' + typeId);
    if (!row) return;
    const showing = row.style.display !== 'none';
    row.style.display = showing ? 'none' : 'table-row';
    if (!showing) await loadTicketQuestions(guildId, typeId);
  }

  async function loadTicketQuestions(guildId, typeId) {
    const list = document.getElementById('questions-list-' + typeId);
    if (!list) return;
    list.innerHTML = 'A carregar perguntas...';
    try {
      const res = await fetch('/api/' + guildId + '/ticket-types/' + typeId + '/questions');
      const perguntas = await res.json();
      if (!perguntas.length) {
        list.innerHTML = '<p style="margin:0">Nenhuma pergunta configurada ainda.</p>';
        return;
      }
      list.innerHTML = perguntas.map(q => \`
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
          <span>❓ \${q.question} <span style="opacity:0.6;font-size:0.78rem">(\${q.style === 'long' ? 'texto longo' : 'texto curto'}\${q.required ? ', obrigatória' : ''})</span></span>
          <button type="button" class="btn btn-danger" style="padding:2px 8px;font-size:0.75rem" onclick="removeTicketQuestion('\${guildId}', \${typeId}, \${q.id})">🗑️</button>
        </div>
      \`).join('');
    } catch(e) { list.innerHTML = '<p style="color:var(--danger)">Erro ao carregar perguntas</p>'; }
  }

  async function addTicketQuestion(guildId, typeId) {
    const question = document.getElementById('q-text-' + typeId).value.trim();
    const style    = document.getElementById('q-style-' + typeId).value;
    const required = document.getElementById('q-required-' + typeId).checked;
    if (!question) return toast('❌ Escreve o texto da pergunta', 'error');
    try {
      const body = new URLSearchParams({ question, style, required: required ? '1' : '' }).toString();
      const res = await fetch('/api/' + guildId + '/ticket-types/' + typeId + '/questions', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) {
        document.getElementById('q-text-' + typeId).value = '';
        await loadTicketQuestions(guildId, typeId);
      }
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function removeTicketQuestion(guildId, typeId, questionId) {
    if (!confirm('Remover esta pergunta?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/ticket-types/' + typeId + '/questions/delete', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + questionId
      });
      const json = await res.json();
      toast(json.ok ? json.message : '❌ Erro', json.ok ? 'success' : 'error');
      if (json.ok) await loadTicketQuestions(guildId, typeId);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function enviarPainelTicket(guildId) {
    const form = document.getElementById('form-ticket-panel');
    const data = new FormData(form);
    const body = new URLSearchParams(data).toString();
    try {
      const res = await fetch('/api/' + guildId + '/ticket-painel', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
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
  async function agendarEmbed(guildId, id) {
    const selCanal = document.getElementById('embed-auto-canal-' + id);
    const inputMin = document.getElementById('embed-auto-min-' + id);
    const inputQty = document.getElementById('embed-auto-qty-' + id);
    const channel_id = selCanal ? selCanal.value : '';
    const interval_minutes = inputMin ? inputMin.value : '';
    const quantity = inputQty ? (inputQty.value || '1') : '1';
    if (!channel_id) { toast('❌ Escolhe um canal para o envio automático.', 'error'); return; }
    if (!interval_minutes || parseInt(interval_minutes) < 1) { toast('❌ Indica de quantos em quantos minutos deve enviar (ex: 60 para 1h).', 'error'); return; }
    if (!quantity || parseInt(quantity) < 1) { toast('❌ Indica quantos embeds enviar de cada vez (mínimo 1).', 'error'); return; }
    try {
      const res = await fetch('/api/' + guildId + '/embeds/agendar', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'},
        body: 'id=' + id + '&channel_id=' + channel_id + '&interval_minutes=' + interval_minutes + '&quantity=' + quantity
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 1000);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function pararAgendamentoEmbed(guildId, id) {
    if (!confirm('Parar o envio automático deste embed?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/embeds/agendar-parar', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + id
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 1000);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function agendarEmbedHorasFixas(guildId, id) {
    const selCanal = document.getElementById('embed-daily-canal-' + id);
    const channel_id = selCanal ? selCanal.value : '';
    if (!channel_id) { toast('❌ Escolhe um canal para o envio diário.', 'error'); return; }
    const times = [];
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById('embed-daily-time-' + id + '-' + i);
      if (el && el.value) times.push(el.value);
    }
    if (!times.length) { toast('❌ Indica pelo menos um horário (até 5).', 'error'); return; }
    try {
      const res = await fetch('/api/' + guildId + '/embeds/agendar-horas-fixas', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id, channel_id, times })
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 1000);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function pararAgendamentoEmbedHorasFixas(guildId, id) {
    if (!confirm('Parar o envio diário a horas fixas deste embed?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/embeds/agendar-horas-fixas-parar', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + id
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 1000);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  // ── Perguntas à comunidade ──
  async function enviarPerguntaDashboard(guildId) {
    const form = document.getElementById('form-pergunta');
    const canal = form.querySelector('[name="channel_id"]').value;
    const pergunta = document.getElementById('pergunta-texto').value.trim();
    if (!canal) { toast('❌ Escolhe um canal.', 'error'); return; }
    if (!pergunta) { toast('❌ Escreve a pergunta.', 'error'); return; }
    try {
      const res = await fetch('/api/' + guildId + '/perguntas', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ channel_id: canal, pergunta })
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 1000);
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function removePergunta(guildId, id) {
    if (!confirm('Remover este registo do histórico? (não apaga a mensagem no Discord)')) return;
    try {
      const res = await fetch('/api/' + guildId + '/perguntas/delete', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + id
      });
      const json = await res.json();
      toast(json.ok ? json.message : '❌ Erro', json.ok ? 'success' : 'error');
      if (json.ok) setTimeout(() => location.reload(), 800);
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
  const { ticketConfig, guildConfig, antispam, statsConfig, votacaoConfig, sugestaoConfig, reactionRoles, ticketTypes, savedEmbeds, perguntas, staffRanking, members, totalTickets, openTickets, totalWarns, totalSugs, channels, roles, categories, autoroleHumanos, autoroleBots, roleExclusivity, blacklist, immuneRoles } = data;

  const makeSelect = (name, options, current, placeholder='Seleciona...') =>
    `<select name="${name}" id="${name}">
      <option value="">— ${placeholder} —</option>
      ${options.map(o => `<option value="${o.id}" ${o.id === current ? 'selected' : ''}>${o.name}</option>`).join('')}
    </select>`;

  const makeRolePickerList = (name, options, currentList=[]) => {
    const lista = currentList.length ? currentList : [''];
    const optionsHtml = current => `<option value="">— Seleciona um cargo —</option>` +
      options.map(o => `<option value="${o.id}" ${o.id === current ? 'selected' : ''}>${o.name}</option>`).join('');
    return `<div id="${name}" class="role-picker-list" data-role-name="${name}">
      ${lista.map(current => `
        <div class="role-picker-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <select class="role-picker-select" style="flex:1">${optionsHtml(current)}</select>
          <button type="button" class="btn btn-danger role-picker-remove" style="padding:6px 12px" onclick="this.parentElement.remove()">✕</button>
        </div>
      `).join('')}
    </div>
    <button type="button" class="btn btn-secondary" style="margin-top:4px" onclick="addRolePickerRow('${name}')">➕ Adicionar outro cargo</button>`;
  };

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
      ['❓','Perguntas','perguntas_tab'],
      ['🎭','Reaction Roles','rr_tab'],
      ['🎖️','Cargos','cargos_tab'],
      ['📈','Server Stats','stats_tab'],
      ['🗳️','Votação','votacao_tab'],
    ].map(([ico,lbl,id]) => `<button class="sidebar-item" onclick="showSection('${id}', event)">${ico} ${lbl}</button>`).join('')}
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

      <div class="card" style="margin-top:20px">
        <h2>🤖 Identidade do Bot neste Servidor</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Podes definir um <strong>apelido</strong> diferente para o bot só neste servidor — aparece em todo o lado (lista de membros, menções, etc). Deixa vazio para usar o nome original do bot.
        </p>
        <form id="form-bot-identity">
          <div class="form-group">
            <label>Apelido do bot neste servidor</label>
            <input type="text" name="bot_nickname" id="bot_nickname" placeholder="Ex: Assistente do Servidor" maxlength="32" value="${guildConfig?.bot_nickname || ''}">
          </div>
          <div style="margin:8px 0 16px;padding:12px;background:var(--bg3);border-radius:8px;font-size:0.85rem;color:var(--text2)">
            ⚠️ O bot precisa da permissão <strong>Gerir Apelidos</strong> neste servidor para isto funcionar.
          </div>
          <button type="button" class="btn btn-primary" onclick="saveBotIdentity('${guild.id}')">💾 Guardar Apelido</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🛡️ Imunidade ao AutoMod</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Cargos e/ou administradores marcados aqui ficam <strong>imunes às proteções automáticas</strong> do bot (anti-spam, anti-links, anti-convites, canal-armadilha, anti-raid). Isto <strong>não</strong> impede que sejam banidos ou expulsos manualmente por um administrador — só protege contra ações automáticas do bot.
        </p>
        <div class="form-group">
          <label class="toggle">
            <input type="checkbox" id="immune-admins" ${guildConfig?.immune_admins ? 'checked' : ''}>
            <span>Administradores são sempre imunes ao AutoMod</span>
          </label>
        </div>
        <div class="form-group">
          <label>Cargos Imunes ao AutoMod</label>
          ${makeRolePickerList('immune_roles', roles, immuneRoles)}
        </div>
        <button type="button" class="btn btn-primary" onclick="saveImmunitySettings('${guild.id}')">💾 Guardar Imunidade</button>
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
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" name="has_form" value="1" style="width:auto">
              📋 Com formulário (o utilizador preenche perguntas ao abrir o ticket)
            </label>
          </div>
          <button type="button" class="btn btn-primary" onclick="addTicketType('${guild.id}')">➕ Adicionar Tipo</button>
        </form>
        <div id="ticket-types-table" style="margin-top:16px">
          ${ticketTypes.length ? `
            <table class="data-table">
              <thead><tr><th>Emoji</th><th>Nome</th><th>Descrição</th><th>Formulário</th><th></th></tr></thead>
              <tbody>
                ${ticketTypes.map(t => `
                  <tr>
                    <td>${t.emoji || '🎫'}</td>
                    <td>${t.label}</td>
                    <td style="color:var(--text2)">${t.description || '—'}</td>
                    <td>
                      <span class="badge badge-${t.has_form ? 'green' : 'red'}" style="cursor:pointer" onclick="toggleTicketForm('${guild.id}', ${t.id})" title="Clica para ${t.has_form ? 'desativar' : 'ativar'}">${t.has_form ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td style="white-space:nowrap">
                      ${t.has_form ? `<button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:0.8rem" onclick="toggleQuestionsPanel('${guild.id}', ${t.id})">📋 Perguntas</button>` : ''}
                      <button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="removeTicketType('${guild.id}', ${t.id})">🗑️</button>
                    </td>
                  </tr>
                  ${t.has_form ? `
                  <tr id="questions-row-${t.id}" style="display:none">
                    <td colspan="5">
                      <div style="background:var(--bg2, rgba(255,255,255,0.03));border-radius:8px;padding:14px">
                        <div id="questions-list-${t.id}" style="margin-bottom:12px;color:var(--text2)">A carregar perguntas...</div>
                        <div class="grid-2">
                          <div class="form-group">
                            <label>Pergunta</label>
                            <input type="text" id="q-text-${t.id}" placeholder="Ex: Qual é o teu nome completo?" maxlength="45">
                          </div>
                          <div class="form-group">
                            <label>Tipo de resposta</label>
                            <select id="q-style-${t.id}">
                              <option value="short">Texto curto</option>
                              <option value="long">Texto longo</option>
                            </select>
                          </div>
                        </div>
                        <div class="form-group">
                          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                            <input type="checkbox" id="q-required-${t.id}" checked style="width:auto">
                            Pergunta obrigatória
                          </label>
                        </div>
                        <button type="button" class="btn btn-primary" style="font-size:0.85rem" onclick="addTicketQuestion('${guild.id}', ${t.id})">➕ Adicionar Pergunta</button>
                        <p style="color:var(--text2);font-size:0.78rem;margin-top:8px">Máximo de 5 perguntas por formulário (limite dos modais do Discord).</p>
                      </div>
                    </td>
                  </tr>
                  ` : ''}
                `).join('')}
              </tbody>
            </table>
          ` : `<p style="color:var(--text2)">Nenhum tipo de ticket criado ainda — o painel usará um botão simples.</p>`}
        </div>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>📤 Enviar Painel de Tickets</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Publica a mensagem com o botão (ou menu, se já tiveres tipos de ticket criados) para os membros abrirem tickets.
          Certifica-te de que já guardaste a "Configuração de Tickets" acima antes de enviar.
        </p>
        <form id="form-ticket-panel">
          <div class="form-group">
            <label>Canal onde publicar o painel</label>
            ${makeSelect('channel_id', channels, ticketConfig?.panel_channel_id, 'Canal')}
          </div>
          <div class="form-group">
            <label>Título</label>
            <input type="text" name="titulo" value="🎫 Suporte" maxlength="256">
          </div>
          <div class="form-group">
            <label>Descrição</label>
            <textarea name="descricao" rows="3">Clica no botão abaixo para abrir um ticket de suporte.
A nossa equipa irá responder o mais brevemente possível!</textarea>
          </div>
          <button type="button" class="btn btn-primary" onclick="enviarPainelTicket('${guild.id}')">📤 Enviar Painel</button>
        </form>
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
            <div class="form-group"><label>Apagar mensagens (dias)</label><input type="number" name="dias" value="7" min="0" max="7"></div>
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

        <div class="card">
          <h2>🚫 Blacklist</h2>
          <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
            Bane automaticamente pelo <strong>username</strong> — funciona mesmo que a conta nunca tenha entrado no servidor. Se a pessoa já estiver no servidor, é banida de imediato.
          </p>
          <form id="form-mod-blacklist">
            <div class="form-group"><label>Username</label><input type="text" name="username" placeholder="Username do utilizador"></div>
            <div class="form-group"><label>Motivo</label><input type="text" name="motivo" placeholder="Ex: raid anterior"></div>
            <button type="button" class="btn btn-danger" onclick="addBlacklist('${guild.id}')">🚫 Adicionar à Blacklist</button>
          </form>
        </div>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🚫 Utilizadores na Blacklist</h2>
        ${blacklist.length ? `
          <table class="data-table">
            <thead><tr><th>Username</th><th>ID (se conhecido)</th><th>Motivo</th><th></th></tr></thead>
            <tbody>
              ${blacklist.map(b => `
                <tr>
                  <td>${b.username}</td>
                  <td>${b.user_id ? `<code>${b.user_id}</code>` : '<span style="color:var(--text2)">nunca visto</span>'}</td>
                  <td>${b.reason || '—'}</td>
                  <td><button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="removeBlacklist('${guild.id}', ${b.id})">🗑️</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<p style="color:var(--text2)">A blacklist deste servidor está vazia.</p>`}
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
            <label>Mensagem fora do embed (opcional)</label>
            <input type="text" name="mensagem" placeholder="Texto enviado por cima do embed, ex: @everyone">
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
              <thead><tr><th>Nome</th><th>Título</th><th>Enviar uma vez</th><th>Envio automático (intervalo)</th><th>Envio diário (horas fixas)</th><th></th></tr></thead>
              <tbody>
                ${savedEmbeds.map(e => {
                  let titulo = '—';
                  try { titulo = JSON.parse(e.data).title || '—'; } catch(_) {}
                  const canalAtual = channels.find(c => c.id === e.schedule_channel);
                  const statusAuto = e.schedule_active
                    ? `<span style="color:var(--success, #3ba55c)">🟢 ${e.schedule_quantity || 1}x a cada ${e.schedule_interval_minutes} min em #${canalAtual ? canalAtual.name : '?'}</span>`
                    : `<span style="color:var(--text2)">⚪ Desligado</span>`;
                  const canalDiario = channels.find(c => c.id === e.schedule_daily_channel);
                  const horariosAtuais = (e.schedule_daily_times || '').split(',').filter(Boolean);
                  const statusDiario = e.schedule_daily_active
                    ? `<span style="color:var(--success, #3ba55c)">🟢 ${horariosAtuais.join(', ')} em #${canalDiario ? canalDiario.name : '?'}</span>`
                    : `<span style="color:var(--text2)">⚪ Desligado</span>`;
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
                    <td>
                      <div style="margin-bottom:4px">${statusAuto}</div>
                      <select id="embed-auto-canal-${e.id}" style="width:auto;display:inline-block;padding:4px 8px;font-size:0.8rem">
                        <option value="">Canal...</option>
                        ${channels.map(c => `<option value="${c.id}" ${c.id === e.schedule_channel ? 'selected' : ''}>#${c.name}</option>`).join('')}
                      </select>
                      <input type="number" min="1" max="20" id="embed-auto-qty-${e.id}" placeholder="qtd" value="${e.schedule_quantity || 1}" title="Quantas vezes enviar de cada vez" style="width:50px;display:inline-block;padding:4px 8px;font-size:0.8rem">
                      <span style="font-size:0.75rem;color:var(--text2)">x a cada</span>
                      <input type="number" min="1" id="embed-auto-min-${e.id}" placeholder="min" value="${e.schedule_interval_minutes || ''}" style="width:60px;display:inline-block;padding:4px 8px;font-size:0.8rem">
                      <span style="font-size:0.75rem;color:var(--text2)">min</span>
                      <button type="button" class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem" onclick="agendarEmbed('${guild.id}', ${e.id})" title="Ativar envio automático">▶️</button>
                      ${e.schedule_active ? `<button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="pararAgendamentoEmbed('${guild.id}', ${e.id})" title="Parar envio automático">⏹️</button>` : ''}
                    </td>
                    <td>
                      <div style="margin-bottom:4px">${statusDiario}</div>
                      <select id="embed-daily-canal-${e.id}" style="width:auto;display:inline-block;padding:4px 8px;font-size:0.8rem">
                        <option value="">Canal...</option>
                        ${channels.map(c => `<option value="${c.id}" ${c.id === e.schedule_daily_channel ? 'selected' : ''}>#${c.name}</option>`).join('')}
                      </select>
                      <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">
                        ${[0,1,2,3,4].map(i => `<input type="time" id="embed-daily-time-${e.id}-${i}" value="${horariosAtuais[i] || ''}" style="padding:4px 6px;font-size:0.8rem;width:100px">`).join('')}
                      </div>
                      <span style="font-size:0.7rem;color:var(--text2)">Até 5 horários, enviado todos os dias</span><br>
                      <button type="button" class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem;margin-top:4px" onclick="agendarEmbedHorasFixas('${guild.id}', ${e.id})" title="Ativar envio diário a horas fixas">▶️</button>
                      ${e.schedule_daily_active ? `<button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="pararAgendamentoEmbedHorasFixas('${guild.id}', ${e.id})" title="Parar envio diário">⏹️</button>` : ''}
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
              <label>Duração do Mute (segundos)</label>
              <input type="number" name="mute_duration" value="${antispam?.mute_duration || 300}" min="10" max="2419200">
            </div>
            <div class="form-group">
              <label>Canal de Log do AntiSpam</label>
              ${makeSelect('log_channel', channels, antispam?.log_channel, 'Canal')}
            </div>
          </div>
          <div style="margin:-4px 0 16px;font-size:0.8rem;color:var(--text2)">
            💡 Só se aplica quando a ação escolhida é "Mute". Valor por defeito: 300s (5 minutos). Máximo permitido pelo Discord: 2419200s (28 dias).
          </div>
          <div class="grid-2" style="margin-bottom:16px">
            <label class="toggle"><input type="checkbox" name="anti_links" value="1" ${antispam?.anti_links?'checked':''}><span>Bloquear Links Externos</span></label>
            <label class="toggle"><input type="checkbox" name="anti_invites" value="1" ${antispam?.anti_invites?'checked':''}><span>Bloquear Convites Discord</span></label>
            <label class="toggle"><input type="checkbox" name="anti_raid" value="1" ${antispam?.anti_raid?'checked':''}><span>Proteção Anti-Raid</span></label>
            <label class="toggle"><input type="checkbox" name="anti_bot_add" value="1" ${antispam?.anti_bot_add?'checked':''}><span>Banir quem adicionar bots sem ser Admin</span></label>
          </div>
          <div class="form-group">
            <label>Canal-Armadilha (quem escrever aqui é banido automaticamente)</label>
            ${makeSelect('trap_channel', channels, antispam?.trap_channel, 'Canal')}
          </div>
          <button type="button" class="btn btn-primary" onclick="saveConfig('${guild.id}','antispam-config','form-antispam')">💾 Guardar</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🚫 Palavras Bloqueadas</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Define palavras ou expressões específicas que, ao aparecerem numa mensagem, fazem o bot apagá-la automaticamente.
        </p>
        <div id="blocked-words-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
          ${(() => { try { return JSON.parse(antispam?.blocked_words || '[]'); } catch(_) { return []; } })().map(p => `
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" class="blocked-word-input" value="${p.replace(/"/g,'&quot;')}" style="flex:1">
              <button type="button" class="btn btn-danger" style="padding:6px 12px" onclick="this.parentElement.remove()">✕</button>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button type="button" class="btn btn-secondary" onclick="addBlockedWordRow()">➕ Adicionar Palavra</button>
          <button type="button" class="btn btn-primary" onclick="saveBlockedWords('${guild.id}')">💾 Guardar Palavras Bloqueadas</button>
        </div>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🔗 Links Bloqueados</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Define domínios específicos que queres bloquear (ex: <code>youtube.com</code>, <code>bit.ly</code>, <code>tiktok.com</code>) — sem precisar de bloquear todos os links. Funciona mesmo que "Bloquear Links Externos" esteja desligado.
        </p>
        <div id="blocked-links-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
          ${(() => { try { return JSON.parse(antispam?.blocked_links || '[]'); } catch(_) { return []; } })().map(l => `
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" class="blocked-link-input" value="${l.replace(/"/g,'&quot;')}" style="flex:1">
              <button type="button" class="btn btn-danger" style="padding:6px 12px" onclick="this.parentElement.remove()">✕</button>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-secondary" onclick="addBlockedLinkRow()">➕ Adicionar Link/Domínio</button>
          <button type="button" class="btn btn-primary" onclick="saveBlockedLinks('${guild.id}')">💾 Guardar Links Bloqueados</button>
        </div>
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

    <!-- PERGUNTAS -->
    <div id="perguntas_tab" class="section" style="display:none">
      <div class="section-title"><span>❓</span> Perguntas à Comunidade</div>
      <div class="card">
        <h2>✍️ Nova Pergunta</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Envia uma pergunta para um canal do servidor. O bot publica-a em embed e cria automaticamente um tópico para as pessoas responderem, com um botão "✍️ Deixe aqui as suas respostas!" que leva direto ao tópico.
        </p>
        <form id="form-pergunta">
          <div class="grid-2">
            <div class="form-group">
              <label>Canal</label>
              ${makeSelect('channel_id', channels, '', 'Canal')}
            </div>
          </div>
          <div class="form-group">
            <label>Pergunta</label>
            <textarea name="pergunta" id="pergunta-texto" rows="3" maxlength="2000" placeholder="Escreve aqui a tua pergunta..."></textarea>
          </div>
          <button type="button" class="btn btn-primary" onclick="enviarPerguntaDashboard('${guild.id}')">📤 Enviar Pergunta</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>📜 Histórico</h2>
        ${perguntas.length ? `
          <table class="data-table">
            <thead><tr><th>Pergunta</th><th>Canal</th><th>Tópico</th><th>Data</th><th></th></tr></thead>
            <tbody>
              ${perguntas.map(p => {
                const canalP = channels.find(c => c.id === p.channel_id);
                const linkTopico = p.thread_id ? `https://discord.com/channels/${guild.id}/${p.thread_id}` : null;
                return `
                <tr>
                  <td style="max-width:320px">${p.pergunta.length > 120 ? p.pergunta.slice(0,117) + '...' : p.pergunta}</td>
                  <td>#${canalP ? canalP.name : '?'}</td>
                  <td>${linkTopico ? `<a href="${linkTopico}" target="_blank" rel="noopener">Abrir tópico ↗</a>` : '—'}</td>
                  <td style="font-size:0.8rem;color:var(--text2)">${new Date(p.created_at).toLocaleString('pt-PT')}</td>
                  <td><button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="removePergunta('${guild.id}', ${p.id})">🗑️</button></td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        ` : `<p style="color:var(--text2)">Ainda não enviaste nenhuma pergunta.</p>`}
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
                <input type="text" name="emoji" placeholder="Emoji, ex: ✅">
                ${makeSelect('cargo', roles, '', 'Cargo')}
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

    <!-- CARGOS -->
    <div id="cargos_tab" class="section" style="display:none">
      <div class="section-title"><span>🎖️</span> Cargos</div>

      <div class="card">
        <h2>🙋 AutoRole — Pessoas</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Cargos atribuídos automaticamente a novos membros humanos que entrarem no servidor. Escolhe um cargo por lista; usa "Adicionar outro cargo" para incluir mais.
        </p>
        <div class="form-group">
          ${makeRolePickerList('autorole_human_roles', roles, autoroleHumanos)}
        </div>
        <button type="button" class="btn btn-primary" onclick="saveAutoRole('${guild.id}', 'human')">💾 Guardar AutoRole de Pessoas</button>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🤖 AutoRole — Bots</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Cargos atribuídos automaticamente a bots que forem adicionados ao servidor.
        </p>
        <div class="form-group">
          ${makeRolePickerList('autorole_bot_roles', roles, autoroleBots)}
        </div>
        <button type="button" class="btn btn-primary" onclick="saveAutoRole('${guild.id}', 'bot')">💾 Guardar AutoRole de Bots</button>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🔄 Exclusividade de Cargos</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Configura: quando alguém <strong>recebe</strong> um dos cargos à esquerda, o bot remove automaticamente o(s) cargo(s) da direita (se a pessoa os tiver) — mesmo quem já os tinha antes de a regra existir. Usa "Adicionar outro cargo" para incluir mais cargos em cada lista (cria uma regra para cada combinação ganho×perdido). Funciona em tempo real, seja qual for o motivo do cargo ter sido atribuído.
        </p>
        <form id="form-exclusividade">
          <div class="grid-2">
            <div class="form-group">
              <label>Ao receber estes cargos…</label>
              ${makeRolePickerList('gain_role_ids', roles, [])}
            </div>
            <div class="form-group">
              <label>…perde estes cargos</label>
              ${makeRolePickerList('lose_role_ids', roles, [])}
            </div>
          </div>
          <button type="button" class="btn btn-primary" onclick="addExclusividade('${guild.id}')">➕ Adicionar Regra(s)</button>
        </form>

        <div style="margin-top:20px">
          ${roleExclusivity.length ? `
            <table class="data-table">
              <thead><tr><th>Ao receber</th><th>Perde</th><th></th></tr></thead>
              <tbody>
                ${roleExclusivity.map(r => `
                  <tr>
                    <td>${roles.find(x=>x.id===r.gain_role_id)?.name || r.gain_role_id}</td>
                    <td>${roles.find(x=>x.id===r.lose_role_id)?.name || r.lose_role_id}</td>
                    <td><button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="removeExclusividade('${guild.id}', ${r.id})">🗑️</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<p style="color:var(--text2)">Ainda não há regras de exclusividade configuradas.</p>`}
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
          <strong>ℹ️ Como funciona:</strong> escolhe abaixo quais canais queres mostrar e ativa. Os canais mostram as contagens no próprio nome, atualizados a cada 5 minutos. Ao desativar, os canais criados são apagados automaticamente.
        </div>

        <div class="form-group">
          <label>Canais a mostrar</label>
          <div style="display:flex;flex-direction:column;gap:4px;border:1px solid var(--border,#444);border-radius:8px;padding:8px">
            <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:6px" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
              <input type="checkbox" id="stats-show-members" ${statsConfig?.show_members !== 0 ? 'checked' : ''} style="cursor:pointer"><span>👥 Membros</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:6px" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
              <input type="checkbox" id="stats-show-bots" ${statsConfig?.show_bots !== 0 ? 'checked' : ''} style="cursor:pointer"><span>🤖 Bots</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:6px" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
              <input type="checkbox" id="stats-show-channels" ${statsConfig?.show_channels !== 0 ? 'checked' : ''} style="cursor:pointer"><span>📢 Canais</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:6px" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
              <input type="checkbox" id="stats-show-roles" ${statsConfig?.show_roles !== 0 ? 'checked' : ''} style="cursor:pointer"><span>🎭 Cargos</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:6px" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
              <input type="checkbox" id="stats-show-boosts" ${statsConfig?.show_boosts !== 0 ? 'checked' : ''} style="cursor:pointer"><span>🚀 Boosts</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="toggle">
            <input type="checkbox" id="stats-show-emoji" ${statsConfig?.show_emoji !== 0 ? 'checked' : ''}>
            <span>Mostrar emoji no nome do canal (ex: "👥 Membros: 10" em vez de "Membros: 10")</span>
          </label>
        </div>

        <div class="grid-2">
          <button type="button" class="btn btn-primary" onclick="saveStatsConfig('${guild.id}', true)">✅ Ativar / Guardar e Criar Canais</button>
          <button type="button" class="btn btn-danger" onclick="saveStatsConfig('${guild.id}', false)">⛔ Desativar (apaga os canais)</button>
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
    const ALL_ROLES = ${JSON.stringify(roles.map(r => ({ id: r.id, name: r.name })))};
    ${dashboardJS}

    const SECTION_STORAGE_KEY = 'dashboard_section_' + GUILD_ID;

    function showSection(id, evt) {
      document.querySelectorAll('.section').forEach(s => s.style.display='none');
      document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
      const section = document.getElementById(id);
      if(section) section.style.display='block';
      const clicked = (evt && evt.target) ? evt.target : (typeof event !== 'undefined' && event ? event.target : null);
      if (clicked) {
        clicked.classList.add('active');
      } else {
        const btn = [...document.querySelectorAll('.sidebar-item')].find(b => b.getAttribute('onclick').includes("'" + id + "'"));
        if (btn) btn.classList.add('active');
      }
      try { localStorage.setItem(SECTION_STORAGE_KEY, id); } catch(e) {}
      if(id==='overview') loadOverviewData();
      if(id==='ratings') loadRatings();
      if(id==='suggestions_tab') loadSuggestions();
    }

    function restoreSection() {
      let saved = null;
      try { saved = localStorage.getItem(SECTION_STORAGE_KEY); } catch(e) {}
      if (saved && document.getElementById(saved)) {
        showSection(saved, null);
      } else {
        loadOverviewData();
      }
    }

    async function saveBotIdentity(guildId) {
      const body = {
        bot_nickname: document.getElementById('bot_nickname').value,
      };
      try {
        const r = await fetch('/api/'+guildId+'/bot-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Guardado!' : 'Erro ao guardar.'), data.ok ? 'success' : 'error');
        if (data.ok) setTimeout(() => location.reload(), 1200);
      } catch (e) {
        toast('❌ Erro de ligação ao guardar identidade do bot.', 'error');
      }
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

    // Carrega dados iniciais, restaurando a ultima seccao visitada (se houver)
    restoreSection();
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
