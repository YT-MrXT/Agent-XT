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
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  InteractionType,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder,
  RoleSelectMenuBuilder,
  UserSelectMenuBuilder,
  ActivityType,
  WebhookClient
} = require('discord.js');
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// ============================
// ⚙️ CONFIGURAÇÃO PRINCIPAL
// ============================
// 🔴 COLOCA O TEU TOKEN AQUI (ou usa variáveis de ambiente)
const CONFIG = {
  TOKEN: process.env.TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  // GUILD_ID removido → comandos globais (funcionam em todos os servidores)
  CLIENT_SECRET: process.env.CLIENT_SECRET,
  DASHBOARD_PORT: process.env.PORT || 3000,
  // URL do teu dashboard (Render, etc.)
  REDIRECT_URI: process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback',
  SESSION_SECRET: process.env.SESSION_SECRET || 'segredo_super_secreto_muda_isto',
  // Prefixo de comandos legados (opcional)
  PREFIX: '!',
  // Cor padrão dos embeds
  COR_PRINCIPAL: '#5865F2',
  COR_SUCESSO: '#57F287',
  COR_ERRO: '#ED4245',
  COR_AVISO: '#FEE75C',
  // 🔧 Dashboard web (Express): desativado por defeito para poupar RAM.
  // Põe DASHBOARD_ATIVO=true nas variáveis de ambiente se quiseres voltar a ligá-lo.
  DASHBOARD_ATIVO: process.env.DASHBOARD_ATIVO === 'true',
  // 🤖 Identidade global do bot (nome apresentado no dashboard + avatar por defeito)
  BOT_NAME: process.env.BOT_NAME || 'Nexo XT',
  BOT_AVATAR_URL: process.env.BOT_AVATAR_URL || 'https://raw.githubusercontent.com/YT-MrXT/Agent-XT/main/xt_logo_v8.png'
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
// BASE DE DADOS — Turso (libSQL), na cloud
// ============================
// 🟢 A configuração fica persistida remotamente na tua base de dados Turso,
// por isso já não depende do disco do Render (que é apagado a cada deploy/restart).
// Define TURSO_DATABASE_URL e TURSO_AUTH_TOKEN nas Environment Variables do Render.
const db = require('./db.js');
console.log('📦 Base de dados Turso (libSQL) ligada.');

// ============================
// INICIALIZAÇÃO DAS TABELAS
// ============================
async function initDatabase() {
  // Tabela de configuração geral do servidor
  await db.exec(`
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
    const gcCols = await db.prepare("PRAGMA table_info(guild_config)").all();
    if (!gcCols.some(c => c.name === 'bot_nickname')) await db.exec('ALTER TABLE guild_config ADD COLUMN bot_nickname TEXT');
    if (!gcCols.some(c => c.name === 'bot_avatar_url')) await db.exec('ALTER TABLE guild_config ADD COLUMN bot_avatar_url TEXT');
    if (!gcCols.some(c => c.name === 'bot_webhook_name')) await db.exec('ALTER TABLE guild_config ADD COLUMN bot_webhook_name TEXT');
    if (!gcCols.some(c => c.name === 'immune_roles')) await db.exec("ALTER TABLE guild_config ADD COLUMN immune_roles TEXT DEFAULT '[]'");
    if (!gcCols.some(c => c.name === 'immune_admins')) await db.exec('ALTER TABLE guild_config ADD COLUMN immune_admins INTEGER DEFAULT 0');
    if (!gcCols.some(c => c.name === 'welcome_title')) await db.exec('ALTER TABLE guild_config ADD COLUMN welcome_title TEXT');
    if (!gcCols.some(c => c.name === 'welcome_image')) await db.exec('ALTER TABLE guild_config ADD COLUMN welcome_image TEXT');
    // Novos campos do editor avançado de embeds de boas-vindas (estilo Sapphire)
    if (!gcCols.some(c => c.name === 'welcome_color')) await db.exec("ALTER TABLE guild_config ADD COLUMN welcome_color TEXT DEFAULT '#5865F2'");
    if (!gcCols.some(c => c.name === 'welcome_author_name')) await db.exec('ALTER TABLE guild_config ADD COLUMN welcome_author_name TEXT');
    if (!gcCols.some(c => c.name === 'welcome_author_icon')) await db.exec('ALTER TABLE guild_config ADD COLUMN welcome_author_icon TEXT');
    if (!gcCols.some(c => c.name === 'welcome_thumbnail')) await db.exec('ALTER TABLE guild_config ADD COLUMN welcome_thumbnail TEXT');
    if (!gcCols.some(c => c.name === 'welcome_footer')) await db.exec('ALTER TABLE guild_config ADD COLUMN welcome_footer TEXT');
    if (!gcCols.some(c => c.name === 'welcome_image_pos')) await db.exec("ALTER TABLE guild_config ADD COLUMN welcome_image_pos TEXT DEFAULT 'bottom'"); // bottom | thumbnail(direita) | none
    if (!gcCols.some(c => c.name === 'welcome_content')) await db.exec('ALTER TABLE guild_config ADD COLUMN welcome_content TEXT'); // texto fora da embed (ex: ${usermention} bem-vindo a ${guildname})
    if (!gcCols.some(c => c.name === 'welcome_url')) await db.exec('ALTER TABLE guild_config ADD COLUMN welcome_url TEXT'); // link do título
    if (!gcCols.some(c => c.name === 'log_types')) await db.exec('ALTER TABLE guild_config ADD COLUMN log_types TEXT');
    if (!gcCols.some(c => c.name === 'mod_log_types')) await db.exec('ALTER TABLE guild_config ADD COLUMN mod_log_types TEXT');
  } catch (e) {
    console.error('❌ Erro na migração de guild_config (identidade do bot):', e.message);
  }

  // Tabela de tickets
  await db.exec(`
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
      enabled           INTEGER DEFAULT 1,
      panel_mode        TEXT DEFAULT 'select',
      panel_color       TEXT DEFAULT '#5865F2'
    );
  `);
  // Migração: garante colunas panel_mode / panel_color em bases de dados já existentes
  try {
    const tcCols = (await db.prepare("PRAGMA table_info(ticket_config)").all()).map(c => c.name);
    if (!tcCols.includes('panel_mode')) await db.exec("ALTER TABLE ticket_config ADD COLUMN panel_mode TEXT DEFAULT 'select'");
    if (!tcCols.includes('panel_color')) await db.exec("ALTER TABLE ticket_config ADD COLUMN panel_color TEXT DEFAULT '#5865F2'");
  } catch (e) {
    console.error('❌ Erro na migração de ticket_config (panel_mode/panel_color):', e.message);
  }

  // Tipos de ticket (select menu)
  await db.exec(`
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
    const cols = await db.prepare("PRAGMA table_info(ticket_types)").all();
    if (!cols.some(c => c.name === 'has_form')) {
      await db.exec('ALTER TABLE ticket_types ADD COLUMN has_form INTEGER DEFAULT 0');
    }
  } catch (e) {
    console.error('❌ Erro na migração de ticket_types.has_form:', e.message);
  }

  // Perguntas do formulário de cada tipo de ticket
  await db.exec(`
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
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_form_answers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   INTEGER NOT NULL,
      question    TEXT NOT NULL,
      answer      TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tickets abertos
  await db.exec(`
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
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_users (
      ticket_id  INTEGER,
      user_id    TEXT,
      added_by   TEXT,
      added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (ticket_id, user_id)
    );
  `);

  // Avaliações de staff
  await db.exec(`
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
  await db.exec(`
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
    const cols = (await db.prepare("PRAGMA table_info(server_stats)").all()).map(c => c.name);
    const novasColunas = [['show_emoji', 'INTEGER DEFAULT 1'], ['show_members', 'INTEGER DEFAULT 1'], ['show_bots', 'INTEGER DEFAULT 1'], ['show_channels', 'INTEGER DEFAULT 1'], ['show_roles', 'INTEGER DEFAULT 1'], ['show_boosts', 'INTEGER DEFAULT 1']];
    for (const [nome, tipo] of novasColunas) {
      if (!cols.includes(nome)) {
        await db.exec(`ALTER TABLE server_stats ADD COLUMN ${nome} ${tipo}`);
      }
    }
  } catch (e) {
    console.error('❌ Erro na migração da tabela server_stats:', e.message);
  }

  // Reaction Roles
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
    const cols = await db.prepare("PRAGMA table_info(blacklist)").all();
    const userIdCol = cols.find(c => c.name === 'user_id');
    const usernameCol = cols.find(c => c.name === 'username');
    const precisaMigrar = userIdCol && userIdCol.notnull === 1 || usernameCol && usernameCol.notnull === 0;
    if (precisaMigrar) {
      await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
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
  await db.exec(`
    CREATE TABLE IF NOT EXISTS suggestion_votes (
      suggestion_id INTEGER,
      user_id       TEXT,
      vote          TEXT,
      PRIMARY KEY(suggestion_id, user_id)
    );
  `);

  // Tipos de Sugestão (ex: "Sugestão", "Sugestão de Construção") — cada tipo tem o
  // seu próprio canal, canal de log e cargo a mencionar. Substitui o antigo sistema
  // de "suggestion_config" (que só permitia 1 tipo/canal por servidor).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS suggestion_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      name        TEXT NOT NULL,
      emoji       TEXT,
      channel_id  TEXT NOT NULL,
      log_channel TEXT,
      ping_role   TEXT,
      enabled     INTEGER DEFAULT 1,
      order_num   INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migração: liga cada sugestão já existente ao seu tipo (coluna nova em "suggestions")
  try {
    await db.exec(`ALTER TABLE suggestions ADD COLUMN type_id INTEGER`);
  } catch (_) {}

  // Migração suave: se existir a configuração antiga (1 canal só) e ainda não houver
  // nenhum "suggestion_types", cria automaticamente um tipo "Sugestão" com essa config,
  // para não perderes a tua configuração atual.
  try {
    const configsAntigas = await db.prepare('SELECT * FROM suggestion_config').all();
    for (const cfg of configsAntigas) {
      const jaTem = await db.prepare('SELECT id FROM suggestion_types WHERE guild_id = ?').get(cfg.guild_id);
      if (!jaTem && cfg.channel_id) {
        const info = await db.prepare(`
          INSERT INTO suggestion_types (guild_id, name, emoji, channel_id, log_channel, ping_role, enabled)
          VALUES (?, 'Sugestão', '💡', ?, ?, ?, ?)
        `).run(cfg.guild_id, cfg.channel_id, cfg.log_channel || null, cfg.ping_role || null, cfg.enabled ?? 1);
        // Liga as sugestões antigas desse servidor (sem type_id) a este novo tipo
        await db.prepare('UPDATE suggestions SET type_id = ? WHERE guild_id = ? AND type_id IS NULL').run(info.lastInsertRowid, cfg.guild_id);
      }
    }
  } catch (e) {
    console.error('❌ Erro na migração de suggestion_config → suggestion_types:', e.message);
  }

  // Config de sugestões (obsoleta — mantida só para não partir migrações antigas)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS suggestion_config (
      guild_id   TEXT PRIMARY KEY,
      channel_id TEXT,
      log_channel TEXT,
      enabled    INTEGER DEFAULT 1,
      ping_role  TEXT
    );
  `);

  // AntiSpam
  await db.exec(`
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
  try {
    await db.exec(`ALTER TABLE antispam_config ADD COLUMN trap_channel TEXT`);
  } catch (_) {}
  try {
    await db.exec(`ALTER TABLE antispam_config ADD COLUMN anti_bot_add INTEGER DEFAULT 0`);
  } catch (_) {}
  try {
    await db.exec(`ALTER TABLE antispam_config ADD COLUMN blocked_words TEXT DEFAULT '[]'`);
  } catch (_) {}
  try {
    await db.exec(`ALTER TABLE antispam_config ADD COLUMN blocked_links TEXT DEFAULT '[]'`);
  } catch (_) {}
  // Lista de canais onde o anti-links/anti-convites se aplica.
  // '[]' (vazio) = aplica-se a TODOS os canais (comportamento antigo, mantido por defeito).
  // Com canais lá dentro = aplica-se APENAS a esses canais específicos.
  try {
    await db.exec(`ALTER TABLE antispam_config ADD COLUMN link_invite_channels TEXT DEFAULT '[]'`);
  } catch (_) {}
  // Canais onde o anti-links/anti-convites NUNCA se aplica (exceções). Estes canais ficam
  // sempre isentos, mesmo que "link_invite_channels" esteja vazio (modo "todos os canais")
  // ou os inclua explicitamente — a exclusão tem sempre prioridade.
  try {
    await db.exec(`ALTER TABLE antispam_config ADD COLUMN link_invite_excluded_channels TEXT DEFAULT '[]'`);
  } catch (_) {}

  // Migração suave: número da sugestão específico de cada servidor (para não "saltarem" IDs entre servidores)
  try {
    await db.exec(`ALTER TABLE suggestions ADD COLUMN guild_seq INTEGER`);
  } catch (_) {}
  // Preenche guild_seq para sugestões antigas que ainda não o têm, servidor a servidor
  try {
    const guildsComSugestoes = await db.prepare(`SELECT DISTINCT guild_id FROM suggestions WHERE guild_seq IS NULL`).all();
    for (const {
      guild_id
    } of guildsComSugestoes) {
      const antigas = await db.prepare(`SELECT id FROM suggestions WHERE guild_id = ? ORDER BY id ASC`).all(guild_id);
      antigas.forEach(async (row, idx) => {
        await db.prepare(`UPDATE suggestions SET guild_seq = ? WHERE id = ?`).run(idx + 1, row.id);
      });
    }
  } catch (_) {}

  // Embeds guardados
  await db.exec(`
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
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_channel TEXT`);
  } catch (_) {}
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_interval_minutes INTEGER`);
  } catch (_) {}
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_active INTEGER DEFAULT 0`);
  } catch (_) {}
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_next_send DATETIME`);
  } catch (_) {}
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_quantity INTEGER DEFAULT 1`);
  } catch (_) {}
  // Envio diário a horas fixas (até 5 horários "HH:MM" separados por vírgula, ex: "08:00,13:30,20:00")
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_daily_times TEXT`);
  } catch (_) {}
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_daily_active INTEGER DEFAULT 0`);
  } catch (_) {}
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_daily_channel TEXT`);
  } catch (_) {}
  // Guarda "YYYY-MM-DD HH:MM" do último envio diário feito para cada horário, para não repetir no mesmo minuto/dia
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN schedule_daily_last_sent TEXT DEFAULT '{}'`);
  } catch (_) {}
  // Comando personalizado (ex: "abrirservidor") que, quando usado com o prefixo do servidor
  // (ex: +abrirservidor), envia esta embed guardada no canal onde o comando foi escrito.
  // Válido apenas no servidor onde foi configurado (guild_id + trigger_command são únicos por servidor).
  try {
    await db.exec(`ALTER TABLE saved_embeds ADD COLUMN trigger_command TEXT`);
  } catch (_) {}
  try {
    await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_embeds_trigger ON saved_embeds(guild_id, trigger_command)`);
  } catch (_) {}

  // Corrige agendamentos ativos gravados no formato ISO (bug antigo: new Date().toISOString()
  // não é comparável com datetime('now') do SQLite) — recalcula usando o formato correto.
  try {
    const comBugPotencial = await db.prepare(`SELECT id, schedule_interval_minutes FROM saved_embeds WHERE schedule_active = 1 AND schedule_next_send LIKE '%T%'`).all();
    for (const row of comBugPotencial) {
      await db.prepare(`UPDATE saved_embeds SET schedule_next_send = datetime('now', '+' || ? || ' minutes') WHERE id = ?`).run(row.schedule_interval_minutes || 60, row.id);
    }
    if (comBugPotencial.length) console.log(`✅ Corrigidos ${comBugPotencial.length} agendamento(s) de embed com formato de data inválido.`);
  } catch (_) {}

  // Sessões do dashboard
  await db.exec(`
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
  await db.exec(`
    CREATE TABLE IF NOT EXISTS autorole_config (
      guild_id     TEXT NOT NULL,
      role_id      TEXT NOT NULL,
      target       TEXT NOT NULL DEFAULT 'human', -- 'human' ou 'bot'
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, role_id, target)
    );
  `);

  // Exclusividade de Cargos: quem ganha 'gain_role_id' perde 'lose_role_id'
  await db.exec(`
    CREATE TABLE IF NOT EXISTS role_exclusivity (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      gain_role_id TEXT NOT NULL,
      lose_role_id TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, gain_role_id, lose_role_id)
    );
  `);

  // Mensagens de Boas-vindas (multi, nomeadas — estilo Sapphire). Cada linha é uma
  // mensagem/embed de boas-vindas independente, com o seu próprio nome, canal e
  // conteúdo. Só uma pode estar "ativa" (is_active) por servidor — é essa que é
  // enviada quando um membro entra.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS welcome_messages (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id           TEXT NOT NULL,
      name               TEXT NOT NULL,
      is_active          INTEGER DEFAULT 0,
      welcome_channel    TEXT,
      autorole           TEXT,
      welcome_embed      INTEGER DEFAULT 1,
      welcome_content    TEXT,
      welcome_title      TEXT,
      welcome_url        TEXT,
      welcome_msg        TEXT,
      welcome_color      TEXT DEFAULT '#5865F2',
      welcome_author_name TEXT,
      welcome_author_icon TEXT,
      welcome_image_pos  TEXT DEFAULT 'bottom',
      welcome_image      TEXT,
      welcome_thumbnail  TEXT,
      welcome_footer     TEXT,
      created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Migração: se já existir configuração de boas-vindas antiga (guild_config) e
  // ainda não houver nenhuma linha em welcome_messages para essa guild, converte-a
  // automaticamente na primeira mensagem da lista (marcada como ativa), para não
  // se perder o que já estava configurado.
  try {
    const guildsComWelcomeAntigo = await db.prepare(`
      SELECT * FROM guild_config
      WHERE (welcome_channel IS NOT NULL AND welcome_channel != '')
         OR (welcome_msg IS NOT NULL AND welcome_msg != '')
    `).all();
    const insertWelcomeMsg = db.prepare(`
      INSERT INTO welcome_messages (
        guild_id, name, is_active, welcome_channel, autorole, welcome_embed,
        welcome_content, welcome_title, welcome_url, welcome_msg, welcome_color,
        welcome_author_name, welcome_author_icon, welcome_image_pos, welcome_image,
        welcome_thumbnail, welcome_footer
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const gc of guildsComWelcomeAntigo) {
      const jaTem = await db.prepare('SELECT id FROM welcome_messages WHERE guild_id = ?').get(gc.guild_id);
      if (jaTem) continue;
      await insertWelcomeMsg.run(gc.guild_id, 'Boas-vindas', gc.welcome_channel || null, gc.autorole || null, gc.welcome_embed ?? 1, gc.welcome_content || null, gc.welcome_title || null, gc.welcome_url || null, gc.welcome_msg || null, gc.welcome_color || '#5865F2', gc.welcome_author_name || null, gc.welcome_author_icon || null, gc.welcome_image_pos || 'bottom', gc.welcome_image || null, gc.welcome_thumbnail || null, gc.welcome_footer || null);
    }
  } catch (e) {
    console.error('❌ Erro na migração de welcome_messages:', e.message);
  }

  // Painéis de Informação (ex: "Bem-vindo ao Servidor") — embed configurável pelos
  // admins (título, imagem/banner, thumbnail, cor, descrição, dono, fundado há X) +
  // botões próprios que, ao serem clicados, mostram um texto SÓ para quem clicou.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS info_panels (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      name         TEXT NOT NULL,
      title        TEXT,
      description  TEXT,
      color        TEXT DEFAULT '#5865F2',
      banner_url   TEXT,
      thumbnail_url TEXT,
      footer_text  TEXT,
      owner_text   TEXT,
      founded_text TEXT,
      extra_fields TEXT DEFAULT '[]',
      message_id   TEXT,
      channel_id   TEXT,
      published    INTEGER DEFAULT 0,
      created_by   TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Migração: garante a coluna published em bases de dados já existentes
  try {
    const ipCols = (await db.prepare("PRAGMA table_info(info_panels)").all()).map(c => c.name);
    if (!ipCols.includes('published')) {
      await db.exec('ALTER TABLE info_panels ADD COLUMN published INTEGER DEFAULT 0');
      // Painéis já publicados anteriormente (têm message_id) ficam marcados como publicados
      await db.exec("UPDATE info_panels SET published = 1 WHERE message_id IS NOT NULL AND message_id != ''");
    }
  } catch (e) {
    console.error('❌ Erro na migração de info_panels (published):', e.message);
  }

  // Botões de cada painel de informação. A resposta pode ser só texto, ou um
  // mini-embed (título/imagem/thumbnail/cor) — sempre ephemeral (só quem clicou vê).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS info_panel_buttons (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id       INTEGER NOT NULL,
      label          TEXT NOT NULL,
      emoji          TEXT,
      style          TEXT DEFAULT 'Primary', -- Primary, Secondary, Success, Danger
      response_text  TEXT NOT NULL,
      response_title TEXT,
      response_image TEXT,
      response_thumbnail TEXT,
      response_color TEXT,
      order_num      INTEGER DEFAULT 0,
      FOREIGN KEY (panel_id) REFERENCES info_panels(id) ON DELETE CASCADE
    );
  `);
  // Migração suave para bases de dados já existentes
  try {
    const ipbCols = (await db.prepare("PRAGMA table_info(info_panel_buttons)").all()).map(c => c.name);
    if (!ipbCols.includes('response_title')) await db.exec('ALTER TABLE info_panel_buttons ADD COLUMN response_title TEXT');
    if (!ipbCols.includes('response_image')) await db.exec('ALTER TABLE info_panel_buttons ADD COLUMN response_image TEXT');
    if (!ipbCols.includes('response_thumbnail')) await db.exec('ALTER TABLE info_panel_buttons ADD COLUMN response_thumbnail TEXT');
    if (!ipbCols.includes('response_color')) await db.exec('ALTER TABLE info_panel_buttons ADD COLUMN response_color TEXT');
  } catch (e) {
    console.error('❌ Erro na migração de info_panel_buttons:', e.message);
  }

  // Perguntas à comunidade (cria embed + tópico/thread com botão de resposta)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS perguntas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id     TEXT NOT NULL,
      channel_id   TEXT NOT NULL,
      message_id   TEXT,
      thread_id    TEXT,
      pergunta     TEXT NOT NULL,
      mensagem_extra TEXT,
      created_by   TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Migração: garante a coluna mensagem_extra em bases de dados já existentes
  try {
    const pCols = (await db.prepare("PRAGMA table_info(perguntas)").all()).map(c => c.name);
    if (!pCols.includes('mensagem_extra')) await db.exec('ALTER TABLE perguntas ADD COLUMN mensagem_extra TEXT');
  } catch (e) {
    console.error('❌ Erro na migração de perguntas.mensagem_extra:', e.message);
  }

  // Votações
  await db.exec(`
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
  const votacaoCols = (await db.prepare("PRAGMA table_info(votacao_config)").all()).map(c => c.name);
  if (!votacaoCols.includes('tipo')) await db.exec("ALTER TABLE votacao_config ADD COLUMN tipo TEXT NOT NULL DEFAULT 'recorrente'");
  if (!votacaoCols.includes('data_fim')) await db.exec("ALTER TABLE votacao_config ADD COLUMN data_fim TEXT");

  // Votos do dia (reiniciados a cada nova votação diária)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS votacao_votos (
      guild_id   TEXT NOT NULL,
      data       TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      opcao      TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, data, user_id)
    );
  `);

  // ── Giveaways ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      TEXT NOT NULL,
      channel_id    TEXT NOT NULL,
      message_id    TEXT,
      titulo        TEXT,
      descricao     TEXT,
      imagem_url    TEXT,
      mensagem_extra TEXT,
      premio        TEXT NOT NULL,
      vencedores    INTEGER NOT NULL DEFAULT 1,
      ends_at       DATETIME NOT NULL,
      ended         INTEGER DEFAULT 0,
      host_id       TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Migração: garante colunas novas de personalização em bases de dados já existentes
  try {
    const gwCols = (await db.prepare("PRAGMA table_info(giveaways)").all()).map(c => c.name);
    if (!gwCols.includes('titulo')) await db.exec('ALTER TABLE giveaways ADD COLUMN titulo TEXT');
    if (!gwCols.includes('descricao')) await db.exec('ALTER TABLE giveaways ADD COLUMN descricao TEXT');
    if (!gwCols.includes('imagem_url')) await db.exec('ALTER TABLE giveaways ADD COLUMN imagem_url TEXT');
    if (!gwCols.includes('mensagem_extra')) await db.exec('ALTER TABLE giveaways ADD COLUMN mensagem_extra TEXT');
  } catch (e) {
    console.error('❌ Erro na migração de giveaways (titulo/descricao/imagem_url/mensagem_extra):', e.message);
  }
  await db.exec(`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      giveaway_id INTEGER NOT NULL,
      user_id     TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (giveaway_id, user_id)
    );
  `);
  console.log('✅ Todas as tabelas criadas/verificadas com sucesso.');
}
// Promessa que só resolve quando a BD Turso estiver pronta.
// O login no Discord e o arranque do dashboard esperam por isto (ver fundo do ficheiro).
const dbReadyPromise = initDatabase().catch(err => {
  console.error('❌ Erro fatal ao inicializar a base de dados Turso:', err);
  process.exit(1);
});

// ============================
// CLIENTE DISCORD
// ============================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildEmojisAndStickers],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User]
});

// Coleção de comandos
client.commands = new Collection();

// Map para anti-spam em memória
const spamMap = new Map();
// Map para raid detection
const joinMap = new Map();

// ============================
// FUNÇÕES UTILITÁRIAS
// ============================

/** Retorna um embed padrão com cor e rodapé */
/**
 * Vai buscar ao audit log de um servidor quem foi o responsável por uma ação recente
 * sobre um alvo específico (ex: quem criou/editou/apagou um canal ou cargo).
 * Devolve o User executor, ou null se não conseguir determinar (falta de permissão,
 * ação demasiado antiga, ou log não disponível).
 */
/**
 * Vai ao registo de auditoria do Discord tentar identificar quem executou uma
 * ação (ex: quem apagou um canal, quem baniu alguém). Como o Discord não diz
 * "quem fez isto" diretamente nos eventos normais (ChannelDelete, RoleDelete,
 * etc.), é preciso ir procurar a entrada correspondente no audit log.
 *
 * Devolve sempre um objeto { executor, motivo } em vez de só `null`, para que
 * quem usa esta função saiba SEMPRE explicar ao staff porque é que não sabe
 * quem foi (em vez de simplesmente not showing the field, o que dá a
 * sensação de log incompleto/avariado).
 *
 * motivo possíveis quando executor === null:
 *  - 'sem_permissao'   → falta ao bot a permissão "Ver Registo de Auditoria"
 *  - 'nao_encontrado'  → o bot tem permissão mas não achou nenhuma entrada
 *                         correspondente dentro da janela de tempo (pode ser
 *                         atraso do Discord a publicar o audit log, ou a ação
 *                         não gerou entrada de audit log por algum motivo)
 *  - 'erro'            → outro erro inesperado (rede, rate limit, etc.)
 */
async function obterExecutorAuditLog(guild, tipo, targetId, janelaMs = 15000) {
  let audit;
  try {
    audit = await guild.fetchAuditLogs({
      type: tipo,
      limit: 5
    });
  } catch (e) {
    // Erro mais comum aqui: falta a permissão "Ver Registo de Auditoria" ao bot.
    const semPermissao = e?.code === 50013 || /missing permissions/i.test(e?.message || '');
    return {
      executor: null,
      motivo: semPermissao ? 'sem_permissao' : 'erro'
    };
  }
  const entry = audit.entries.find(e => (e.target?.id === targetId || e.targetId === targetId) && Date.now() - e.createdTimestamp < janelaMs);
  if (!entry?.executor) return {
    executor: null,
    motivo: 'nao_encontrado'
  };
  return {
    executor: entry.executor,
    motivo: null
  };
}

/** Texto amigável para explicar, no embed, porque não foi possível identificar o responsável. */
function motivoExecutorDesconhecidoTexto(motivo) {
  switch (motivo) {
    case 'sem_permissao':
      return '⚠️ Não foi possível identificar quem — falta ao bot a permissão **"Ver Registo de Auditoria"** neste servidor.';
    case 'nao_encontrado':
      return '⚠️ Não foi possível identificar quem — o Discord ainda não publicou o registo de auditoria desta ação (tenta novamente daqui a alguns segundos) ou a ação não ficou registada.';
    case 'erro':
      return '⚠️ Não foi possível identificar quem — ocorreu um erro ao consultar o registo de auditoria do Discord.';
    default:
      return '⚠️ Não foi possível identificar quem executou esta ação.';
  }
}
function embedPadrao(titulo, descricao, cor = CONFIG.COR_PRINCIPAL) {
  return new EmbedBuilder().setTitle(titulo).setDescription(descricao).setColor(cor).setTimestamp().setFooter({
    text: 'Discord Bot PT'
  });
}

/**
 * Constrói um embed de log de moderação mais completo e consistente.
 * Em vez de só "Utilizador / Moderador / Motivo" em texto corrido, usa campos (fields)
 * próprios, mostra o avatar do alvo (thumbnail), o link/menção do canal onde a ação
 * aconteceu (quando aplicável) e um footer com os IDs de ambos, para facilitar auditoria.
 *
 * @param {object} opts
 * @param {string} opts.titulo       - Título do embed (ex: '🔨 Utilizador Banido')
 * @param {string} opts.cor          - Cor do embed (ex: CONFIG.COR_ERRO)
 * @param {import('discord.js').User|import('discord.js').GuildMember} [opts.alvo]      - Utilizador/membro alvo da ação
 * @param {string} [opts.alvoIdManual]  - ID do alvo, para quando não há objeto User (ex: já saiu do servidor)
 * @param {import('discord.js').User|import('discord.js').GuildMember} [opts.moderador] - Quem executou a ação
 * @param {string} [opts.motivoDesconhecido] - Se moderador não foi encontrado, motivo devolvido por obterExecutorAuditLog ('sem_permissao'|'nao_encontrado'|'erro')
 * @param {string} [opts.motivo]     - Motivo da ação
 * @param {string} [opts.duracao]    - Duração (para timeouts, etc.)
 * @param {import('discord.js').GuildChannel|import('discord.js').ThreadChannel} [opts.canal] - Canal onde a ação ocorreu
 * @param {string} [opts.linkMensagem] - URL de uma mensagem relevante (ex: a mensagem apagada/editada)
 * @param {Array<{name:string,value:string,inline?:boolean}>} [opts.camposExtra] - Campos adicionais específicos da ação
 * @param {string} [opts.descricaoExtra] - Texto livre adicional, mostrado por cima dos campos
 */
function embedLogModeracao(opts) {
  const {
    titulo,
    cor = CONFIG.COR_PRINCIPAL,
    alvo,
    alvoIdManual,
    moderador,
    motivoDesconhecido,
    motivo,
    duracao,
    canal,
    linkMensagem,
    camposExtra,
    descricaoExtra
  } = opts;
  const alvoUser = alvo?.user || alvo; // aceita tanto GuildMember como User
  const alvoId = alvoUser?.id || alvoIdManual || null;
  const alvoTag = alvoUser?.tag || null;
  const modUser = moderador?.user || moderador;
  const embed = new EmbedBuilder().setTitle(titulo).setColor(cor).setTimestamp();
  if (descricaoExtra) embed.setDescription(descricaoExtra);
  if (alvoUser?.displayAvatarURL) embed.setThumbnail(alvoUser.displayAvatarURL());
  const campos = [];
  if (alvoId) {
    campos.push({
      name: '👤 Utilizador',
      value: alvoTag ? `<@${alvoId}> (\`${alvoTag}\`)` : `<@${alvoId}> (\`${alvoId}\`)`,
      inline: false
    });
  }
  if (modUser?.id) {
    campos.push({
      name: '🛡️ Moderador Responsável',
      value: `<@${modUser.id}> (\`${modUser.tag || modUser.id}\`)`,
      inline: false
    });
  } else {
    // Em vez de simplesmente omitir o campo (o que parecia um log "incompleto" ou avariado),
    // explica sempre porque é que não foi possível identificar o responsável.
    campos.push({
      name: '🛡️ Moderador Responsável',
      value: motivoExecutorDesconhecidoTexto(motivoDesconhecido),
      inline: false
    });
  }
  if (canal?.id) {
    campos.push({
      name: '📍 Canal',
      value: `<#${canal.id}> (\`#${canal.name || canal.id}\`)`,
      inline: false
    });
  }
  if (duracao) {
    campos.push({
      name: '⏱️ Duração',
      value: duracao,
      inline: true
    });
  }
  if (motivo) {
    campos.push({
      name: '📝 Motivo',
      value: motivo,
      inline: false
    });
  }
  if (linkMensagem) {
    campos.push({
      name: '🔗 Mensagem',
      value: `[Ir para a mensagem](${linkMensagem})`,
      inline: false
    });
  }
  if (Array.isArray(camposExtra)) campos.push(...camposExtra);
  if (campos.length) embed.addFields(campos);
  const footerParts = [];
  if (alvoId) footerParts.push(`Utilizador: ${alvoId}`);
  if (modUser?.id) footerParts.push(`Mod: ${modUser.id}`);
  embed.setFooter({
    text: footerParts.length ? footerParts.join(' • ') : 'Discord Bot PT'
  });
  return embed;
}

/**
 * Gera o HTML da tabela do histórico de perguntas (partilhado entre o
 * render inicial do dashboard e a versão devolvida pela API, para que o
 * dashboard consiga re-renderizar só esta secção sem recarregar a página).
 */
function renderPerguntasHistorico(perguntas, channels, guildId) {
  if (!perguntas.length) return '<p style="color:var(--text2)">Ainda não enviaste nenhuma pergunta.</p>';
  return `
    <table class="data-table">
      <thead><tr><th>Pergunta</th><th>Mensagem extra</th><th>Canal</th><th>Tópico</th><th>Data</th><th></th></tr></thead>
      <tbody>
        ${perguntas.map(p => {
    const canalP = channels.find(c => c.id === p.channel_id);
    const linkTopico = p.thread_id ? `https://discord.com/channels/${guildId}/${p.thread_id}` : null;
    return `
          <tr>
            <td style="max-width:320px">${p.pergunta.length > 120 ? p.pergunta.slice(0, 117) + '...' : p.pergunta}</td>
            <td style="max-width:200px;color:var(--text2)">${p.mensagem_extra ? p.mensagem_extra.length > 60 ? p.mensagem_extra.slice(0, 57) + '...' : p.mensagem_extra : '—'}</td>
            <td>#${canalP ? canalP.name : '?'}</td>
            <td>${linkTopico ? `<a href="${linkTopico}" target="_blank" rel="noopener">Abrir tópico ↗</a>` : '—'}</td>
            <td style="font-size:0.8rem;color:var(--text2)">${new Date(p.created_at).toLocaleString('pt-PT')}</td>
            <td><button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="removePergunta('${guildId}', ${p.id})">🗑️</button></td>
          </tr>
        `;
  }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Envia uma pergunta a um canal de texto: cria a embed da pergunta e cria um
 * tópico (thread) associado para as respostas. O próprio Discord já mostra
 * automaticamente, por baixo da mensagem, o nome do tópico e um botão "Ver
 * tópico" — por isso não é necessário enviar nenhum botão extra.
 * Retorna { ok, message, perguntaId? }.
 */
async function enviarPergunta(guild, canal, texto, criadoPorId, mensagemExtra) {
  if (!canal || canal.type !== ChannelType.GuildText) {
    return {
      ok: false,
      message: 'Canal inválido — escolhe um canal de texto.'
    };
  }
  try {
    const embed = new EmbedBuilder().setTitle('❓ Pergunta à Comunidade').setDescription(texto).setColor(CONFIG.COR_PRINCIPAL).setTimestamp();

    // Mensagem opcional enviada FORA da embed (texto simples, ex: menção a um cargo/@everyone)
    const extra = mensagemExtra && mensagemExtra.trim() ? mensagemExtra.trim() : null;
    const msg = await canal.send({
      content: extra || undefined,
      embeds: [embed]
    });

    // Cria o tópico (thread) associado à mensagem para as pessoas responderem.
    // Nome fixo, conforme pedido — o Discord mostra este nome + botão "Ver tópico"
    // automaticamente por baixo da mensagem original.
    const thread = await msg.startThread({
      name: '✍️ Deixe aqui a sua resposta!',
      autoArchiveDuration: 10080,
      // 7 dias
      reason: 'Tópico de respostas para pergunta à comunidade'
    });
    const info = await db.prepare(`
      INSERT INTO perguntas (guild_id, channel_id, message_id, thread_id, pergunta, mensagem_extra, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(guild.id, canal.id, msg.id, thread.id, texto, extra, criadoPorId || null);
    return {
      ok: true,
      message: 'Pergunta enviada com sucesso.',
      perguntaId: info.lastInsertRowid
    };
  } catch (err) {
    console.error('❌ Erro ao enviar pergunta:', err.message);
    return {
      ok: false,
      message: `Erro ao enviar pergunta: ${err.message}`
    };
  }
}

/** Loga uma ação de moderação */
async function logMod(guildId, action, userId, modId, reason, duration = null) {
  const stmt = db.prepare(`
    INSERT INTO mod_logs (guild_id, action, user_id, mod_id, reason, duration)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  await stmt.run(guildId, action, userId, modId, reason, duration);
}

/** Obtém a configuração do servidor */
async function getGuildConfig(guildId) {
  let config = await db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  if (!config) {
    await db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
    config = await db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  }
  return config;
}

/**
 * Aplica o apelido (nickname) do bot num servidor específico.
 * Isto É suportado nativamente pelo Discord (PATCH /guilds/{id}/members/@me).
 */
async function aplicarNicknameBot(guild, nickname) {
  try {
    if (!guild?.members?.me) return {
      ok: false,
      error: 'Bot não encontrado no servidor.'
    };
    await guild.members.me.setNickname(nickname && nickname.trim() ? nickname.trim() : null);
    return {
      ok: true
    };
  } catch (e) {
    console.error('❌ Erro ao aplicar nickname do bot:', e.message);
    return {
      ok: false,
      error: e.message
    };
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
        reason: 'Webhook criado para identidade personalizada do bot neste servidor'
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
      avatarURL: config.bot_avatar_url || client.user.displayAvatarURL()
    });
  } catch (e) {
    console.error('❌ Erro ao enviar como identidade do bot:', e.message);
    try {
      return channel.send(payload);
    } catch (_) {}
  }
}

/**
 * Lista canónica de tipos de log disponíveis no sistema.
 * Cada tipo tem uma categoria (para organizar na dashboard) e um label amigável.
 * Usado para permitir escolher, por canal (Logs Gerais / Mod Log), que tipos de evento
 * são enviados para cada um.
 */
const LOG_TYPES = {
  // Moderação
  ban: {
    label: '🔨 Bans',
    categoria: 'Moderação'
  },
  unban: {
    label: '✅ Unbans',
    categoria: 'Moderação'
  },
  kick: {
    label: '👢 Expulsões (Kick)',
    categoria: 'Moderação'
  },
  timeout: {
    label: '🔇 Timeouts / Silêncios',
    categoria: 'Moderação'
  },
  warn: {
    label: '⚠️ Avisos (Warn)',
    categoria: 'Moderação'
  },
  blacklist: {
    label: '🚫 Blacklist',
    categoria: 'Moderação'
  },
  clear: {
    label: '🗑️ Limpeza de Mensagens',
    categoria: 'Moderação'
  },
  // Membros
  member_join: {
    label: '📥 Membro Entrou',
    categoria: 'Membros'
  },
  member_leave: {
    label: '📤 Membro Saiu',
    categoria: 'Membros'
  },
  member_role: {
    label: '🎭 Cargos de Membro',
    categoria: 'Membros'
  },
  member_nick: {
    label: '✏️ Apelido Alterado',
    categoria: 'Membros'
  },
  // Servidor
  role_update: {
    label: '🎨 Cargos (Criar/Editar/Apagar)',
    categoria: 'Servidor'
  },
  channel_update: {
    label: '📁 Canais (Criar/Editar/Apagar)',
    categoria: 'Servidor'
  },
  // Mensagens
  message_sent: {
    label: '💬 Mensagens Enviadas',
    categoria: 'Mensagens'
  },
  message_delete: {
    label: '🗑️ Mensagens Apagadas',
    categoria: 'Mensagens'
  },
  message_edit: {
    label: '✏️ Mensagens Editadas',
    categoria: 'Mensagens'
  },
  // Voz
  voice_update: {
    label: '🔊 Atividade de Voz',
    categoria: 'Voz'
  }
};

// Tipos ativos por omissão (se o admin nunca configurou nada, mantém comportamento antigo: tudo ligado)
const LOG_TYPES_DEFAULT = Object.keys(LOG_TYPES);
function parseLogTypes(raw) {
  if (!raw) return null; // null = ainda não configurado -> usa tudo (comportamento antigo)
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
  } catch (_) {}
  return null;
}

/**
 * Envia um log de um determinado `tipo` (chave de LOG_TYPES) para os canais configurados.
 * Cada canal (Logs Gerais e Mod Log) tem a sua própria lista de tipos ativos, escolhida
 * na dashboard. Se a guild nunca configurou a seleção de tipos, mantém-se o comportamento
 * antigo (tudo vai para ambos os canais, exceto mensagens enviadas que só vão para o mod log).
 */
async function sendLogTyped(guild, tipo, embed) {
  try {
    const config = getGuildConfig(guild.id);
    const logTypes = parseLogTypes(config?.log_types);
    const modLogTypes = parseLogTypes(config?.mod_log_types);

    // Comportamento antigo por omissão: log geral recebe tudo exceto 'message_sent'; mod log recebe tudo.
    const allowedLog = logTypes !== null ? logTypes.includes(tipo) : tipo !== 'message_sent';
    const allowedModLog = modLogTypes !== null ? modLogTypes.includes(tipo) : true;
    if (allowedLog && config?.log_channel) {
      const ch = guild.channels.cache.get(config.log_channel);
      if (ch) await ch.send({
        embeds: [embed]
      }).catch(() => {});
    }
    if (allowedModLog && config?.mod_log) {
      const ch = guild.channels.cache.get(config.mod_log);
      if (ch) await ch.send({
        embeds: [embed]
      }).catch(() => {});
    }
  } catch (e) {
    // Silencia erros de log
  }
}

/**
 * Envia log para o canal de logs normais.
 * Regra: TUDO vai para aqui EXCETO mensagens enviadas (MessageCreate).
 * Também espelha automaticamente para o Mod Log (que recebe absolutamente tudo,
 * incluindo mensagens enviadas — essas são adicionadas só via sendModLog direto).
 * @deprecated usar sendLogTyped(guild, tipo, embed) para permitir filtragem por tipo na dashboard.
 */
async function sendLog(guild, embed) {
  try {
    const config = getGuildConfig(guild.id);
    if (config?.log_channel) {
      const ch = guild.channels.cache.get(config.log_channel);
      if (ch) await ch.send({
        embeds: [embed]
      }).catch(() => {});
    }
  } catch (e) {
    // Silencia erros de log
  }
  // Espelha tudo (exceto mensagens enviadas) também no mod log
  await sendLogTyped(guild, 'message_sent', embed);
}

/**
 * Envia log para o Mod Log — canal que recebe TUDO mesmo, incluindo
 * mensagens enviadas (MessageCreate), que não vão para o log normal.
 * @deprecated usar sendLogTyped(guild, tipo, embed) para permitir filtragem por tipo na dashboard.
 */
async function sendModLog(guild, embed) {
  try {
    const config = getGuildConfig(guild.id);
    if (!config?.mod_log) return;
    const ch = guild.channels.cache.get(config.mod_log);
    if (ch) await ch.send({
      embeds: [embed]
    });
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
  const map = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  };
  return v * map[u];
}

/** Gera transcript HTML de um canal de ticket */
async function gerarTranscript(channel) {
  try {
    const messages = await channel.messages.fetch({
      limit: 100
    });
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const linhas = sorted.map(msg => {
      const hora = new Date(msg.createdTimestamp).toLocaleString('pt-PT');
      const anexos = msg.attachments.map(a => `<a href="${a.url}" target="_blank">[Anexo: ${a.name}]</a>`).join(' ');
      const embeds = msg.embeds.length ? `<span style="color:#aaa">[${msg.embeds.length} embed(s)]</span>` : '';
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
  return (text || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\u00C0-\u017F-]/g, '').substring(0, 30) || 'ticket';
}

/** Devolve o ID do cargo de suporte efetivo de um ticket (tipo específico ou o padrão do servidor) */
async function obterCargoSuporteTicket(ticket, ticketConfig) {
  if (!ticket) return ticketConfig?.support_role || null;
  const tipo = ticket.type_id ? await db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(ticket.type_id) : null;
  return tipo?.support_role || ticketConfig?.support_role || null;
}

/** Verifica se o membro faz parte da equipa de admins/suporte autorizada a reclamar tickets */
async function isEquipaAdminTicket(member, guild, ticket) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const ticketConfig = await db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guild.id);
  const cargoId = obterCargoSuporteTicket(ticket, ticketConfig);
  if (cargoId && member.roles.cache.has(cargoId)) return true;
  return false;
}

/** Mapeia uma cor hex para o ButtonStyle mais próximo suportado pelo Discord (Primary/Secondary/Success/Danger) */
function corHexParaButtonStyle(hex) {
  const map = {
    '#5865F2': ButtonStyle.Primary,
    // Blurple
    '#4E5058': ButtonStyle.Secondary,
    // Cinzento
    '#57F287': ButtonStyle.Success,
    // Verde
    '#ED4245': ButtonStyle.Danger // Vermelho
  };
  if (map[(hex || '').toUpperCase()]) return map[hex.toUpperCase()];
  if (!hex) return ButtonStyle.Primary;
  // Aproxima pela distância RGB à cor suportada mais próxima
  const h = hex.replace('#', '');
  if (h.length !== 6) return ButtonStyle.Primary;
  const r = parseInt(h.substr(0, 2), 16),
    g = parseInt(h.substr(2, 2), 16),
    b = parseInt(h.substr(4, 2), 16);
  const palette = [{
    style: ButtonStyle.Primary,
    rgb: [0x58, 0x65, 0xF2]
  }, {
    style: ButtonStyle.Secondary,
    rgb: [0x4E, 0x50, 0x58]
  }, {
    style: ButtonStyle.Success,
    rgb: [0x57, 0xF2, 0x87]
  }, {
    style: ButtonStyle.Danger,
    rgb: [0xED, 0x42, 0x45]
  }];
  let melhor = palette[0],
    melhorDist = Infinity;
  for (const p of palette) {
    const d = (r - p.rgb[0]) ** 2 + (g - p.rgb[1]) ** 2 + (b - p.rgb[2]) ** 2;
    if (d < melhorDist) {
      melhorDist = d;
      melhor = p;
    }
  }
  return melhor.style;
}

/** Monta os componentes (select menu ou linhas de botões) do painel de tickets, consoante o modo configurado */
async function montarComponentesPainelTicket(guildId, ticketConfig) {
  const tipos = await db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num, id').all(guildId);
  const modo = ticketConfig?.panel_mode === 'buttons' ? 'buttons' : 'select';
  if (tipos.length === 0) {
    const btn = new ButtonBuilder().setCustomId('ticket_create_simple').setLabel('🎫 Abrir Ticket').setStyle(ButtonStyle.Primary);
    return [new ActionRowBuilder().addComponents(btn)];
  }
  if (modo === 'buttons') {
    // Até 10 botões (5 por linha, máx. 5 linhas)
    const tiposLimitados = tipos.slice(0, 10);
    const linhas = [];
    for (let i = 0; i < tiposLimitados.length; i += 5) {
      const grupo = tiposLimitados.slice(i, i + 5);
      const row = new ActionRowBuilder().addComponents(grupo.map(t => new ButtonBuilder().setCustomId(`ticket_create_btn_${t.id}`).setLabel((t.label || 'Ticket').substring(0, 80)).setEmoji(t.emoji || '🎫').setStyle(corHexParaButtonStyle(t.color))));
      linhas.push(row);
    }
    return linhas;
  }

  // Modo select menu (até 25 tipos, limite do Discord)
  const menu = new StringSelectMenuBuilder().setCustomId('ticket_create_select').setPlaceholder('Seleciona o tipo de ticket...').addOptions(tipos.slice(0, 25).map(t => ({
    label: t.label,
    description: t.description || `Abrir ticket: ${t.label}`,
    emoji: t.emoji || '🎫',
    value: `tipo_${t.id}`
  })));
  return [new ActionRowBuilder().addComponents(menu)];
}

/** Cria um ticket para o utilizador (respostas: array opcional de { question, answer } do formulário) */
async function criarTicket(guild, user, typeId, interaction, respostas = []) {
  const ticketConfig = await db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guild.id);
  if (!ticketConfig || !ticketConfig.enabled) {
    return {
      erro: 'O sistema de tickets não está configurado neste servidor.'
    };
  }

  // Verifica máximo de tickets
  const abertos = await db.prepare(`
    SELECT COUNT(*) as c FROM tickets
    WHERE guild_id = ? AND user_id = ? AND status = 'open'
  `).get(guild.id, user.id);
  if (abertos.c >= ticketConfig.max_tickets) {
    return {
      erro: `Já tens ${ticketConfig.max_tickets} ticket(s) aberto(s). Por favor fecha um antes de criar outro.`
    };
  }

  // Número do ticket
  const lastTicket = await db.prepare('SELECT MAX(ticket_number) as n FROM tickets WHERE guild_id = ?').get(guild.id);
  const ticketNum = (lastTicket.n || 0) + 1;

  // Tipo de ticket
  const tipo = typeId ? await db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(typeId) : null;
  const categoryId = tipo?.category_id || ticketConfig.category_id;

  // Permissões do canal
  const permOverwrites = [{
    id: guild.id,
    deny: [PermissionFlagsBits.ViewChannel]
  }, {
    id: user.id,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
  }];
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
    topic: `Ticket de ${user.tag} | #${ticketNum}`
  });

  // Guarda na BD
  const stmt = db.prepare(`
    INSERT INTO tickets (guild_id, channel_id, user_id, type_id, ticket_number, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `);
  const info = await stmt.run(guild.id, channel.id, user.id, typeId || null, ticketNum);
  const ticketId = info.lastInsertRowid;

  // Mensagem de boas-vindas
  const welcomeMsg = (ticketConfig.welcome_msg || 'Olá {user}! O teu ticket foi criado.').replace('{user}', `<@${user.id}>`).replace('{ticket}', ticketNum);
  const embed = new EmbedBuilder().setTitle(`🎫 Ticket #${String(ticketNum).padStart(4, '0')}`).setDescription(welcomeMsg).setColor(CONFIG.COR_PRINCIPAL).addFields({
    name: '👤 Utilizador',
    value: `<@${user.id}>`,
    inline: true
  }, {
    name: '📋 Tipo',
    value: tipo?.label || 'Geral',
    inline: true
  }, {
    name: '📅 Data',
    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
    inline: true
  }).setThumbnail(user.displayAvatarURL({
    dynamic: true
  })).setTimestamp();

  // Botões do ticket
  const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_claim').setLabel('🙋 Reclamar').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('ticket_close_reason').setLabel('📝 Fechar com Motivo').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('ticket_adduser').setLabel('➕ Adicionar').setStyle(ButtonStyle.Secondary));
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_removeuser').setLabel('➖ Remover').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ticket_rename').setLabel('✏️ Renomear').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('ticket_transcript').setLabel('📄 Transcript').setStyle(ButtonStyle.Secondary));
  await channel.send({
    content: supportRole ? `<@&${supportRole}> | <@${user.id}>` : `<@${user.id}>`,
    embeds: [embed],
    components: [row1, row2]
  });

  // Se o tipo de ticket tinha formulário, guarda e mostra as respostas
  if (respostas && respostas.length) {
    const insertAns = db.prepare('INSERT INTO ticket_form_answers (ticket_id, question, answer) VALUES (?, ?, ?)');
    for (const r of respostas) await insertAns.run(ticketId, r.question, r.answer || '');
    const embedForm = new EmbedBuilder().setTitle('📋 Respostas do Formulário').setColor(CONFIG.COR_PRINCIPAL).addFields(respostas.map(r => ({
      name: `❓ ${r.question}`.substring(0, 256),
      value: r.answer && r.answer.trim() ? r.answer.substring(0, 1024) : '_(sem resposta)_'
    }))).setTimestamp();
    await channel.send({
      embeds: [embedForm]
    });
  }
  return {
    channel,
    ticketNum,
    ticketId
  };
}

/** Fecha um ticket */
async function fecharTicket(channel, closedBy, guild, reason = null) {
  const ticket = await db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
  if (!ticket) return;

  // Gera transcript ANTES de apagar o canal (precisa das mensagens)
  const html = await gerarTranscript(channel);
  const buffer = Buffer.from(html, 'utf-8');

  // Atualiza BD
  await db.prepare(`UPDATE tickets SET status='closed', closed_at=CURRENT_TIMESTAMP WHERE channel_id=?`).run(channel.id);

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
      const attachmentUser = new AttachmentBuilder(buffer, {
        name: `transcript-${ticket.ticket_number}.html`
      });
      const user = await client.users.fetch(ticket.user_id);
      const embedUser = embedPadrao('🎫 Ticket Fechado', `O teu ticket **#${String(ticket.ticket_number).padStart(4, '0')}** foi fechado.${reason ? `\n\n📝 **Motivo do encerramento:**\n${reason}` : ''}\nAqui está o transcript da conversa:`, CONFIG.COR_AVISO);
      await user.send({
        embeds: [embedUser],
        files: [attachmentUser]
      }).catch(() => {});
    } catch (_) {}
  })();

  // Envia transcript para o canal de transcripts
  (async () => {
    try {
      const ticketConfig = await db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guild.id);
      if (ticketConfig?.transcript_channel) {
        const ch = guild.channels.cache.get(ticketConfig.transcript_channel);
        if (ch) {
          const attachmentLog = new AttachmentBuilder(buffer, {
            name: `transcript-${ticket.ticket_number}.html`
          });
          const embed = new EmbedBuilder().setTitle(`📄 Transcript - Ticket #${String(ticket.ticket_number).padStart(4, '0')}`).setColor(CONFIG.COR_AVISO).addFields({
            name: '👤 Utilizador',
            value: `<@${ticket.user_id}>`,
            inline: true
          }, {
            name: '🔒 Fechado por',
            value: `<@${closedBy}>`,
            inline: true
          }, {
            name: '📅 Fechado em',
            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
            inline: true
          }, ...(reason ? [{
            name: '📝 Motivo',
            value: reason
          }] : [])).setTimestamp();
          await ch.send({
            embeds: [embed],
            files: [attachmentLog]
          });
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
  const modal = new ModalBuilder().setCustomId(`rating_${staffId}_${ticketId}_${channelId || '0'}`).setTitle('⭐ Avaliar Staff');
  const ratingInput = new TextInputBuilder().setCustomId('rating_value').setLabel('Avaliação (1-5 estrelas)').setPlaceholder('Escreve um número de 1 a 5').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(1);
  const commentInput = new TextInputBuilder().setCustomId('rating_comment').setLabel('Comentário (opcional)').setPlaceholder('Escreve o teu comentário aqui...').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500);
  modal.addComponents(new ActionRowBuilder().addComponents(ratingInput), new ActionRowBuilder().addComponents(commentInput));
  return modal;
}

/** Obtém ranking de staff */
async function getRankingStaff(guildId) {
  return await db.prepare(`
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
const STATS_CANAIS_DEF = [{
  key: 'members_channel',
  showKey: 'show_members',
  emoji: '👥',
  label: 'Membros'
}, {
  key: 'bots_channel',
  showKey: 'show_bots',
  emoji: '🤖',
  label: 'Bots'
}, {
  key: 'channels_channel',
  showKey: 'show_channels',
  emoji: '📢',
  label: 'Canais'
}, {
  key: 'roles_channel',
  showKey: 'show_roles',
  emoji: '🎭',
  label: 'Cargos'
}, {
  key: 'boosts_channel',
  showKey: 'show_boosts',
  emoji: '🚀',
  label: 'Boosts'
}];

/** Cria a categoria "Logs" com os canais 📜│logs e 📜│mod-logs, visíveis só para Administradores.
 *  Devolve { logChannelId, modLogChannelId }. */
async function criarCanaisDeLogs(guild) {
  const categoria = await guild.channels.create({
    name: 'Logs',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [{
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    }, {
      id: client.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
    }]
  });
  const canalLogs = await guild.channels.create({
    name: '📜│logs',
    type: ChannelType.GuildText,
    parent: categoria.id
  });
  const canalModLogs = await guild.channels.create({
    name: '📜│mod-logs',
    type: ChannelType.GuildText,
    parent: categoria.id
  });
  return {
    logChannelId: canalLogs.id,
    modLogChannelId: canalModLogs.id
  };
}

/** Cria, atualiza e apaga canais de server stats conforme a configuração escolhida */
async function setupServerStats(guild, config) {
  let categoryId = config.category_id;
  let categoria = categoryId ? guild.channels.cache.get(categoryId) : null;

  // Cria categoria se não existir, já no topo do servidor
  if (!categoria) {
    categoria = await guild.channels.create({
      name: '📊 Server Stats',
      type: ChannelType.GuildCategory,
      position: 0,
      permissionOverwrites: [{
        id: guild.id,
        deny: [PermissionFlagsBits.Connect]
      }]
    });
    categoryId = categoria.id;
  }
  const stats = await calcularStats(guild);
  const valores = {
    members: stats.membros,
    bots: stats.bots,
    channels: stats.canais,
    roles: stats.cargos,
    boosts: stats.boosts
  };
  const comEmoji = config.show_emoji !== 0;
  const updates = {
    category_id: categoryId
  };
  let posicaoCanal = 0;
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
      // Canal novo: nasce logo na posição correta dentro da categoria
      ch = await guild.channels.create({
        name: nome,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        position: posicaoCanal,
        permissionOverwrites: [{
          id: guild.id,
          deny: [PermissionFlagsBits.Connect]
        }]
      });
    } else {
      // Canal já existente: só atualiza o nome, nunca mexe na posição
      // (se um admin o tiver movido, fica onde o admin pôs)
      await ch.setName(nome).catch(() => {});
    }
    updates[c.key] = ch.id;
    posicaoCanal++;
  }
  await db.prepare(`
    UPDATE server_stats SET
      category_id=?, members_channel=?, bots_channel=?,
      channels_channel=?, roles_channel=?, boosts_channel=?
    WHERE guild_id=?
  `).run(updates.category_id, updates.members_channel, updates.bots_channel, updates.channels_channel, updates.roles_channel, updates.boosts_channel, guild.id);
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
  await db.prepare(`
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
  const bots = guild.members.cache.filter(m => m.user.bot).size;
  const canais = guild.channels.cache.size;
  const cargos = guild.roles.cache.size;
  const boosts = guild.premiumSubscriptionCount || 0;
  return {
    membros,
    bots,
    canais,
    cargos,
    boosts
  };
}

/** Atualiza todos os canais de stats ativos */
async function atualizarStats(guild) {
  const config = await db.prepare('SELECT * FROM server_stats WHERE guild_id = ? AND enabled = 1').get(guild.id);
  if (!config) return;
  const stats = await calcularStats(guild);
  const valores = {
    members: stats.membros,
    bots: stats.bots,
    channels: stats.canais,
    roles: stats.cargos,
    boosts: stats.boosts
  };
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

// Substitui as variáveis disponíveis no editor de boas-vindas (estilo Sapphire: ${usermention}, ${guildname}, ...)
function substituirVariaveisWelcome(texto, member) {
  if (!texto) return texto;
  return texto.replace(/\$\{usermention\}/g, `<@${member.id}>`).replace(/\$\{username\}/g, member.user.username).replace(/\$\{usertag\}/g, member.user.tag).replace(/\$\{guildname\}/g, member.guild.name).replace(/\$\{membercount\}/g, member.guild.memberCount)
  // Compatibilidade com o formato antigo {user}/{server}/{count}
  .replace(/\{user\}/g, `<@${member.id}>`).replace(/\{server\}/g, member.guild.name).replace(/\{count\}/g, member.guild.memberCount);
}

/** Constrói o embed de boas-vindas a partir da configuração da guild (usado no envio real e no preview do dashboard) */
function construirEmbedWelcome(config, member) {
  // URL válido (http/https) — usado para todos os campos de imagem/link, para que um
  // URL vazio ou inválido nunca faça o Discord rejeitar a embed inteira em silêncio.
  const urlValido = u => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim());
  const titulo = substituirVariaveisWelcome(config.welcome_title || '👋 Bem-vindo(a)!', member);
  const descricao = substituirVariaveisWelcome(config.welcome_msg || 'Bem-vindo(a) {user} ao {server}!', member);
  const footer = substituirVariaveisWelcome(config.welcome_footer || '', member);

  // Nome/ícone do "author" (linha pequena acima do título). Se o utilizador não preencher
  // nada, usa o próprio bot como fallback — tal como o Sapphire já vem pré-preenchido.
  const autorNomeCfg = substituirVariaveisWelcome(config.welcome_author_name || '', member);
  const autorNome = autorNomeCfg || CONFIG.BOT_NAME || client.user.username;
  const autorIconCfg = (config.welcome_author_icon || '').trim();
  const autorIcon = urlValido(autorIconCfg) ? autorIconCfg : client.user.displayAvatarURL();
  const embed = new EmbedBuilder().setDescription(descricao).setColor(config.welcome_color || CONFIG.COR_SUCESSO).setTimestamp();
  if (titulo) {
    embed.setTitle(titulo);
    if (urlValido(config.welcome_url)) embed.setURL(config.welcome_url.trim());
  }
  embed.setAuthor({
    name: autorNome,
    iconURL: autorIcon
  });
  if (footer) embed.setFooter({
    text: footer
  });

  // Imagem pequena (thumbnail, canto superior direito) e imagem grande (banner, em baixo)
  // são independentes uma da outra — tal como no Sapphire.
  if (urlValido(config.welcome_thumbnail)) embed.setThumbnail(config.welcome_thumbnail.trim());
  if (urlValido(config.welcome_image)) embed.setImage(config.welcome_image.trim());
  return embed;
}

/** Envia mensagem de boas-vindas (usa a mensagem marcada como ATIVA em welcome_messages) */
async function sendWelcome(member) {
  const config = await db.prepare('SELECT * FROM welcome_messages WHERE guild_id = ? AND is_active = 1').get(member.guild.id);
  if (!config?.welcome_channel) return;
  const channel = member.guild.channels.cache.get(config.welcome_channel);
  if (!channel) return;
  const conteudoFora = substituirVariaveisWelcome(config.welcome_content || '', member);
  if (config.welcome_embed) {
    const embed = construirEmbedWelcome(config, member);
    await channel.send({
      content: conteudoFora || undefined,
      embeds: [embed]
    });
  } else {
    const msg = substituirVariaveisWelcome(config.welcome_msg || 'Bem-vindo(a) {user} ao servidor!', member);
    await channel.send(conteudoFora ? `${conteudoFora}\n${msg}` : msg);
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
  const linhas = await db.prepare('SELECT role_id FROM autorole_config WHERE guild_id = ? AND target = ?').all(member.guild.id, target);
  if (!linhas.length) return;
  for (const {
    role_id
  } of linhas) {
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
  const pares = await db.prepare('SELECT gain_role_id, lose_role_id FROM role_exclusivity WHERE guild_id = ?').all(member.guild.id);
  if (!pares.length) return;
  const cargosAtuais = member.roles.cache;
  const paraRemover = new Set();
  for (const {
    gain_role_id,
    lose_role_id
  } of pares) {
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
  const config = await db.prepare('SELECT trap_channel, log_channel FROM antispam_config WHERE guild_id = ?').get(message.guild.id);
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
      const embed = embedPadrao('🪤 Canal-Armadilha Acionado', `**Utilizador:** <@${message.author.id}> (${message.author.tag})\n**Canal:** <#${message.channel.id}>\n**Ação:** ${banned ? '✅ Banido' : '⚠️ Falhou o ban'}`, CONFIG.COR_ERRO);
      await ch.send({
        embeds: [embed]
      });
    }
  }
  return true;
}

/**
 * Verifica se um membro é imune ao automod (anti-spam, anti-links, anti-invites, anti-raid, trap channel).
 * NÃO afeta ban/kick manuais — só protege contra ações automáticas do bot.
 */
async function isImune(member) {
  if (!member || !member.guild) return false;
  const config = await db.prepare('SELECT immune_roles, immune_admins FROM guild_config WHERE guild_id = ?').get(member.guild.id);
  if (!config) return false;
  if (config.immune_admins && member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  let immuneRoles = [];
  try {
    immuneRoles = JSON.parse(config.immune_roles || '[]');
  } catch (_) {}
  if (immuneRoles.length && member.roles.cache.some(r => immuneRoles.includes(r.id))) return true;
  return false;
}

/** Verifica spam numa mensagem */
async function verificarSpam(message) {
  if (!message.guild || message.author.bot) return;
  if (isImune(message.member)) return;
  const config = await db.prepare('SELECT * FROM antispam_config WHERE guild_id = ? AND enabled = 1').get(message.guild.id);
  if (!config) return;

  // Verificar whitelist
  const whitelistRoles = JSON.parse(config.whitelist_roles || '[]');
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

  // Canais onde o anti-links/anti-convites se aplica.
  // Lista vazia = aplica-se a TODOS os canais. Lista preenchida = só nesses canais específicos.
  const linkInviteChannels = JSON.parse(config.link_invite_channels || '[]');
  // Canais excluídos (exceções): nestes canais o anti-links/anti-convites NUNCA se aplica,
  // mesmo que estejam incluídos acima ou o modo seja "todos os canais". Tem sempre prioridade.
  const linkInviteExcludedChannels = JSON.parse(config.link_invite_excluded_channels || '[]');
  const canalExcluido = linkInviteExcludedChannels.includes(message.channel.id);
  const aplicaNesteCanal = !canalExcluido && (linkInviteChannels.length === 0 || linkInviteChannels.includes(message.channel.id));

  // Anti-links
  if (config.anti_links && aplicaNesteCanal) {
    const linkRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;
    if (linkRegex.test(message.content)) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`<@${message.author.id}> ⚠️ Não podes enviar links aqui!`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
  }

  // Anti-invites
  if (config.anti_invites && aplicaNesteCanal) {
    const inviteRegex = /(discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9]+/gi;
    if (inviteRegex.test(message.content)) {
      await message.delete().catch(() => {});
      const warn = await message.channel.send(`<@${message.author.id}> ⚠️ Não podes enviar convites de Discord aqui!`);
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
  }

  // Anti-spam
  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const data = spamMap.get(key) || {
    msgs: [],
    warned: false
  };
  data.msgs = data.msgs.filter(t => now - t < config.interval_ms);
  data.msgs.push(now);
  spamMap.set(key, data);
  if (data.msgs.length >= config.max_messages) {
    // Deleta mensagens recentes
    const msgs = await message.channel.messages.fetch({
      limit: 10
    });
    const spam = msgs.filter(m => m.author.id === message.author.id);
    await message.channel.bulkDelete(spam, true).catch(() => {});

    // Aplica punição
    if (config.action === 'mute' || config.action === 'timeout') {
      const duration = config.mute_duration * 1000;
      await message.member.timeout(duration, 'AutoMod: Spam detectado').catch(() => {});
      const warn = await message.channel.send(`<@${message.author.id}> ⚠️ Foste silenciado por **${formatDuration(duration)}** por spam!`);
      setTimeout(() => warn.delete().catch(() => {}), 10000);
    } else if (config.action === 'kick') {
      await message.member.kick('AutoMod: Spam detectado').catch(() => {});
    } else if (config.action === 'ban') {
      await message.member.ban({
        reason: 'AutoMod: Spam detectado',
        deleteMessageSeconds: 7 * 86400
      }).catch(() => {});
    }

    // Loga
    if (config.log_channel) {
      const ch = message.guild.channels.cache.get(config.log_channel);
      if (ch) {
        const embed = embedPadrao('🛡️ AutoMod - Spam Detectado', `**Utilizador:** <@${message.author.id}>\n**Canal:** <#${message.channel.id}>\n**Ação:** ${config.action}`, CONFIG.COR_ERRO);
        await ch.send({
          embeds: [embed]
        });
      }
    }
    spamMap.delete(key);
  }
}

/** Verifica raid (muitos membros a entrar rapidamente) */
async function verificarRaid(member) {
  const config = await db.prepare('SELECT * FROM antispam_config WHERE guild_id = ? AND enabled = 1 AND anti_raid = 1').get(member.guild.id);
  if (!config) return;
  const key = member.guild.id;
  const now = Date.now();
  const data = joinMap.get(key) || {
    joins: [],
    alerted: false
  };
  data.joins = data.joins.filter(t => now - t < 10000); // 10 segundos
  data.joins.push(now);
  joinMap.set(key, data);
  if (data.joins.length >= config.raid_threshold && !data.alerted) {
    data.alerted = true;
    joinMap.set(key, data);
    if (config.log_channel) {
      const ch = member.guild.channels.cache.get(config.log_channel);
      if (ch) {
        const embed = embedPadrao('🚨 ALERTA DE RAID!', `Detectados **${data.joins.length}** membros a entrar em menos de 10 segundos!\n\nConsidera ativar o modo de verificação do servidor!`, CONFIG.COR_ERRO).addFields({
          name: '⚠️ Ação Recomendada',
          value: 'Usa `/antispam` para configurar proteção automática'
        });
        await ch.send({
          content: '@here',
          embeds: [embed]
        });
      }
    }

    // Reset após 30s
    setTimeout(() => {
      const d = joinMap.get(key);
      if (d) {
        d.alerted = false;
        joinMap.set(key, d);
      }
    }, 30000);
  }
}

/** Envia um aviso no canal-armadilha para avisar que quem escrever ali é banido */
async function enviarAvisoTrapChannel(guild, channelId) {
  if (!channelId) return;
  const ch = guild.channels.cache.get(channelId);
  if (!ch) return;
  const embed = embedPadrao('🪤 Canal Proibido', '**Não envies nenhuma mensagem neste canal.**\n\nQuem enviar uma mensagem aqui será **banido automaticamente** do servidor.', CONFIG.COR_ERRO);
  await ch.send({
    embeds: [embed]
  }).catch(() => {});
}

// ============================
// DEFINIÇÃO DOS COMANDOS SLASH
// ============================
const commands = [
// ── Tickets ──
new SlashCommandBuilder().setName('ticket-setup').setDescription('Configura o sistema de tickets').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addChannelOption(o => o.setName('categoria').setDescription('Categoria para os tickets').setRequired(true)).addChannelOption(o => o.setName('log').setDescription('Canal de logs de tickets').setRequired(false)).addRoleOption(o => o.setName('suporte').setDescription('Cargo de suporte').setRequired(false)).addChannelOption(o => o.setName('transcripts').setDescription('Canal para transcripts').setRequired(false)).addIntegerOption(o => o.setName('max').setDescription('Máximo de tickets por utilizador').setRequired(false).setMinValue(1).setMaxValue(10)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem de boas-vindas ({user}, {ticket})').setRequired(false)), new SlashCommandBuilder().setName('ticket-painel').setDescription('Cria o painel de tickets num canal').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addChannelOption(o => o.setName('canal').setDescription('Canal para o painel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)).addStringOption(o => o.setName('titulo').setDescription('Título do painel').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição do painel').setRequired(false)), new SlashCommandBuilder().setName('ticket-tipo').setDescription('Adiciona um tipo de ticket ao select menu').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('nome').setDescription('Nome do tipo').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(false)).addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(false)), new SlashCommandBuilder().setName('ticket-tipos-lista').setDescription('Lista os tipos de ticket configurados').setDefaultMemberPermissions(PermissionFlagsBits.Administrator), new SlashCommandBuilder().setName('ticket-tipo-remover').setDescription('Remove um tipo de ticket pelo ID').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addIntegerOption(o => o.setName('id').setDescription('ID do tipo de ticket (vê com /ticket-tipos-lista)').setRequired(true)), new SlashCommandBuilder().setName('ticket-criar').setDescription('Cria um ticket manualmente').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
// ── Staff Rating ──
new SlashCommandBuilder().setName('ranking-staff').setDescription('Mostra o ranking de avaliações da staff').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addIntegerOption(o => o.setName('top').setDescription('Quantos staff mostrar').setRequired(false).setMinValue(1).setMaxValue(10)),
// ⚠️ Comando disponível para todos os membros (sem exigir Administrador)
new SlashCommandBuilder().setName('avaliar-staff').setDescription('Avalia um membro da staff').addUserOption(o => o.setName('staff').setDescription('Membro da staff a avaliar').setRequired(true)), new SlashCommandBuilder().setName('historico-staff').setDescription('Vê o histórico de avaliações de um staff').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName('staff').setDescription('Membro da staff').setRequired(true)),
// ── Server Stats ──
new SlashCommandBuilder().setName('stats-setup').setDescription('Configura os canais de estatísticas do servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator), new SlashCommandBuilder().setName('stats-atualizar').setDescription('Atualiza manualmente as estatísticas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator), new SlashCommandBuilder().setName('stats-desativar').setDescription('Desativa o sistema de estatísticas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
// ── Reaction Roles: geridos exclusivamente pelo Dashboard, sem comandos no Discord ──

// ── Welcome ──
new SlashCommandBuilder().setName('welcome-setup').setDescription('Configura o sistema de boas-vindas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addChannelOption(o => o.setName('canal').setDescription('Canal de boas-vindas').setRequired(true)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem ({user}, {server}, {count})').setRequired(false)).addStringOption(o => o.setName('titulo').setDescription('Título da embed ({user}, {server}, {count})').setRequired(false)).addStringOption(o => o.setName('imagem').setDescription('URL da imagem/banner da embed').setRequired(false)).addBooleanOption(o => o.setName('embed').setDescription('Usar embed?').setRequired(false)).addRoleOption(o => o.setName('autorole').setDescription('Cargo automático para novos membros').setRequired(false)), new SlashCommandBuilder().setName('welcome-desativar').setDescription('Desativa o sistema de boas-vindas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator), new SlashCommandBuilder().setName('welcome-testar').setDescription('Testa a mensagem de boas-vindas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
// ── Embeds ──
new SlashCommandBuilder().setName('embed-criar').setDescription('Cria um embed personalizado').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName('titulo').setDescription('Título do embed').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true)).addStringOption(o => o.setName('cor').setDescription('Cor hexadecimal (ex: #5865F2)').setRequired(false)).addStringOption(o => o.setName('imagem').setDescription('URL da imagem').setRequired(false)).addStringOption(o => o.setName('thumbnail').setDescription('URL do thumbnail').setRequired(false)).addStringOption(o => o.setName('footer').setDescription('Rodapé').setRequired(false)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem enviada fora do embed').setRequired(false)).addChannelOption(o => o.setName('canal').setDescription('Canal onde enviar (padrão: atual)').setRequired(false)), new SlashCommandBuilder().setName('embed-guardar').setDescription('Guarda um embed para usar depois').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName('nome').setDescription('Nome para identificar o embed').setRequired(true)).addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true)).addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true)).addStringOption(o => o.setName('cor').setDescription('Cor').setRequired(false)).addStringOption(o => o.setName('imagem').setDescription('URL da imagem').setRequired(false)).addStringOption(o => o.setName('thumbnail').setDescription('URL do thumbnail').setRequired(false)).addStringOption(o => o.setName('footer').setDescription('Rodapé').setRequired(false)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem enviada fora do embed').setRequired(false)), new SlashCommandBuilder().setName('embed-enviar').setDescription('Envia um embed guardado').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addStringOption(o => o.setName('nome').setDescription('Nome do embed guardado').setRequired(true)).addChannelOption(o => o.setName('canal').setDescription('Canal onde enviar').setRequired(false)), new SlashCommandBuilder().setName('embed-lista').setDescription('Lista os embeds guardados').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
// ── Perguntas à comunidade ──
new SlashCommandBuilder().setName('pergunta').setDescription('Faz uma pergunta à comunidade num canal, criando um tópico para respostas').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addChannelOption(o => o.setName('canal').setDescription('Canal onde enviar a pergunta').setRequired(true).addChannelTypes(ChannelType.GuildText)).addStringOption(o => o.setName('pergunta').setDescription('O texto da pergunta').setRequired(true).setMaxLength(2000)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem extra enviada fora da embed (ex: @everyone)').setRequired(false).setMaxLength(1000)),
// ── Sugestões ──
new SlashCommandBuilder().setName('sugestao-tipo-criar').setDescription('Cria um novo tipo de sugestão (ex: Sugestão, Sugestão de Construção)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('nome').setDescription('Nome do tipo, ex: Sugestão de Construção').setRequired(true).setMaxLength(80)).addChannelOption(o => o.setName('canal').setDescription('Canal onde as sugestões deste tipo são publicadas').setRequired(true)).addStringOption(o => o.setName('emoji').setDescription('Emoji do tipo, ex: 🏗️').setRequired(false)).addChannelOption(o => o.setName('log').setDescription('Canal de log deste tipo de sugestão').setRequired(false)).addRoleOption(o => o.setName('ping').setDescription('Cargo a mencionar em novas sugestões deste tipo').setRequired(false)), new SlashCommandBuilder().setName('sugestao-tipo-apagar').setDescription('Apaga um tipo de sugestão (as sugestões já submetidas não são apagadas)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('nome').setDescription('Nome do tipo a apagar').setRequired(true).setAutocomplete(true)), new SlashCommandBuilder().setName('sugestao-tipo-lista').setDescription('Lista os tipos de sugestão configurados neste servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator), new SlashCommandBuilder().setName('sugerir').setDescription('Submete uma sugestão').addStringOption(o => o.setName('tipo').setDescription('Tipo de sugestão').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('sugestao').setDescription('A tua sugestão').setRequired(true).setMaxLength(1000)), new SlashCommandBuilder().setName('sugestao-responder').setDescription('Responde a uma sugestão (aprovar/rejeitar)').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName('id').setDescription('Número da sugestão (o # mostrado no embed, ex: #3)').setRequired(true)).addStringOption(o => o.setName('acao').setDescription('Ação').setRequired(true).addChoices({
  name: '✅ Aprovar',
  value: 'approve'
}, {
  name: '❌ Rejeitar',
  value: 'reject'
}, {
  name: '🤔 Em consideração',
  value: 'consider'
})).addStringOption(o => o.setName('resposta').setDescription('Resposta da moderação').setRequired(false)),
// ── Moderação ──
new SlashCommandBuilder().setName('ban').setDescription('Bane um utilizador').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o => o.setName('utilizador').setDescription('Utilizador a banir').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)).addIntegerOption(o => o.setName('dias').setDescription('Apagar mensagens dos últimos X dias (padrão: 7)').setRequired(false).setMinValue(0).setMaxValue(7)), new SlashCommandBuilder().setName('unban').setDescription('Remove o ban de um utilizador').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o => o.setName('id').setDescription('ID do utilizador').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)), new SlashCommandBuilder().setName('blacklist-add').setDescription('Bane automaticamente pelo username, mesmo que a conta nunca tenha entrado no servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('username').setDescription('Username do utilizador a bloquear').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo (ex: raid anterior)').setRequired(false)), new SlashCommandBuilder().setName('blacklist-remove').setDescription('Remove um utilizador da blacklist (por ID ou username)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('id').setDescription('ID ou username a remover').setRequired(true)), new SlashCommandBuilder().setName('blacklist-lista').setDescription('Mostra os utilizadores atualmente na blacklist deste servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator), new SlashCommandBuilder().setName('kick').setDescription('Expulsa um utilizador').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o => o.setName('utilizador').setDescription('Utilizador a expulsar').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)), new SlashCommandBuilder().setName('timeout').setDescription('Silencia temporariamente um utilizador').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true)).addStringOption(o => o.setName('duracao').setDescription('Duração (ex: 10m, 2h, 1d)').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)), new SlashCommandBuilder().setName('untimeout').setDescription('Remove o silêncio de um utilizador').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(false)), new SlashCommandBuilder().setName('warn').setDescription('Avisa um utilizador').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true)).addStringOption(o => o.setName('motivo').setDescription('Motivo').setRequired(true)), new SlashCommandBuilder().setName('warns').setDescription('Vê os avisos de um utilizador').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true)), new SlashCommandBuilder().setName('clearwarns').setDescription('Limpa os avisos de um utilizador').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName('utilizador').setDescription('Utilizador').setRequired(true)), new SlashCommandBuilder().setName('limpar').setDescription('Apaga mensagens do canal').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName('quantidade').setDescription('Número de mensagens (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).addUserOption(o => o.setName('utilizador').setDescription('Apagar apenas mensagens deste utilizador').setRequired(false)), new SlashCommandBuilder().setName('lock').setDescription('Tranca um canal (impede @everyone de enviar mensagens)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addChannelOption(o => o.setName('canal').setDescription('Canal a trancar (padrão: este canal)').setRequired(false)), new SlashCommandBuilder().setName('unlock').setDescription('Destranca um canal (volta a permitir @everyone enviar mensagens)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addChannelOption(o => o.setName('canal').setDescription('Canal a destrancar (padrão: este canal)').setRequired(false)), new SlashCommandBuilder().setName('userinfo').setDescription('Mostra informações sobre um utilizador').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName('utilizador').setDescription('Utilizador (padrão: tu)').setRequired(false)), new SlashCommandBuilder().setName('serverinfo').setDescription('Mostra informações sobre o servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
// ── Logs ──
new SlashCommandBuilder().setName('logs-setup').setDescription('Configura o canal de logs (se não escolheres nenhum, cria uma categoria "Logs" automaticamente)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addChannelOption(o => o.setName('canal').setDescription('Canal de logs (deixa vazio para criar automaticamente)').setRequired(false)).addChannelOption(o => o.setName('mod-log').setDescription('Canal de logs de moderação (deixa vazio para criar automaticamente)').setRequired(false)),
// ── AntiSpam ──
new SlashCommandBuilder().setName('antispam').setDescription('Configura o sistema AntiSpam').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addBooleanOption(o => o.setName('ativo').setDescription('Ativar/Desativar').setRequired(true)).addIntegerOption(o => o.setName('max-mensagens').setDescription('Máx. mensagens antes de punir').setRequired(false).setMinValue(2).setMaxValue(20)).addStringOption(o => o.setName('acao').setDescription('Ação ao detetar spam').setRequired(false).addChoices({
  name: 'Silenciar',
  value: 'mute'
}, {
  name: 'Expulsar',
  value: 'kick'
}, {
  name: 'Banir',
  value: 'ban'
})).addBooleanOption(o => o.setName('anti-links').setDescription('Bloquear links').setRequired(false)).addBooleanOption(o => o.setName('anti-convites').setDescription('Bloquear convites Discord').setRequired(false)).addBooleanOption(o => o.setName('anti-raid').setDescription('Proteção anti-raid').setRequired(false)).addChannelOption(o => o.setName('log').setDescription('Canal de log do AntiSpam').setRequired(false)).addChannelOption(o => o.setName('canal-armadilha').setDescription('Canal onde quem escrever é banido automaticamente').setRequired(false)).addBooleanOption(o => o.setName('anti-bot').setDescription('Banir automaticamente quem adicionar bots sem ser admin').setRequired(false)),
// ── Votações ──
new SlashCommandBuilder().setName('votação-setup').setDescription('Configura uma votação neste servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('modo').setDescription('Tipo de votação').setRequired(true).addChoices({
  name: 'Recorrente (todos os dias)',
  value: 'recorrente'
}, {
  name: 'Um dia único (começa agora)',
  value: 'unica'
})), new SlashCommandBuilder().setName('remover-votação').setDescription('Remove a votação diária configurada neste servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
// ── Cargos ──
new SlashCommandBuilder().setName('role-add-remove').setDescription('Adiciona um cargo e remove outro cargo de um utilizador (apenas admins)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(o => o.setName('utilizador').setDescription('Utilizador a alterar').setRequired(true)).addRoleOption(o => o.setName('adicionar').setDescription('Cargo a adicionar').setRequired(true)).addRoleOption(o => o.setName('remover').setDescription('Cargo a remover').setRequired(true)),
// ── Giveaways ──
new SlashCommandBuilder().setName('giveaway-criar').setDescription('Cria um sorteio (giveaway)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('premio').setDescription('O que vai ser sorteado').setRequired(true)).addStringOption(o => o.setName('duracao').setDescription('Duração (ex: 1m, 10m, 2h, 1d)').setRequired(true)).addIntegerOption(o => o.setName('vencedores').setDescription('Número de vencedores').setRequired(false).setMinValue(1).setMaxValue(20)).addChannelOption(o => o.setName('canal').setDescription('Canal onde publicar (padrão: este canal)').setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)).addStringOption(o => o.setName('titulo').setDescription('Título da embed (padrão: 🎉 SORTEIO 🎉)').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição/texto extra da embed').setRequired(false)).addStringOption(o => o.setName('imagem').setDescription('URL de uma imagem para a embed').setRequired(false)).addStringOption(o => o.setName('mensagem').setDescription('Mensagem fora da embed (ex: @everyone, @cargo) para marcar pessoas').setRequired(false)), new SlashCommandBuilder().setName('giveaway-terminar').setDescription('Termina um sorteio imediatamente e sorteia o(s) vencedor(es)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('id').setDescription('ID do giveaway (vê com /giveaway-lista)').setRequired(true)), new SlashCommandBuilder().setName('giveaway-reroll').setDescription('Sorteia novo(s) vencedor(es) para um giveaway já terminado').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('id').setDescription('ID do giveaway (vê com /giveaway-lista)').setRequired(true)), new SlashCommandBuilder().setName('giveaway-cancelar').setDescription('Cancela um sorteio sem sortear vencedores').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('id').setDescription('ID do giveaway (vê com /giveaway-lista)').setRequired(true)), new SlashCommandBuilder().setName('giveaway-lista').setDescription('Lista os sorteios ativos e recentes do servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
// ── Painéis de Informação ──
new SlashCommandBuilder().setName('painel-criar').setDescription('Cria um painel de informação em rascunho (usa /painel-publicar depois de adicionares os botões)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('nome').setDescription('Nome interno para identificar o painel (não aparece no Discord)').setRequired(true)).addStringOption(o => o.setName('titulo').setDescription('Título do embed').setRequired(false)).addStringOption(o => o.setName('descricao').setDescription('Descrição/texto principal').setRequired(false)).addStringOption(o => o.setName('banner').setDescription('URL da imagem grande (banner)').setRequired(false)).addStringOption(o => o.setName('thumbnail').setDescription('URL da imagem pequena (thumbnail)').setRequired(false)).addStringOption(o => o.setName('cor').setDescription('Cor em hex, ex: #5865F2').setRequired(false)).addStringOption(o => o.setName('dono').setDescription('Texto do campo Dono, ex: @Léo').setRequired(false)).addStringOption(o => o.setName('fundado').setDescription('Texto do campo Fundado, ex: há 7 anos').setRequired(false)).addStringOption(o => o.setName('rodape').setDescription('Texto do rodapé (footer)').setRequired(false)).addChannelOption(o => o.setName('canal').setDescription('Canal onde publicar (padrão: este canal)').setRequired(false)), new SlashCommandBuilder().setName('painel-botao-add').setDescription('Adiciona um botão a um painel de informação já criado').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('painel').setDescription('Nome do painel (usa /painel-lista para veres os nomes)').setRequired(true)).addStringOption(o => o.setName('label').setDescription('Texto do botão, ex: Regras').setRequired(true)).addStringOption(o => o.setName('resposta').setDescription('Texto mostrado só a quem clicar no botão').setRequired(true)).addStringOption(o => o.setName('emoji').setDescription('Emoji do botão, ex: 📜').setRequired(false)).addStringOption(o => o.setName('estilo').setDescription('Estilo/cor do botão').setRequired(false).addChoices({
  name: 'Azul (Primary)',
  value: 'Primary'
}, {
  name: 'Cinza (Secondary)',
  value: 'Secondary'
}, {
  name: 'Verde (Success)',
  value: 'Success'
}, {
  name: 'Vermelho (Danger)',
  value: 'Danger'
})).addStringOption(o => o.setName('resposta-titulo').setDescription('Título opcional para a resposta (se quiseres embed)').setRequired(false)).addStringOption(o => o.setName('resposta-imagem').setDescription('URL de imagem grande na resposta').setRequired(false)).addStringOption(o => o.setName('resposta-thumbnail').setDescription('URL de imagem pequena na resposta').setRequired(false)).addStringOption(o => o.setName('resposta-cor').setDescription('Cor hex da resposta, ex: #5865F2').setRequired(false)), new SlashCommandBuilder().setName('painel-publicar').setDescription('Publica (ou republica) um painel de informação já criado, com todos os botões de uma vez').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('painel').setDescription('Nome do painel a publicar').setRequired(true)), new SlashCommandBuilder().setName('painel-lista').setDescription('Lista os painéis de informação configurados neste servidor').setDefaultMemberPermissions(PermissionFlagsBits.Administrator), new SlashCommandBuilder().setName('painel-apagar').setDescription('Apaga um painel de informação (e os seus botões)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o => o.setName('painel').setDescription('Nome do painel a apagar').setRequired(true)),
// ── Help ──
new SlashCommandBuilder().setName('help').setDescription('Mostra todos os comandos disponíveis')];

// ============================
// REGISTO DOS COMANDOS SLASH
// ============================
const rest = new REST({
  version: '10'
}).setToken(CONFIG.TOKEN);
async function registarComandos() {
  try {
    console.log('🔄 A registar comandos slash...');
    await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID),
    // Global → funciona em todos os servidores
    {
      body: commands.map(c => c.toJSON())
    });
    console.log(`✅ ${commands.length} comandos slash globais registados com sucesso!`);
  } catch (err) {
    console.error('❌ Erro ao registar comandos:', err);
  }
}

// ============================
// COMANDOS SLASH DE EMBEDS GUARDADAS (por servidor)
// ============================
// Cada embed guardada pode ter um "trigger_command" (ex: "abrirservidor") configurado
// no dashboard. Em vez de depender de um prefixo de texto (ex: "+abrirservidor"), este
// comando é registado como um SLASH COMMAND real (ex: "/abrirservidor"), disponível
// SÓ nesse servidor (guild command — propaga em segundos, ao contrário dos globais) e
// restrito por definição a quem tem permissão de Administrador (setDefaultMemberPermissions).
// Sempre que uma embed é criada/editada/apagada, ou o comando é configurado/removido,
// chama-se sincronizarComandosEmbed(guildId) para atualizar os comandos slash desse servidor.
async function sincronizarComandosEmbed(guildId) {
  try {
    const embedsComComando = await db.prepare('SELECT id, name, trigger_command FROM saved_embeds WHERE guild_id = ? AND trigger_command IS NOT NULL').all(guildId);
    const comandosEmbed = embedsComComando.map(e => new SlashCommandBuilder().setName(e.trigger_command).setDescription(`Publica a embed guardada "${e.name}"`).setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addChannelOption(o => o.setName('canal').setDescription('Canal onde publicar (padrão: este canal)').setRequired(false)).toJSON());

    // Regista SÓ os comandos deste servidor (guild commands) — não mexe nos comandos
    // globais definidos em "commands", que continuam a ser geridos por registarComandos().
    await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, guildId), {
      body: comandosEmbed
    });
    console.log(`✅ ${comandosEmbed.length} comando(s) de embed sincronizado(s) no servidor ${guildId}.`);
  } catch (err) {
    console.error(`❌ Erro ao sincronizar comandos de embed no servidor ${guildId}:`, err.message);
  }
}

// Sincroniza os comandos de embed de TODOS os servidores onde o bot está.
// Chamado no arranque (ClientReady), para garantir que os comandos configurados
// no dashboard antes de o bot reiniciar continuam disponíveis como slash commands.
async function sincronizarComandosEmbedTodosServidores() {
  try {
    const guildIds = (await db.prepare('SELECT DISTINCT guild_id FROM saved_embeds WHERE trigger_command IS NOT NULL').all()).map(r => r.guild_id);
    for (const guildId of guildIds) {
      await sincronizarComandosEmbed(guildId);
    }
  } catch (err) {
    console.error('❌ Erro ao sincronizar comandos de embed em todos os servidores:', err.message);
  }
}

// Trata a execução de um comando slash de embed (ex: "/abrirservidor"), caso o
// commandName corresponda a um trigger_command configurado neste servidor.
// Retorna true se tratou o comando (para o handler principal não continuar a procurar).
async function tratarComandoSlashEmbed(interaction) {
  const {
    commandName,
    guild
  } = interaction;
  if (!guild) return false;
  const saved = await db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? AND trigger_command = ?').get(guild.id, commandName);
  if (!saved) return false;

  // Segurança extra: o Discord já restringe o comando a Administrador via
  // setDefaultMemberPermissions, mas confirmamos aqui também (caso as permissões
  // do comando tenham sido alteradas manualmente pelo dono do servidor).
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ Só administradores podem usar este comando.',
      ephemeral: true
    });
    return true;
  }
  const canal = interaction.options.getChannel('canal') || interaction.channel;
  const data = JSON.parse(saved.data);
  const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color || CONFIG.COR_PRINCIPAL).setTimestamp();
  if (data.image) embed.setImage(data.image);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) embed.setFooter({
    text: data.footer
  });
  await interaction.deferReply({
    ephemeral: true
  });
  await canal.send({
    content: data.content || undefined,
    embeds: [embed]
  });
  return interaction.editReply({
    content: `✅ Embed enviada em ${canal}!`
  }), true;
}

// ============================
// HANDLER DE INTERACTION
// ============================
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ── AUTOCOMPLETE (sugestões de valores enquanto o utilizador escreve) ──
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
      return;
    }
    // ── COMANDOS SLASH ──
    if (interaction.isChatInputCommand()) {
      // Primeiro verifica se é um comando de embed guardada (ex: "/abrirservidor"),
      // configurado no dashboard e registado como guild command deste servidor.
      const foiComandoEmbed = await tratarComandoSlashEmbed(interaction);
      if (!foiComandoEmbed) {
        await handleSlashCommand(interaction);
      }
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
    const reply = {
      content: `❌ Ocorreu um erro: \`${err.message}\``,
      ephemeral: true
    };
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
// ============================
// AUTOCOMPLETE
// ============================
async function handleAutocomplete(interaction) {
  const {
    commandName,
    guild
  } = interaction;
  const focused = interaction.options.getFocused(true);
  if (commandName === 'sugerir' && focused.name === 'tipo') {
    const tipos = await db.prepare('SELECT name FROM suggestion_types WHERE guild_id = ? AND enabled = 1 ORDER BY order_num, id').all(guild.id);
    const filtrados = tipos.filter(t => t.name.toLowerCase().includes((focused.value || '').toLowerCase())).slice(0, 25).map(t => ({
      name: t.name,
      value: t.name
    }));
    return interaction.respond(filtrados).catch(() => {});
  }
  if (commandName === 'sugestao-tipo-apagar' && focused.name === 'nome') {
    const tipos = await db.prepare('SELECT name FROM suggestion_types WHERE guild_id = ? ORDER BY order_num, id').all(guild.id);
    const filtrados = tipos.filter(t => t.name.toLowerCase().includes((focused.value || '').toLowerCase())).slice(0, 25).map(t => ({
      name: t.name,
      value: t.name
    }));
    return interaction.respond(filtrados).catch(() => {});
  }
  return interaction.respond([]).catch(() => {});
}
async function handleSlashCommand(interaction) {
  const {
    commandName,
    guild,
    member,
    user,
    options
  } = interaction;

  // ─────────────────────────────────────────────
  // TICKETS
  // ─────────────────────────────────────────────

  if (commandName === 'ticket-setup') {
    await interaction.deferReply({
      ephemeral: true
    });
    const categoria = options.getChannel('categoria');
    const log = options.getChannel('log');
    const suporte = options.getRole('suporte');
    const transcripts = options.getChannel('transcripts');
    const max = options.getInteger('max') || 3;
    const mensagem = options.getString('mensagem') || 'Olá {user}! O teu ticket foi criado. A equipa irá responder brevemente.';
    await db.prepare(`
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
    const embed = embedPadrao('✅ Sistema de Tickets Configurado', [`**Categoria:** ${categoria}`, `**Log:** ${log || 'Não definido'}`, `**Suporte:** ${suporte || 'Não definido'}`, `**Transcripts:** ${transcripts || 'Não definido'}`, `**Máx. Tickets/Utilizador:** ${max}`].join('\n'), CONFIG.COR_SUCESSO);
    return interaction.editReply({
      embeds: [embed]
    });
  }
  if (commandName === 'ticket-painel') {
    await interaction.deferReply({
      ephemeral: true
    });
    const ticketConfig = await db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guild.id);
    if (!ticketConfig) return interaction.editReply({
      content: '❌ Primeiro configura o sistema com `/ticket-setup`.'
    });
    const canal = options.getChannel('canal');
    const titulo = options.getString('titulo') || '🎫 Suporte';
    const descricao = options.getString('descricao') || 'Clica no botão abaixo para abrir um ticket de suporte.\nA nossa equipa irá responder o mais brevemente possível!';

    // Busca tipos de ticket
    const tipos = await db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num').all(guild.id);
    const embed = new EmbedBuilder().setTitle(titulo).setDescription(descricao).setColor(ticketConfig.panel_color || CONFIG.COR_PRINCIPAL).setTimestamp();
    const components = montarComponentesPainelTicket(guild.id, ticketConfig);
    const msg = await canal.send({
      embeds: [embed],
      components
    });

    // Guarda ID do painel
    await db.prepare(`
      UPDATE ticket_config SET panel_msg_id=?, panel_channel_id=? WHERE guild_id=?
    `).run(msg.id, canal.id, guild.id);
    return interaction.editReply({
      content: `✅ Painel de tickets criado em ${canal}!`
    });
  }
  if (commandName === 'ticket-tipo') {
    const nome = options.getString('nome');
    const descricao = options.getString('descricao');
    const emoji = options.getString('emoji') || '🎫';
    const tipos = await db.prepare('SELECT COUNT(*) as c FROM ticket_types WHERE guild_id = ?').get(guild.id);
    if (tipos.c >= 25) return interaction.reply({
      content: '❌ Já tens 25 tipos de ticket (limite do select menu).',
      ephemeral: true
    });
    await db.prepare(`
      INSERT INTO ticket_types (guild_id, label, description, emoji, order_num)
      VALUES (?, ?, ?, ?, ?)
    `).run(guild.id, nome, descricao, emoji, tipos.c);
    return interaction.reply({
      content: `✅ Tipo de ticket **${emoji} ${nome}** adicionado! Recria o painel com \`/ticket-painel\`.`,
      ephemeral: true
    });
  }
  if (commandName === 'ticket-tipos-lista') {
    const tipos = await db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num').all(guild.id);
    if (!tipos.length) return interaction.reply({
      content: '❌ Não há tipos de ticket configurados.',
      ephemeral: true
    });
    const embed = embedPadrao('📋 Tipos de Ticket', tipos.map((t, i) => `**${i + 1}.** ${t.emoji || '🎫'} **${t.label}** (ID: ${t.id})\n↳ ${t.description || 'Sem descrição'}`).join('\n\n'));
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  if (commandName === 'ticket-tipo-remover') {
    const id = options.getInteger('id');
    const tipo = await db.prepare('SELECT * FROM ticket_types WHERE id = ? AND guild_id = ?').get(id, guild.id);
    if (!tipo) return interaction.reply({
      content: `❌ Não existe nenhum tipo de ticket com o ID **${id}** neste servidor. Usa \`/ticket-tipos-lista\` para ver os IDs corretos.`,
      ephemeral: true
    });
    await db.prepare('DELETE FROM ticket_types WHERE id = ? AND guild_id = ?').run(id, guild.id);
    return interaction.reply({
      content: `✅ Tipo de ticket **${tipo.emoji || '🎫'} ${tipo.label}** (ID: ${id}) foi removido! Recria o painel com \`/ticket-painel\` para atualizar o select menu.`,
      ephemeral: true
    });
  }
  if (commandName === 'ticket-criar') {
    await interaction.deferReply({
      ephemeral: true
    });
    const result = await criarTicket(guild, user, null, interaction);
    if (result.erro) return interaction.editReply({
      content: `❌ ${result.erro}`
    });
    return interaction.editReply({
      content: `✅ Ticket criado: ${result.channel}`
    });
  }

  // ─────────────────────────────────────────────
  // STAFF RATING
  // ─────────────────────────────────────────────

  if (commandName === 'ranking-staff') {
    const top = options.getInteger('top') || 5;
    const ranking = getRankingStaff(guild.id);
    if (!ranking.length) return interaction.reply({
      content: '❌ Ainda não há avaliações de staff neste servidor.',
      ephemeral: true
    });
    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const descricao = ranking.slice(0, top).map((r, i) => `${emojis[i] || `**${i + 1}.**`} <@${r.staff_id}>\n⭐ Média: **${parseFloat(r.media).toFixed(1)}/5** | 📊 Avaliações: **${r.total}**`).join('\n\n');
    const embed = embedPadrao('⭐ Ranking de Staff', descricao, '#FFD700');
    return interaction.reply({
      embeds: [embed]
    });
  }
  if (commandName === 'avaliar-staff') {
    const staff = options.getUser('staff');
    if (staff.id === user.id) return interaction.reply({
      content: '❌ Não podes avaliar-te a ti próprio.',
      ephemeral: true
    });
    if (staff.bot) return interaction.reply({
      content: '❌ Não podes avaliar um bot.',
      ephemeral: true
    });

    // Publica a avaliação no mesmo canal onde o comando foi usado
    const modal = criarModalAvaliacao(staff.id, 0, interaction.channel.id);
    return interaction.showModal(modal);
  }
  if (commandName === 'historico-staff') {
    await interaction.deferReply({
      ephemeral: true
    });
    const staff = options.getUser('staff');
    const historico = await db.prepare(`
      SELECT * FROM staff_ratings WHERE guild_id = ? AND staff_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(guild.id, staff.id);
    if (!historico.length) return interaction.editReply({
      content: `❌ <@${staff.id}> não tem avaliações ainda.`
    });
    const stats = await db.prepare(`
      SELECT AVG(rating) as media, COUNT(*) as total, MIN(rating) as min, MAX(rating) as max
      FROM staff_ratings WHERE guild_id = ? AND staff_id = ?
    `).get(guild.id, staff.id);
    const estrelas = n => '⭐'.repeat(n) + '☆'.repeat(5 - n);
    const descricao = historico.map(r => `${estrelas(r.rating)} por <@${r.user_id}>\n↳ ${r.comment || '*Sem comentário*'}\n↳ <t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>`).join('\n\n');
    const embed = new EmbedBuilder().setTitle(`📊 Histórico de ${staff.tag}`).setDescription(descricao).setColor(CONFIG.COR_PRINCIPAL).setThumbnail(staff.displayAvatarURL()).addFields({
      name: '⭐ Média',
      value: `${parseFloat(stats.media).toFixed(2)}/5`,
      inline: true
    }, {
      name: '📊 Total',
      value: `${stats.total}`,
      inline: true
    }, {
      name: '📈 Min/Max',
      value: `${stats.min}⭐ / ${stats.max}⭐`,
      inline: true
    }).setTimestamp();
    return interaction.editReply({
      embeds: [embed]
    });
  }

  // ─────────────────────────────────────────────
  // SERVER STATS
  // ─────────────────────────────────────────────

  if (commandName === 'stats-setup') {
    await interaction.deferReply({
      ephemeral: true
    });
    let config = await db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guild.id);
    if (!config) {
      await db.prepare('INSERT INTO server_stats (guild_id) VALUES (?)').run(guild.id);
      config = await db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guild.id);
    }
    await db.prepare('UPDATE server_stats SET enabled = 1 WHERE guild_id = ?').run(guild.id);
    await setupServerStats(guild, config);
    return interaction.editReply({
      content: '✅ Canais de estatísticas criados/atualizados com sucesso!'
    });
  }
  if (commandName === 'stats-atualizar') {
    await interaction.deferReply({
      ephemeral: true
    });
    await atualizarStats(guild);
    return interaction.editReply({
      content: '✅ Estatísticas atualizadas!'
    });
  }
  if (commandName === 'stats-desativar') {
    const config = await db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guild.id);
    await db.prepare('UPDATE server_stats SET enabled = 0 WHERE guild_id = ?').run(guild.id);
    if (config) await apagarCanaisServerStats(guild, config).catch(() => {});
    return interaction.reply({
      content: '✅ Sistema de estatísticas desativado e canais removidos.',
      ephemeral: true
    });
  }

  // ─────────────────────────────────────────────
  // REACTION ROLES: geridos exclusivamente pelo Dashboard (sem comandos no Discord)
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // WELCOME
  // ─────────────────────────────────────────────

  if (commandName === 'welcome-setup') {
    const canal = options.getChannel('canal');
    const mensagem = options.getString('mensagem') || 'Bem-vindo(a) {user} ao **{server}**! 🎉 És o membro número **{count}**!';
    const titulo = options.getString('titulo') || '👋 Bem-vindo(a)!';
    const imagem = options.getString('imagem');
    const embed = options.getBoolean('embed') !== false;
    const autorole = options.getRole('autorole');
    await db.prepare(`
      INSERT INTO guild_config (guild_id, welcome_channel, welcome_title, welcome_msg, welcome_embed, welcome_image, autorole)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        welcome_channel=excluded.welcome_channel,
        welcome_title=excluded.welcome_title,
        welcome_msg=excluded.welcome_msg,
        welcome_embed=excluded.welcome_embed,
        welcome_image=excluded.welcome_image,
        autorole=excluded.autorole
    `).run(guild.id, canal.id, titulo, mensagem, embed ? 1 : 0, imagem || null, autorole?.id || null);
    return interaction.reply({
      content: `✅ Boas-vindas configuradas!\n**Canal:** ${canal}\n**Título:** ${titulo}\n**Imagem:** ${imagem ? 'Sim' : 'Não'}\n**Autorole:** ${autorole || 'Nenhum'}\n**Embed:** ${embed ? 'Sim' : 'Não'}`,
      ephemeral: true
    });
  }
  if (commandName === 'welcome-desativar') {
    await db.prepare('UPDATE guild_config SET welcome_channel = NULL WHERE guild_id = ?').run(guild.id);
    return interaction.reply({
      content: '✅ Sistema de boas-vindas desativado.',
      ephemeral: true
    });
  }
  if (commandName === 'welcome-testar') {
    await interaction.deferReply({
      ephemeral: true
    });
    await sendWelcome(member);
    return interaction.editReply({
      content: '✅ Mensagem de boas-vindas enviada como teste!'
    });
  }

  // ─────────────────────────────────────────────
  // EMBEDS
  // ─────────────────────────────────────────────

  if (commandName === 'embed-criar') {
    const titulo = options.getString('titulo');
    const descricao = options.getString('descricao');
    const cor = options.getString('cor') || CONFIG.COR_PRINCIPAL;
    const imagem = options.getString('imagem');
    const thumbnail = options.getString('thumbnail');
    const footer = options.getString('footer');
    const mensagem = options.getString('mensagem');
    const canal = options.getChannel('canal') || interaction.channel;
    const embed = new EmbedBuilder().setTitle(titulo).setDescription(descricao).setColor(cor).setTimestamp();
    if (imagem) embed.setImage(imagem);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (footer) embed.setFooter({
      text: footer
    });
    await interaction.deferReply({
      ephemeral: true
    });
    await canal.send({
      content: mensagem || undefined,
      embeds: [embed]
    });
    return interaction.editReply({
      content: `✅ Embed enviado em ${canal}!`
    });
  }
  if (commandName === 'embed-guardar') {
    const nome = options.getString('nome');
    const titulo = options.getString('titulo');
    const descricao = options.getString('descricao');
    const cor = options.getString('cor') || CONFIG.COR_PRINCIPAL;
    const imagem = options.getString('imagem');
    const thumbnail = options.getString('thumbnail');
    const footer = options.getString('footer');
    const mensagem = options.getString('mensagem');
    const data = JSON.stringify({
      title: titulo,
      description: descricao,
      color: cor,
      image: imagem || null,
      thumbnail: thumbnail || null,
      footer: footer || null,
      content: mensagem || null
    });
    await db.prepare(`
      INSERT INTO saved_embeds (guild_id, name, data, created_by)
      VALUES (?, ?, ?, ?)
    `).run(guild.id, nome, data, user.id);
    return interaction.reply({
      content: `✅ Embed **${nome}** guardado!`,
      ephemeral: true
    });
  }
  if (commandName === 'embed-enviar') {
    const nome = options.getString('nome');
    const canal = options.getChannel('canal') || interaction.channel;
    const saved = await db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? AND name = ?').get(guild.id, nome);
    if (!saved) return interaction.reply({
      content: `❌ Embed **${nome}** não encontrado.`,
      ephemeral: true
    });
    const data = JSON.parse(saved.data);
    const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp();
    if (data.image) embed.setImage(data.image);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.footer) embed.setFooter({
      text: data.footer
    });
    await interaction.deferReply({
      ephemeral: true
    });
    await canal.send({
      content: data.content || undefined,
      embeds: [embed]
    });
    return interaction.editReply({
      content: `✅ Embed enviado em ${canal}!`
    });
  }
  if (commandName === 'embed-lista') {
    const embeds = await db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC').all(guild.id);
    if (!embeds.length) return interaction.reply({
      content: '❌ Não há embeds guardados.',
      ephemeral: true
    });
    const embed = embedPadrao('📋 Embeds Guardados', embeds.map((e, i) => `**${i + 1}.** \`${e.name}\` — por <@${e.created_by}>`).join('\n'));
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }

  // ─────────────────────────────────────────────
  // PERGUNTAS À COMUNIDADE
  // ─────────────────────────────────────────────

  if (commandName === 'pergunta') {
    const canal = options.getChannel('canal');
    const conteudo = options.getString('pergunta');
    const mensagemExtra = options.getString('mensagem');
    await interaction.deferReply({
      ephemeral: true
    });
    const resultado = await enviarPergunta(guild, canal, conteudo, interaction.user.id, mensagemExtra);
    if (!resultado.ok) return interaction.editReply({
      content: `❌ ${resultado.message}`
    });
    return interaction.editReply({
      content: `✅ Pergunta enviada em ${canal}! Tópico criado para respostas.`
    });
  }

  // ─────────────────────────────────────────────
  // SUGESTÕES
  // ─────────────────────────────────────────────

  if (commandName === 'sugestao-tipo-criar') {
    const nome = options.getString('nome').trim();
    const canal = options.getChannel('canal');
    const emoji = options.getString('emoji') || '💡';
    const log = options.getChannel('log');
    const ping = options.getRole('ping');
    const existente = await db.prepare('SELECT id FROM suggestion_types WHERE guild_id = ? AND name = ?').get(guild.id, nome);
    if (existente) return interaction.reply({
      content: `❌ Já existe um tipo de sugestão chamado **${nome}**.`,
      ephemeral: true
    });
    const {
      c: total
    } = await db.prepare('SELECT COUNT(*) AS c FROM suggestion_types WHERE guild_id = ?').get(guild.id);
    await db.prepare(`
      INSERT INTO suggestion_types (guild_id, name, emoji, channel_id, log_channel, ping_role, enabled, order_num)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(guild.id, nome, emoji, canal.id, log?.id || null, ping?.id || null, total);
    return interaction.reply({
      content: `✅ Tipo de sugestão **${emoji} ${nome}** criado!\n**Canal:** ${canal}\n**Log:** ${log || 'Não definido'}\n**Ping:** ${ping || 'Nenhum'}\n\nAgora quem usar \`/sugerir\` pode escolher este tipo.`,
      ephemeral: true
    });
  }
  if (commandName === 'sugestao-tipo-apagar') {
    const nome = options.getString('nome').trim();
    const tipo = await db.prepare('SELECT * FROM suggestion_types WHERE guild_id = ? AND name = ?').get(guild.id, nome);
    if (!tipo) return interaction.reply({
      content: `❌ Não encontrei nenhum tipo de sugestão chamado **${nome}**.`,
      ephemeral: true
    });
    await db.prepare('DELETE FROM suggestion_types WHERE id = ?').run(tipo.id);
    // As sugestões já submetidas ficam com type_id "órfão" mas continuam intactas no histórico
    return interaction.reply({
      content: `✅ Tipo de sugestão **${nome}** apagado.`,
      ephemeral: true
    });
  }
  if (commandName === 'sugestao-tipo-lista') {
    const tipos = await db.prepare('SELECT * FROM suggestion_types WHERE guild_id = ? ORDER BY order_num, id').all(guild.id);
    if (!tipos.length) return interaction.reply({
      content: 'ℹ️ Ainda não há nenhum tipo de sugestão configurado. Usa `/sugestao-tipo-criar` para criares o primeiro.',
      ephemeral: true
    });
    const embed = new EmbedBuilder().setTitle('📋 Tipos de Sugestão').setColor(CONFIG.COR_PRINCIPAL).setDescription(tipos.map(t => `${t.emoji || '💡'} **${t.name}** ${t.enabled ? '' : '*(desativado)*'} — <#${t.channel_id}>` + (t.log_channel ? ` · log: <#${t.log_channel}>` : '') + (t.ping_role ? ` · ping: <@&${t.ping_role}>` : '')).join('\n'));
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  if (commandName === 'sugerir') {
    const nomeTipo = options.getString('tipo').trim();
    const tipo = await db.prepare('SELECT * FROM suggestion_types WHERE guild_id = ? AND name = ? AND enabled = 1').get(guild.id, nomeTipo);
    if (!tipo) return interaction.reply({
      content: `❌ Tipo de sugestão **${nomeTipo}** não encontrado ou desativado. Usa \`/sugestao-tipo-lista\` para veres os tipos disponíveis.`,
      ephemeral: true
    });
    const conteudo = options.getString('sugestao');
    const canal = guild.channels.cache.get(tipo.channel_id);
    if (!canal) return interaction.reply({
      content: '❌ Canal deste tipo de sugestão não encontrado.',
      ephemeral: true
    });

    // Número da sugestão específico deste servidor (não é partilhado com outros servidores)
    const {
      c: totalNesteServidor
    } = await db.prepare('SELECT COUNT(*) as c FROM suggestions WHERE guild_id = ?').get(guild.id);
    const guildSeq = totalNesteServidor + 1;

    // Insere na BD (sem message_id ainda)
    const stmt = db.prepare(`
      INSERT INTO suggestions (guild_id, channel_id, user_id, content, guild_seq, type_id) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = await stmt.run(guild.id, canal.id, user.id, conteudo, guildSeq, tipo.id);
    const sugId = info.lastInsertRowid;
    const embed = new EmbedBuilder().setTitle(`${tipo.emoji || '💡'} ${tipo.name} #${guildSeq}`).setDescription(conteudo).setColor(CONFIG.COR_AVISO).setAuthor({
      name: user.tag,
      iconURL: user.displayAvatarURL()
    }).addFields({
      name: '👍 Votos positivos',
      value: '0',
      inline: true
    }, {
      name: '👎 Votos negativos',
      value: '0',
      inline: true
    }, {
      name: '📊 Estado',
      value: '🕐 Pendente',
      inline: true
    }).setTimestamp();
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sug_up_${sugId}`).setLabel('👍 0').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`sug_down_${sugId}`).setLabel('👎 0').setStyle(ButtonStyle.Danger));
    const content = tipo.ping_role ? `<@&${tipo.ping_role}>` : undefined;
    const msg = await canal.send({
      content,
      embeds: [embed],
      components: [row],
      allowedMentions: {
        roles: tipo.ping_role ? [tipo.ping_role] : []
      }
    });
    await db.prepare('UPDATE suggestions SET message_id = ? WHERE id = ?').run(msg.id, sugId);
    return interaction.reply({
      content: `✅ ${tipo.emoji || '💡'} ${tipo.name} #${guildSeq} submetida com sucesso!`,
      ephemeral: true
    });
  }
  if (commandName === 'sugestao-responder') {
    const id = options.getInteger('id');
    const acao = options.getString('acao');
    const resposta = options.getString('resposta') || 'Sem resposta adicional.';

    // Procura pelo número da sugestão DESTE servidor (guild_seq), nunca de outro servidor
    const sug = await db.prepare('SELECT * FROM suggestions WHERE guild_seq = ? AND guild_id = ?').get(id, guild.id);
    if (!sug) return interaction.reply({
      content: `❌ Sugestão #${id} não encontrada.`,
      ephemeral: true
    });
    const statusMap = {
      approve: {
        label: '✅ Aprovada',
        color: CONFIG.COR_SUCESSO
      },
      reject: {
        label: '❌ Rejeitada',
        color: CONFIG.COR_ERRO
      },
      consider: {
        label: '🤔 Em Consideração',
        color: CONFIG.COR_AVISO
      }
    };
    const s = statusMap[acao];

    // Usa sempre o id interno (sug.id) para não alterar sugestões de outro servidor por engano
    await db.prepare('UPDATE suggestions SET status = ?, mod_response = ? WHERE id = ?').run(acao, resposta, sug.id);
    const canal = guild.channels.cache.get(sug.channel_id);
    if (canal && sug.message_id) {
      try {
        const msg = await canal.messages.fetch(sug.message_id);
        const oldEmbed = msg.embeds[0];
        const embed = EmbedBuilder.from(oldEmbed).setColor(s.color).spliceFields(2, 1, {
          name: '📊 Estado',
          value: s.label,
          inline: true
        }).addFields({
          name: '💬 Resposta da Moderação',
          value: `> ${resposta}\n— <@${user.id}>`
        });
        await msg.edit({
          embeds: [embed],
          components: []
        });
      } catch (_) {}
    }

    // Envia também para o canal de log do tipo de sugestão, se estiver definido
    if (sug.type_id) {
      const tipo = await db.prepare('SELECT * FROM suggestion_types WHERE id = ?').get(sug.type_id);
      if (tipo?.log_channel) {
        const canalLog = guild.channels.cache.get(tipo.log_channel);
        if (canalLog) {
          const logEmbed = new EmbedBuilder().setTitle(`${tipo.emoji || '💡'} ${tipo.name} #${id} — ${s.label}`).setDescription(sug.content).addFields({
            name: '💬 Resposta',
            value: resposta
          }).setColor(s.color).setFooter({
            text: `Respondido por ${user.tag}`
          }).setTimestamp();
          await canalLog.send({
            embeds: [logEmbed]
          }).catch(() => {});
        }
      }
    }
    return interaction.reply({
      content: `✅ Sugestão #${id} marcada como **${s.label}**.`,
      ephemeral: true
    });
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
    if (!target) return interaction.reply({
      content: '❌ Utilizador não encontrado.',
      ephemeral: true
    });
    if (target.id === user.id) return interaction.reply({
      content: '❌ Não te podes banir a ti próprio.',
      ephemeral: true
    });
    if (!target.bannable) return interaction.reply({
      content: '❌ Não tenho permissão para banir este utilizador.',
      ephemeral: true
    });
    await interaction.deferReply();
    await target.ban({
      reason: motivo,
      deleteMessageSeconds: dias * 86400
    });
    logMod(guild.id, 'BAN', target.id, user.id, motivo);
    const embed = embedLogModeracao({
      titulo: '🔨 Utilizador Banido',
      cor: CONFIG.COR_ERRO,
      alvo: target,
      moderador: user,
      motivo,
      canal: interaction.channel,
      camposExtra: [{
        name: '🗑️ Mensagens Apagadas',
        value: `Últimos ${dias} dia(s)`,
        inline: true
      }]
    });
    await sendLogTyped(guild, 'ban', embed);
    return interaction.editReply({
      embeds: [embed]
    });
  }
  if (commandName === 'unban') {
    const targetId = options.getString('id');
    const motivo = options.getString('motivo') || 'Sem motivo especificado';
    await interaction.deferReply();
    try {
      await guild.members.unban(targetId, motivo);
      logMod(guild.id, 'UNBAN', targetId, user.id, motivo);
      const embed = embedLogModeracao({
        titulo: '✅ Ban Removido',
        cor: CONFIG.COR_SUCESSO,
        alvoIdManual: targetId,
        moderador: user,
        motivo,
        canal: interaction.channel
      });
      await sendLogTyped(guild, 'unban', embed);
      return interaction.editReply({
        embeds: [embed]
      });
    } catch (e) {
      return interaction.editReply({
        content: `❌ Não foi possível remover o ban: ${e.message}`
      });
    }
  }
  if (commandName === 'blacklist-add') {
    const usernameInput = options.getString('username').trim().replace(/^@/, '').toLowerCase();
    const motivo = options.getString('motivo') || 'Sem motivo especificado';
    await interaction.deferReply();
    try {
      await db.prepare('INSERT INTO blacklist (guild_id, user_id, username, reason, added_by) VALUES (?, NULL, ?, ?, ?)').run(guild.id, usernameInput, motivo, user.id);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return interaction.editReply({
          content: `⚠️ **${usernameInput}** já está na blacklist deste servidor.`
        });
      }
      return interaction.editReply({
        content: `❌ Erro ao guardar na blacklist: ${e.message}`
      });
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
        return interaction.editReply({
          content: '❌ Não te podes adicionar a ti próprio à blacklist.'
        });
      }
      if (membroEncontrado.bannable) {
        await membroEncontrado.ban({
          reason: `Blacklist: ${motivo}`,
          deleteMessageSeconds: 7 * 86400
        }).catch(() => {});
        jaBanido = true;
        // Guarda o ID para referência futura (ex: /blacklist-remove por ID)
        await db.prepare('UPDATE blacklist SET user_id = ? WHERE guild_id = ? AND username = ?').run(membroEncontrado.id, guild.id, usernameInput);
      }
    }
    logMod(guild.id, 'BLACKLIST-ADD', membroEncontrado?.id || usernameInput, user.id, motivo);
    const embed = embedLogModeracao({
      titulo: '🚫 Utilizador Adicionado à Blacklist',
      cor: CONFIG.COR_ERRO,
      alvo: membroEncontrado || null,
      alvoIdManual: membroEncontrado?.id || null,
      moderador: user,
      motivo,
      canal: interaction.channel,
      camposExtra: [{
        name: 'ℹ️ Username na Blacklist',
        value: `\`${usernameInput}\``,
        inline: false
      }],
      descricaoExtra: jaBanido ? '⚠️ Este utilizador já estava no servidor e foi banido agora.' : '✅ Se uma conta com este username entrar no servidor, será banida automaticamente — mesmo que nunca tenha estado aqui antes.'
    });
    await sendLogTyped(guild, 'blacklist', embed);
    return interaction.editReply({
      embeds: [embed]
    });
  }
  if (commandName === 'blacklist-remove') {
    const inputRaw = options.getString('id').trim().replace(/^@/, '');
    const isId = /^\d{15,25}$/.test(inputRaw);
    const res = isId ? await db.prepare('DELETE FROM blacklist WHERE guild_id = ? AND user_id = ?').run(guild.id, inputRaw) : await db.prepare('DELETE FROM blacklist WHERE guild_id = ? AND username = ?').run(guild.id, inputRaw.toLowerCase());
    if (res.changes === 0) return interaction.reply({
      content: `⚠️ \`${inputRaw}\` não estava na blacklist.`,
      ephemeral: true
    });
    logMod(guild.id, 'BLACKLIST-REMOVE', inputRaw, user.id, 'Removido da blacklist');
    return interaction.reply({
      content: `✅ \`${inputRaw}\` removido da blacklist.`,
      ephemeral: true
    });
  }
  if (commandName === 'blacklist-lista') {
    const lista = await db.prepare('SELECT * FROM blacklist WHERE guild_id = ? ORDER BY created_at DESC LIMIT 25').all(guild.id);
    if (!lista.length) return interaction.reply({
      content: '✅ A blacklist deste servidor está vazia.',
      ephemeral: true
    });
    const embed = embedPadrao('🚫 Blacklist do Servidor', lista.map(b => `**${b.username}**${b.user_id ? ` (\`${b.user_id}\`)` : ' (nunca visto no servidor)'}\n↳ Motivo: ${b.reason} — por <@${b.added_by}>`).join('\n\n'));
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  if (commandName === 'kick') {
    const target = options.getMember('utilizador');
    const motivo = options.getString('motivo') || 'Sem motivo especificado';
    if (!target?.kickable) return interaction.reply({
      content: '❌ Não posso expulsar este utilizador.',
      ephemeral: true
    });
    await interaction.deferReply();
    await target.kick(motivo);
    logMod(guild.id, 'KICK', target.id, user.id, motivo);
    const embed = embedLogModeracao({
      titulo: '👢 Utilizador Expulso',
      cor: CONFIG.COR_ERRO,
      alvo: target,
      moderador: user,
      motivo,
      canal: interaction.channel
    });
    await sendLogTyped(guild, 'kick', embed);
    return interaction.editReply({
      embeds: [embed]
    });
  }
  if (commandName === 'timeout') {
    const target = options.getMember('utilizador');
    const durStr = options.getString('duracao');
    const motivo = options.getString('motivo') || 'Sem motivo especificado';
    const durMs = parseDuration(durStr);
    if (!durMs) return interaction.reply({
      content: '❌ Formato de duração inválido. Usa: `10m`, `2h`, `1d`',
      ephemeral: true
    });
    if (!target?.moderatable) return interaction.reply({
      content: '❌ Não posso silenciar este utilizador.',
      ephemeral: true
    });
    await interaction.deferReply();
    await target.timeout(durMs, motivo);
    logMod(guild.id, 'TIMEOUT', target.id, user.id, motivo, durStr);
    const embed = embedLogModeracao({
      titulo: '🔇 Utilizador Silenciado',
      cor: CONFIG.COR_AVISO,
      alvo: target,
      moderador: user,
      motivo,
      duracao: formatDuration(durMs),
      canal: interaction.channel
    });
    await sendLogTyped(guild, 'timeout', embed);
    return interaction.editReply({
      embeds: [embed]
    });
  }
  if (commandName === 'untimeout') {
    const target = options.getMember('utilizador');
    const motivo = options.getString('motivo') || 'Sem motivo especificado';
    if (!target) return interaction.reply({
      content: '❌ Utilizador não encontrado.',
      ephemeral: true
    });
    await interaction.deferReply();
    await target.timeout(null, motivo);
    logMod(guild.id, 'UNTIMEOUT', target.id, user.id, motivo);
    const embed = embedLogModeracao({
      titulo: '🔊 Silêncio Removido',
      cor: CONFIG.COR_SUCESSO,
      alvo: target,
      moderador: user,
      motivo,
      canal: interaction.channel
    });
    await sendLogTyped(guild, 'timeout', embed);
    return interaction.editReply({
      embeds: [embed]
    });
  }
  if (commandName === 'warn') {
    const target = options.getMember('utilizador');
    const motivo = options.getString('motivo');
    if (!target) return interaction.reply({
      content: '❌ Utilizador não encontrado.',
      ephemeral: true
    });
    await interaction.deferReply();
    await db.prepare('INSERT INTO warns (guild_id, user_id, mod_id, reason) VALUES (?, ?, ?, ?)').run(guild.id, target.id, user.id, motivo);
    const total = (await db.prepare('SELECT COUNT(*) as c FROM warns WHERE guild_id = ? AND user_id = ?').get(guild.id, target.id)).c;
    logMod(guild.id, 'WARN', target.id, user.id, motivo);
    const embed = embedLogModeracao({
      titulo: '⚠️ Utilizador Avisado',
      cor: CONFIG.COR_AVISO,
      alvo: target,
      moderador: user,
      motivo,
      canal: interaction.channel,
      camposExtra: [{
        name: '📊 Total de Avisos',
        value: `${total}`,
        inline: true
      }]
    });
    await sendLogTyped(guild, 'warn', embed);

    // DM ao utilizador
    try {
      await target.send({
        embeds: [embedPadrao('⚠️ Recebeste um aviso', `**Servidor:** ${guild.name}\n**Motivo:** ${motivo}\n**Avisos totais:** ${total}`, CONFIG.COR_AVISO)]
      });
    } catch (_) {}
    return interaction.editReply({
      embeds: [embed]
    });
  }
  if (commandName === 'warns') {
    const target = options.getMember('utilizador') || member;
    const avisos = await db.prepare('SELECT * FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 10').all(guild.id, target.id);
    if (!avisos.length) return interaction.reply({
      content: `✅ ${target} não tem avisos.`,
      ephemeral: true
    });
    const embed = embedPadrao(`⚠️ Avisos de ${target.user.tag}`, avisos.map((w, i) => `**#${i + 1}** — ${w.reason}\n↳ Por <@${w.mod_id}> em <t:${Math.floor(new Date(w.created_at).getTime() / 1000)}:d>`).join('\n\n'));
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  if (commandName === 'clearwarns') {
    const target = options.getMember('utilizador');
    const res = await db.prepare('DELETE FROM warns WHERE guild_id = ? AND user_id = ?').run(guild.id, target.id);
    return interaction.reply({
      content: `✅ **${res.changes}** aviso(s) removido(s) de ${target}.`,
      ephemeral: true
    });
  }
  if (commandName === 'limpar') {
    const quantidade = options.getInteger('quantidade');
    const utilizador = options.getUser('utilizador');
    await interaction.deferReply({
      ephemeral: true
    });
    let msgs = await interaction.channel.messages.fetch({
      limit: 100
    });
    if (utilizador) msgs = msgs.filter(m => m.author.id === utilizador.id);
    msgs = [...msgs.values()].slice(0, quantidade);
    const apagadas = await interaction.channel.bulkDelete(msgs, true);
    logMod(guild.id, 'CLEAR', utilizador?.id || interaction.channel.id, user.id, `${apagadas.size} mensagem(ns) apagada(s)`);
    const embed = embedLogModeracao({
      titulo: '🗑️ Mensagens Apagadas',
      cor: CONFIG.COR_SUCESSO,
      alvo: utilizador || null,
      moderador: user,
      canal: interaction.channel,
      camposExtra: [{
        name: '🔢 Quantidade',
        value: `${apagadas.size} mensagem(ns)`,
        inline: true
      }]
    });
    await sendLogTyped(guild, 'clear', embed);
    return interaction.editReply({
      embeds: [embed]
    });
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
      const modal = new ModalBuilder().setCustomId('votacao_setup_modal_recorrente').setTitle('🗳️ Votação Recorrente (diária)');
      const tituloInput = new TextInputBuilder().setCustomId('votacao_titulo').setLabel('Título da votação').setPlaceholder('Ex: Votação do Dia').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200);
      const descricaoInput = new TextInputBuilder().setCustomId('votacao_descricao').setLabel('Descrição da votação').setPlaceholder('Ex: Vota na tua opção favorita do dia!').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
      const opcoesInput = new TextInputBuilder().setCustomId('votacao_opcoes').setLabel('Opções dos botões (separadas por vírgula)').setPlaceholder('Ex: Opção A, Opção B, Opção C (máx. 10)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
      const horaInicioInput = new TextInputBuilder().setCustomId('votacao_hora_inicio').setLabel('Hora de início (formato 24h HH:MM)').setPlaceholder('Ex: 12:00').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(5);
      const horaFimInput = new TextInputBuilder().setCustomId('votacao_hora_fim').setLabel('Hora de fim (formato 24h HH:MM)').setPlaceholder('Ex: 20:30').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(5);
      modal.addComponents(new ActionRowBuilder().addComponents(tituloInput), new ActionRowBuilder().addComponents(descricaoInput), new ActionRowBuilder().addComponents(opcoesInput), new ActionRowBuilder().addComponents(horaInicioInput), new ActionRowBuilder().addComponents(horaFimInput));
      return interaction.showModal(modal);
    }

    // modo === 'unica'
    const modal = new ModalBuilder().setCustomId('votacao_setup_modal_unica').setTitle('🗳️ Votação de Um Dia Único');
    const tituloInput = new TextInputBuilder().setCustomId('votacao_titulo').setLabel('Título da votação').setPlaceholder('Ex: Votação Especial').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200);
    const descricaoInput = new TextInputBuilder().setCustomId('votacao_descricao').setLabel('Descrição da votação').setPlaceholder('Ex: Vota na tua opção favorita!').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
    const opcoesInput = new TextInputBuilder().setCustomId('votacao_opcoes').setLabel('Opções dos botões (separadas por vírgula)').setPlaceholder('Ex: Opção A, Opção B, Opção C (máx. 10)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
    const dataFimInput = new TextInputBuilder().setCustomId('votacao_data_fim').setLabel('Data em que fecha (formato DD/MM/AAAA)').setPlaceholder('Ex: 20/07/2026').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(8).setMaxLength(10);
    const horaFimInput = new TextInputBuilder().setCustomId('votacao_hora_fim').setLabel('Hora em que fecha (formato 24h HH:MM)').setPlaceholder('Ex: 20:30').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(5);
    modal.addComponents(new ActionRowBuilder().addComponents(tituloInput), new ActionRowBuilder().addComponents(descricaoInput), new ActionRowBuilder().addComponents(opcoesInput), new ActionRowBuilder().addComponents(dataFimInput), new ActionRowBuilder().addComponents(horaFimInput));
    return interaction.showModal(modal);
  }
  if (commandName === 'remover-votação') {
    const existente = await db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guild.id);
    if (!existente) {
      return interaction.reply({
        content: '❌ Não há nenhuma votação configurada neste servidor.',
        ephemeral: true
      });
    }
    await db.prepare('DELETE FROM votacao_config WHERE guild_id = ?').run(guild.id);
    await db.prepare('DELETE FROM votacao_votos WHERE guild_id = ?').run(guild.id);
    return interaction.reply({
      content: '✅ Votação removida com sucesso. Não será mais publicada nem contabilizada.',
      ephemeral: true
    });
  }

  // ─────────────────────────────────────────────
  // CARGOS
  // ─────────────────────────────────────────────

  if (commandName === 'role-add-remove') {
    await interaction.deferReply({
      ephemeral: true
    });
    const alvo = options.getUser('utilizador');
    const cargoAdd = options.getRole('adicionar');
    const cargoRem = options.getRole('remover');
    if (cargoAdd.id === cargoRem.id) {
      return interaction.editReply({
        content: '❌ O cargo a adicionar e o cargo a remover não podem ser o mesmo.'
      });
    }
    const membroAlvo = await guild.members.fetch(alvo.id).catch(() => null);
    if (!membroAlvo) {
      return interaction.editReply({
        content: '❌ Não encontrei esse utilizador neste servidor.'
      });
    }
    try {
      await membroAlvo.roles.add(cargoAdd);
      await membroAlvo.roles.remove(cargoRem);
    } catch (err) {
      return interaction.editReply({
        content: `❌ Não consegui alterar os cargos: ${err.message}\n👉 Verifica se o cargo do bot está acima dos cargos ${cargoAdd} e ${cargoRem}.`
      });
    }
    const embed = embedPadrao('🎭 Cargos Atualizados', `**Utilizador:** ${membroAlvo}\n✅ **Adicionado:** ${cargoAdd}\n❌ **Removido:** ${cargoRem}\n👮 **Por:** ${user}`, CONFIG.COR_SUCESSO);
    await sendLogTyped(guild, 'blacklist', embed);
    return interaction.editReply({
      content: `✅ Cargo ${cargoAdd} adicionado e cargo ${cargoRem} removido de ${membroAlvo}.`
    });
  }
  if (commandName === 'painel-criar') {
    const nome = options.getString('nome').trim();
    const canal = options.getChannel('canal') || interaction.channel;
    const cor = options.getString('cor') || CONFIG.COR_PRINCIPAL;
    if (cor && !/^#([0-9A-Fa-f]{6})$/.test(cor)) {
      return interaction.reply({
        content: '❌ Cor inválida. Usa o formato hex, ex: `#5865F2`.',
        ephemeral: true
      });
    }
    const existente = await db.prepare('SELECT id FROM info_panels WHERE guild_id = ? AND name = ?').get(guild.id, nome);
    if (existente) {
      return interaction.reply({
        content: `❌ Já existe um painel chamado **${nome}** neste servidor. Escolhe outro nome ou apaga-o primeiro com /painel-apagar.`,
        ephemeral: true
      });
    }
    const info = await db.prepare(`
      INSERT INTO info_panels (guild_id, name, title, description, color, banner_url, thumbnail_url, footer_text, owner_text, founded_text, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guild.id, nome, options.getString('titulo') || null, options.getString('descricao') || null, cor, options.getString('banner') || null, options.getString('thumbnail') || null, options.getString('rodape') || null, options.getString('dono') || null, options.getString('fundado') || null, user.id);

    // Guarda o canal, mas não publica já — fica em rascunho até se adicionarem
    // os botões e se usar /painel-publicar. Evita que a mensagem fique "(editado)".
    await db.prepare('UPDATE info_panels SET channel_id = ? WHERE id = ?').run(canal.id, info.lastInsertRowid);
    return interaction.reply({
      content: `✅ Painel **${nome}** criado! Usa \`/painel-botao-add painel:${nome}\` para adicionares botões e depois \`/painel-publicar painel:${nome}\` para publicares em <#${canal.id}> (as respostas dos botões só aparecem para quem clicar).`,
      ephemeral: true
    });
  }
  if (commandName === 'painel-publicar') {
    const nome = options.getString('painel').trim();
    const panel = await db.prepare('SELECT * FROM info_panels WHERE guild_id = ? AND name = ?').get(guild.id, nome);
    if (!panel) return interaction.reply({
      content: `❌ Não encontrei nenhum painel chamado **${nome}**. Usa \`/painel-lista\` para veres os nomes disponíveis.`,
      ephemeral: true
    });
    if (!panel.channel_id) return interaction.reply({
      content: '❌ Este painel não tem canal definido.',
      ephemeral: true
    });
    const canal = guild.channels.cache.get(panel.channel_id);
    if (!canal) return interaction.reply({
      content: '❌ O canal deste painel já não existe.',
      ephemeral: true
    });
    const embed = embedInfoPanel(panel);
    const botoes = await db.prepare('SELECT * FROM info_panel_buttons WHERE panel_id = ? ORDER BY order_num, id').all(panel.id);
    const rows = botoesInfoPanel(panel.id, botoes);
    if (panel.published && panel.message_id) {
      const antiga = await canal.messages.fetch(panel.message_id).catch(() => null);
      if (antiga) await antiga.delete().catch(() => {});
    }
    const msg = await canal.send({
      embeds: [embed],
      components: rows
    }).catch(() => null);
    if (!msg) {
      return interaction.reply({
        content: '❌ Não foi possível publicar o painel nesse canal (verifica as permissões do bot).',
        ephemeral: true
      });
    }
    await db.prepare('UPDATE info_panels SET message_id = ?, published = 1 WHERE id = ?').run(msg.id, panel.id);
    return interaction.reply({
      content: `✅ Painel **${nome}** publicado em <#${canal.id}>!`,
      ephemeral: true
    });
  }
  if (commandName === 'painel-botao-add') {
    const nome = options.getString('painel').trim();
    const panel = await db.prepare('SELECT * FROM info_panels WHERE guild_id = ? AND name = ?').get(guild.id, nome);
    if (!panel) return interaction.reply({
      content: `❌ Não encontrei nenhum painel chamado **${nome}**. Usa \`/painel-lista\` para veres os nomes disponíveis.`,
      ephemeral: true
    });
    const contagem = (await db.prepare('SELECT COUNT(*) AS c FROM info_panel_buttons WHERE panel_id = ?').get(panel.id)).c;
    if (contagem >= 25) {
      return interaction.reply({
        content: '❌ Este painel já tem o máximo de 25 botões.',
        ephemeral: true
      });
    }
    const label = options.getString('label').trim();
    const resposta = options.getString('resposta');
    const emoji = options.getString('emoji') || null;
    const estilo = options.getString('estilo') || 'Primary';
    const respTitulo = options.getString('resposta-titulo') || null;
    const respImagem = options.getString('resposta-imagem') || null;
    const respThumb = options.getString('resposta-thumbnail') || null;
    const respCor = options.getString('resposta-cor') || null;
    if (respCor && !/^#([0-9A-Fa-f]{6})$/.test(respCor)) {
      return interaction.reply({
        content: '❌ Cor da resposta inválida. Usa o formato hex, ex: `#5865F2`.',
        ephemeral: true
      });
    }
    const info = await db.prepare(`
      INSERT INTO info_panel_buttons (panel_id, label, emoji, style, response_text, response_title, response_image, response_thumbnail, response_color, order_num)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(panel.id, label, emoji, estilo, resposta, respTitulo, respImagem, respThumb, respCor, contagem);

    // Só atualiza a mensagem se o painel já estiver publicado (senão fica em rascunho)
    if (panel.published && panel.message_id && panel.channel_id) {
      const canalMsg = guild.channels.cache.get(panel.channel_id);
      const msg = canalMsg ? await canalMsg.messages.fetch(panel.message_id).catch(() => null) : null;
      if (msg) {
        const botoes = await db.prepare('SELECT * FROM info_panel_buttons WHERE panel_id = ? ORDER BY order_num, id').all(panel.id);
        const rows = botoesInfoPanel(panel.id, botoes);
        await msg.edit({
          embeds: [embedInfoPanel(panel)],
          components: rows
        }).catch(() => {});
      }
    }
    return interaction.reply({
      content: `✅ Botão **${label}** adicionado ao painel **${nome}**! (id do botão: ${info.lastInsertRowid})`,
      ephemeral: true
    });
  }
  if (commandName === 'painel-lista') {
    const paineis = await db.prepare('SELECT * FROM info_panels WHERE guild_id = ? ORDER BY created_at DESC').all(guild.id);
    if (!paineis.length) return interaction.reply({
      content: 'ℹ️ Ainda não há nenhum painel de informação configurado. Usa `/painel-criar` para criares o primeiro.',
      ephemeral: true
    });
    const embed = new EmbedBuilder().setTitle('📋 Painéis de Informação').setColor(CONFIG.COR_PRINCIPAL).setDescription(paineis.map(async p => {
      const nBotoes = (await db.prepare('SELECT COUNT(*) AS c FROM info_panel_buttons WHERE panel_id = ?').get(p.id)).c;
      const estado = p.published ? '🟢 Publicado' : '🟡 Rascunho';
      return `**${p.name}** — ${estado} — ${p.channel_id ? `<#${p.channel_id}>` : '*sem canal*'} — ${nBotoes} botão(ões)`;
    }).join('\n'));
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  if (commandName === 'painel-apagar') {
    const nome = options.getString('painel').trim();
    const panel = await db.prepare('SELECT * FROM info_panels WHERE guild_id = ? AND name = ?').get(guild.id, nome);
    if (!panel) return interaction.reply({
      content: `❌ Não encontrei nenhum painel chamado **${nome}**.`,
      ephemeral: true
    });
    if (panel.message_id && panel.channel_id) {
      const canalMsg = guild.channels.cache.get(panel.channel_id);
      const msg = canalMsg ? await canalMsg.messages.fetch(panel.message_id).catch(() => null) : null;
      if (msg) await msg.delete().catch(() => {});
    }
    await db.prepare('DELETE FROM info_panel_buttons WHERE panel_id = ?').run(panel.id);
    await db.prepare('DELETE FROM info_panels WHERE id = ?').run(panel.id);
    return interaction.reply({
      content: `✅ Painel **${nome}** apagado.`,
      ephemeral: true
    });
  }
  if (commandName === 'giveaway-criar') {
    const premio = options.getString('premio');
    const duracaoStr = options.getString('duracao');
    const vencedores = options.getInteger('vencedores') || 1;
    const canal = options.getChannel('canal') || interaction.channel;
    const titulo = options.getString('titulo') || null;
    const descricao = options.getString('descricao') || null;
    const imagem = options.getString('imagem') || null;
    const mensagemExtra = options.getString('mensagem') || null;
    if (imagem && !/^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(imagem)) {
      return interaction.reply({
        content: '❌ URL de imagem inválido. Tem de ser um link direto (png, jpg, gif ou webp).',
        ephemeral: true
      });
    }
    const duracaoMs = parseDuracao(duracaoStr);
    if (!duracaoMs || duracaoMs < 60000) {
      return interaction.reply({
        content: '❌ Duração inválida. Usa um formato como `1m`, `10m`, `2h` ou `1d` (mínimo 1 minuto).',
        ephemeral: true
      });
    }
    const endsAt = new Date(Date.now() + duracaoMs);
    const endsAtISO = endsAt.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    const info = await db.prepare(`
      INSERT INTO giveaways (guild_id, channel_id, premio, vencedores, ends_at, host_id, titulo, descricao, imagem_url, mensagem_extra)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guild.id, canal.id, premio, vencedores, endsAtISO, user.id, titulo, descricao, imagem, mensagemExtra);
    const gw = await db.prepare('SELECT * FROM giveaways WHERE id = ?').get(info.lastInsertRowid);
    const embed = embedGiveaway(gw, 0, false);
    const row = botaoGiveaway(gw, 0, false);
    const msg = await canal.send({
      content: mensagemExtra || undefined,
      embeds: [embed],
      components: [row],
      allowedMentions: {
        parse: ['everyone', 'roles', 'users']
      }
    }).catch(() => null);
    if (!msg) {
      await db.prepare('DELETE FROM giveaways WHERE id = ?').run(gw.id);
      return interaction.reply({
        content: '❌ Não foi possível publicar o giveaway nesse canal.',
        ephemeral: true
      });
    }
    await db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(msg.id, gw.id);
    agendarEncerramentoGiveaway(gw);
    return interaction.reply({
      content: `✅ Giveaway **#${gw.id}** criado em <#${canal.id}>! Termina <t:${Math.floor(endsAt.getTime() / 1000)}:R>.`,
      ephemeral: true
    });
  }
  if (commandName === 'giveaway-terminar') {
    const id = parseInt(options.getString('id'));
    const gw = await db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(id, guild.id);
    if (!gw) return interaction.reply({
      content: '❌ Giveaway não encontrado.',
      ephemeral: true
    });
    if (gw.ended) return interaction.reply({
      content: '❌ Este giveaway já terminou. Usa `/giveaway-reroll` para sortear de novo.',
      ephemeral: true
    });
    const vencedores = await encerrarGiveaway(guild, gw);
    if (vencedores === null) {
      return interaction.reply({
        content: '❌ Não foi possível encerrar o giveaway (canal ou mensagem indisponível). Tenta novamente em instantes.',
        ephemeral: true
      });
    }
    cancelarTimerGiveaway(gw.id);
    return interaction.reply({
      content: vencedores.length ? `✅ Giveaway **#${gw.id}** encerrado! Vencedor(es): ${vencedores.map(v => `<@${v}>`).join(', ')}` : `✅ Giveaway **#${gw.id}** encerrado sem participantes.`,
      ephemeral: true
    });
  }
  if (commandName === 'giveaway-reroll') {
    const id = parseInt(options.getString('id'));
    const gw = await db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(id, guild.id);
    if (!gw) return interaction.reply({
      content: '❌ Giveaway não encontrado.',
      ephemeral: true
    });
    if (!gw.ended) return interaction.reply({
      content: '❌ Este giveaway ainda está ativo. Usa `/giveaway-terminar` primeiro.',
      ephemeral: true
    });
    const vencedores = sortearVencedores(gw.id, gw.vencedores);
    const canal = guild.channels.cache.get(gw.channel_id);
    if (!vencedores.length) {
      return interaction.reply({
        content: '❌ Não há participantes para sortear.',
        ephemeral: true
      });
    }
    if (canal) {
      await canal.send({
        content: `🔁 **Reroll do giveaway #${gw.id}** (${gw.premio})\n🎉 Novo(s) vencedor(es): ${vencedores.map(v => `<@${v}>`).join(', ')}`
      }).catch(() => {});
    }
    return interaction.reply({
      content: `✅ Reroll feito! Novo(s) vencedor(es): ${vencedores.map(v => `<@${v}>`).join(', ')}`,
      ephemeral: true
    });
  }
  if (commandName === 'giveaway-cancelar') {
    const id = parseInt(options.getString('id'));
    const gw = await db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(id, guild.id);
    if (!gw) return interaction.reply({
      content: '❌ Giveaway não encontrado.',
      ephemeral: true
    });
    if (gw.message_id) {
      const canal = guild.channels.cache.get(gw.channel_id);
      const msg = canal ? await canal.messages.fetch(gw.message_id).catch(() => null) : null;
      if (msg) {
        const total = (await db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(gw.id)).c;
        await msg.edit({
          embeds: [new EmbedBuilder().setTitle('🚫 Sorteio Cancelado').setDescription(`**Prémio:** ${gw.premio}\n\nEste sorteio foi cancelado por um administrador.`).setColor(CONFIG.COR_ERRO)],
          components: [botaoGiveaway(gw, total, true)]
        }).catch(() => {});
      }
    }
    await db.prepare('DELETE FROM giveaways WHERE id = ?').run(gw.id);
    await db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ?').run(gw.id);
    cancelarTimerGiveaway(gw.id);
    return interaction.reply({
      content: `✅ Giveaway **#${gw.id}** cancelado.`,
      ephemeral: true
    });
  }
  if (commandName === 'giveaway-lista') {
    const giveaways = await db.prepare('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY ended ASC, created_at DESC LIMIT 15').all(guild.id);
    if (!giveaways.length) {
      return interaction.reply({
        content: '📭 Ainda não há giveaways neste servidor.',
        ephemeral: true
      });
    }
    const linhas = giveaways.map(async gw => {
      const total = (await db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(gw.id)).c;
      const estado = gw.ended ? '🔴 Terminado' : '🟢 Ativo';
      return `**#${gw.id}** · ${estado} · ${gw.premio} · 🏆 ${gw.vencedores} · 👥 ${total}`;
    });
    const embed = new EmbedBuilder().setTitle('🎉 Giveaways do Servidor').setDescription(linhas.join('\n')).setColor(CONFIG.COR_PRINCIPAL).setFooter({
      text: 'Usa o ID para /giveaway-terminar, /giveaway-reroll ou /giveaway-cancelar'
    });
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  if (commandName === 'help') {
    const embed = new EmbedBuilder().setTitle('📖 Comandos do Bot').setDescription('Bem-vindo! Aqui estão todos os comandos disponíveis.\n\u200b').setColor(CONFIG.COR_PRINCIPAL).setThumbnail(client.user.displayAvatarURL()).addFields({
      name: '🎫 Tickets',
      value: '`/ticket-setup` · Configura o sistema de tickets\n`/ticket-painel` · Cria o painel de tickets\n`/ticket-tipo` · Adiciona um tipo de ticket\n`/ticket-tipos-lista` · Lista os tipos de ticket\n`/ticket-tipo-remover` · Remove um tipo de ticket\n`/ticket-criar` · Cria um ticket manualmente',
      inline: false
    }, {
      name: '⭐ Avaliações de Staff',
      value: '`/avaliar-staff` · Avalia um membro da staff\n`/ranking-staff` · Mostra o ranking de avaliações\n`/historico-staff` · Vê o histórico de avaliações de um staff',
      inline: false
    }, {
      name: '🔨 Moderação',
      value: '`/ban` · Bane um utilizador\n`/unban` · Remove o ban\n`/kick` · Expulsa um utilizador\n`/timeout` · Silencia temporariamente\n`/untimeout` · Remove o silêncio\n`/warn` · Avisa um utilizador\n`/warns` · Vê os avisos de um utilizador\n`/clearwarns` · Limpa os avisos\n`/limpar` · Apaga mensagens do canal\n`/lock` (ou `!lock`) · Tranca um canal (bloqueia @everyone de enviar mensagens)\n`/unlock` (ou `!unlock`) · Destranca um canal\n`/blacklist-add` · Bane automaticamente se este username entrar no servidor\n`/blacklist-remove` · Remove um ID da blacklist\n`/blacklist-lista` · Lista os utilizadores na blacklist',
      inline: false
    }, {
      name: '💡 Sugestões',
      value: '`/sugerir` · Submete uma sugestão (escolhe o tipo)\n`/sugestao-tipo-criar` · Cria um tipo de sugestão\n`/sugestao-tipo-apagar` · Apaga um tipo de sugestão\n`/sugestao-tipo-lista` · Lista os tipos\n`/sugestao-responder` · Aprova ou rejeita uma sugestão',
      inline: false
    }, {
      name: '🪧 Painéis de Informação',
      value: '`/painel-criar` · Cria um painel de informação em rascunho\n`/painel-botao-add` · Adiciona um botão ao painel\n`/painel-publicar` · Publica (ou republica) o painel no Discord\n`/painel-lista` · Lista os painéis configurados\n`/painel-apagar` · Apaga um painel e os seus botões',
      inline: false
    }, {
      name: '❓ Perguntas',
      value: '`/pergunta` · Envia uma pergunta a um canal e cria um tópico para respostas',
      inline: false
    }, {
      name: '🎨 Embeds',
      value: '`/embed-criar` · Cria um embed personalizado\n`/embed-guardar` · Guarda um embed\n`/embed-enviar` · Envia um embed guardado\n`/embed-lista` · Lista os embeds guardados',
      inline: false
    }, {
      name: '👋 Boas-vindas',
      value: '`/welcome-setup` · Configura as boas-vindas\n`/welcome-desativar` · Desativa as boas-vindas\n`/welcome-testar` · Testa a mensagem de boas-vindas',
      inline: false
    }, {
      name: '📊 Server Stats',
      value: '`/stats-setup` · Configura os canais de estatísticas\n`/stats-atualizar` · Atualiza as estatísticas manualmente\n`/stats-desativar` · Desativa o sistema de estatísticas',
      inline: false
    }, {
      name: '⚙️ Configuração',
      value: '`/logs-setup` · Configura o canal de logs\n`/antispam` · Configura o sistema AntiSpam',
      inline: false
    }, {
      name: '🎖️ Cargos',
      value: '`/role-add-remove` · Adiciona um cargo e remove outro cargo de um utilizador',
      inline: false
    }, {
      name: '🗳️ Votação',
      value: '`/votação-setup` · Configura uma votação (recorrente diária ou de um dia único)\n`/remover-votação` · Remove a votação configurada',
      inline: false
    }, {
      name: '🎉 Giveaways (apenas Admin)',
      value: '`/giveaway-criar` · Cria um sorteio\n`/giveaway-terminar` · Termina um sorteio já e sorteia vencedores\n`/giveaway-reroll` · Sorteia novo(s) vencedor(es)\n`/giveaway-cancelar` · Cancela um sorteio\n`/giveaway-lista` · Lista os sorteios ativos e recentes',
      inline: false
    }, {
      name: 'ℹ️ Informação',
      value: '`/userinfo` · Informações sobre um utilizador\n`/serverinfo` · Informações sobre o servidor',
      inline: false
    }).setFooter({
      text: `Pedido por ${user.username}`,
      iconURL: user.displayAvatarURL()
    }).setTimestamp();
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
  if (commandName === 'lock') {
    const canal = options.getChannel('canal') || interaction.channel;
    if (!canal || !canal.permissionOverwrites) {
      return interaction.reply({
        content: '❌ Não foi possível trancar este canal.',
        ephemeral: true
      });
    }
    try {
      await canal.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false
      });
      const embed = embedPadrao('🔒 Canal Trancado', `**Canal:** <#${canal.id}>\n**Moderador:** <@${user.id}>\n\nO envio de mensagens para @everyone foi bloqueado.\n\nPara desbloquear o canal use \`/unlock\` ou \`!unlock\`.`, CONFIG.COR_ERRO);
      logMod(guild.id, 'LOCK', canal.id, user.id, 'Canal trancado');
      await sendLogTyped(guild, 'lock', embed);
      return interaction.reply({
        embeds: [embed]
      });
    } catch (e) {
      return interaction.reply({
        content: `❌ Não foi possível trancar o canal: ${e.message}`,
        ephemeral: true
      });
    }
  }
  if (commandName === 'unlock') {
    const canal = options.getChannel('canal') || interaction.channel;
    if (!canal || !canal.permissionOverwrites) {
      return interaction.reply({
        content: '❌ Não foi possível destrancar este canal.',
        ephemeral: true
      });
    }
    try {
      await canal.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null
      });
      const embed = embedPadrao('🔓 Canal Destrancado', `**Canal:** <#${canal.id}>\n**Moderador:** <@${user.id}>\n\nO envio de mensagens para @everyone foi restaurado.\n\nPara bloquear o canal use \`/lock\` ou \`!lock\`.`, CONFIG.COR_SUCESSO);
      logMod(guild.id, 'UNLOCK', canal.id, user.id, 'Canal destrancado');
      await sendLogTyped(guild, 'unlock', embed);
      return interaction.reply({
        embeds: [embed]
      });
    } catch (e) {
      return interaction.reply({
        content: `❌ Não foi possível destrancar o canal: ${e.message}`,
        ephemeral: true
      });
    }
  }
  if (commandName === 'userinfo') {
    await interaction.deferReply();
    const target = options.getMember('utilizador') || member;
    const u = target.user;
    await target.fetch();
    const cargos = target.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position);
    const avisos = (await db.prepare('SELECT COUNT(*) as c FROM warns WHERE guild_id = ? AND user_id = ?').get(guild.id, u.id)).c;
    const embed = new EmbedBuilder().setTitle(`👤 ${u.tag}`).setThumbnail(u.displayAvatarURL({
      dynamic: true,
      size: 256
    })).setColor(target.displayHexColor || CONFIG.COR_PRINCIPAL).addFields({
      name: '🆔 ID',
      value: u.id,
      inline: true
    }, {
      name: '🤖 Bot',
      value: u.bot ? 'Sim' : 'Não',
      inline: true
    }, {
      name: '⚠️ Avisos',
      value: `${avisos}`,
      inline: true
    }, {
      name: '📅 Conta Criada',
      value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`,
      inline: true
    }, {
      name: '📥 Entrou no Servidor',
      value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`,
      inline: true
    }, {
      name: '🎭 Cargo Principal',
      value: `${cargos.first() || 'Nenhum'}`,
      inline: true
    }, {
      name: `🎭 Cargos (${cargos.size})`,
      value: cargos.size ? cargos.map(r => `${r}`).slice(0, 10).join(' ') : 'Nenhum'
    }).setTimestamp();
    return interaction.editReply({
      embeds: [embed]
    });
  }
  if (commandName === 'serverinfo') {
    await interaction.deferReply();
    await guild.fetch();
    await guild.members.fetch().catch(() => {});
    const bots = guild.members.cache.filter(m => m.user.bot).size;
    const humanos = guild.memberCount - bots;
    const embed = new EmbedBuilder().setTitle(`🏰 ${guild.name}`).setThumbnail(guild.iconURL({
      dynamic: true
    })).setColor(CONFIG.COR_PRINCIPAL).addFields({
      name: '🆔 ID',
      value: guild.id,
      inline: true
    }, {
      name: '👑 Dono',
      value: `<@${guild.ownerId}>`,
      inline: true
    }, {
      name: '📅 Criado',
      value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
      inline: true
    }, {
      name: '👥 Membros',
      value: `${humanos} humanos • ${bots} bots`,
      inline: true
    }, {
      name: '📢 Canais',
      value: `${guild.channels.cache.size}`,
      inline: true
    }, {
      name: '🎭 Cargos',
      value: `${guild.roles.cache.size}`,
      inline: true
    }, {
      name: '🚀 Boosts',
      value: `${guild.premiumSubscriptionCount} (Nível ${guild.premiumTier})`,
      inline: true
    }, {
      name: '😀 Emojis',
      value: `${guild.emojis.cache.size}`,
      inline: true
    }, {
      name: '🔒 Verificação',
      value: `${guild.verificationLevel}`,
      inline: true
    }).setTimestamp();
    return interaction.editReply({
      embeds: [embed]
    });
  }

  // ─────────────────────────────────────────────
  // LOGS SETUP
  // ─────────────────────────────────────────────

  if (commandName === 'logs-setup') {
    let canal = options.getChannel('canal');
    let modLog = options.getChannel('mod-log');

    // Nenhum canal foi escolhido → cria automaticamente a categoria "Logs" com
    // os canais 📜│logs e 📜│mod-logs, visíveis só para Administradores.
    if (!canal && !modLog) {
      await interaction.deferReply({
        ephemeral: true
      });
      try {
        const criados = await criarCanaisDeLogs(guild);
        canal = guild.channels.cache.get(criados.logChannelId);
        modLog = guild.channels.cache.get(criados.modLogChannelId);
        await db.prepare(`
          INSERT INTO guild_config (guild_id, log_channel, mod_log)
          VALUES (?, ?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET log_channel=excluded.log_channel, mod_log=excluded.mod_log
        `).run(guild.id, canal.id, modLog.id);
        return interaction.editReply({
          content: `✅ Não tinhas nenhum canal de logs, por isso criei a categoria **Logs** automaticamente (visível só para Administradores):\n📜 ${canal} · Logs gerais\n📋 ${modLog} · Logs de moderação`
        });
      } catch (e) {
        return interaction.editReply({
          content: `❌ Não foi possível criar os canais de logs: ${e.message}`
        });
      }
    }
    if (!canal) {
      return interaction.reply({
        content: '❌ Escolhe pelo menos o canal de logs, ou não escolhas nenhum para eu criar automaticamente.',
        ephemeral: true
      });
    }
    await db.prepare(`
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
    const ativo = options.getBoolean('ativo');
    const maxMsg = options.getInteger('max-mensagens') || 5;
    const acao = options.getString('acao') || 'mute';
    const antiLinks = options.getBoolean('anti-links') ? 1 : 0;
    const antiInvites = options.getBoolean('anti-convites') ? 1 : 0;
    const antiRaid = options.getBoolean('anti-raid') ? 1 : 0;
    const logCh = options.getChannel('log');
    const trapCh = options.getChannel('canal-armadilha');
    const antiBotAdd = options.getBoolean('anti-bot') ? 1 : 0;
    await db.prepare(`
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
    const embed = embedPadrao(`🛡️ AntiSpam ${ativo ? 'Ativado' : 'Desativado'}`, [`**Estado:** ${ativo ? '✅ Ativo' : '❌ Inativo'}`, `**Máx. Mensagens:** ${maxMsg}`, `**Ação:** ${acao}`, `**Anti-Links:** ${antiLinks ? 'Sim' : 'Não'}`, `**Anti-Convites:** ${antiInvites ? 'Sim' : 'Não'}`, `**Anti-Raid:** ${antiRaid ? 'Sim' : 'Não'}`, `**Canal-Armadilha:** ${trapCh ? `<#${trapCh.id}>` : 'Não definido'}`, `**Anti-Bot (não-admin):** ${antiBotAdd ? 'Sim' : 'Não'}`, `**Log:** ${logCh || 'Não definido'}`].join('\n'), ativo ? CONFIG.COR_SUCESSO : CONFIG.COR_ERRO);
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
}

// ============================
// HANDLER DE BOTÕES
// ============================
async function handleButton(interaction) {
  const {
    customId,
    guild,
    member,
    user,
    channel
  } = interaction;

  // ── Botões de Painel de Informação (mostram texto/imagem só para quem clicou) ──
  if (customId.startsWith('infopanel_btn_')) {
    const btnId = parseInt(customId.replace('infopanel_btn_', '')) || 0;
    const botao = await db.prepare('SELECT * FROM info_panel_buttons WHERE id = ?').get(btnId);
    if (!botao) {
      return interaction.reply({
        content: '❌ Este botão já não está configurado.',
        ephemeral: true
      });
    }
    // ephemeral: true → só quem clicou vê a resposta
    const temExtra = botao.response_title || botao.response_image || botao.response_thumbnail || botao.response_color;
    if (temExtra) {
      const embed = new EmbedBuilder().setColor(botao.response_color || CONFIG.COR_PRINCIPAL);
      if (botao.response_title) embed.setTitle(botao.response_title);
      if (botao.response_text) embed.setDescription(botao.response_text);
      if (botao.response_image) embed.setImage(botao.response_image);
      if (botao.response_thumbnail) embed.setThumbnail(botao.response_thumbnail);
      return interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
    return interaction.reply({
      content: botao.response_text,
      ephemeral: true
    });
  }

  // ── Criar ticket simples ──
  if (customId === 'ticket_create_simple') {
    await interaction.deferReply({
      ephemeral: true
    });
    const result = await criarTicket(guild, user, null, interaction);
    if (result.erro) return interaction.editReply({
      content: `❌ ${result.erro}`
    });
    return interaction.editReply({
      content: `✅ Ticket criado: ${result.channel}`
    });
  }

  // ── Criar ticket via botão direto (modo "botões") ──
  if (customId.startsWith('ticket_create_btn_')) {
    const typeId = parseInt(customId.replace('ticket_create_btn_', '')) || null;
    const tipo = typeId ? await db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(typeId) : null;
    if (tipo?.has_form) {
      const perguntas = await db.prepare('SELECT * FROM ticket_form_questions WHERE type_id = ? ORDER BY order_num, id').all(typeId);
      if (perguntas.length) {
        const modal = new ModalBuilder().setCustomId(`ticket_form_modal_${typeId}`).setTitle((tipo.label || 'Novo Ticket').substring(0, 45));
        perguntas.slice(0, 5).forEach(q => {
          const input = new TextInputBuilder().setCustomId(`ticket_form_q_${q.id}`).setLabel(q.question.substring(0, 45)).setStyle(q.style === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!!q.required).setMaxLength(q.style === 'long' ? 1000 : 200);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
        });
        return interaction.showModal(modal);
      }
    }
    await interaction.deferReply({
      ephemeral: true
    });
    const result = await criarTicket(guild, user, typeId, interaction);
    if (result.erro) return interaction.editReply({
      content: `❌ ${result.erro}`
    });
    return interaction.editReply({
      content: `✅ Ticket criado: ${result.channel}`
    });
  }

  // ── Claim ticket ──
  if (customId === 'ticket_claim') {
    const ticket = await db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
    if (!ticket) return interaction.reply({
      content: '❌ Este não é um canal de ticket.',
      ephemeral: true
    });
    if (!isEquipaAdminTicket(member, guild, ticket)) {
      return interaction.reply({
        content: '❌ Apenas a equipa de administração pode reclamar este ticket.',
        ephemeral: true
      });
    }
    if (ticket.claimed_by) return interaction.reply({
      content: `❌ Este ticket já foi reclamado por <@${ticket.claimed_by}>.`,
      ephemeral: true
    });
    await interaction.deferReply();
    await db.prepare('UPDATE tickets SET claimed_by = ? WHERE channel_id = ?').run(user.id, channel.id);
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ManageMessages: true
    });
    const embed = embedPadrao('🙋 Ticket Reclamado', `<@${user.id}> está a tratar deste ticket!`, CONFIG.COR_SUCESSO);
    return interaction.editReply({
      embeds: [embed]
    });
  }

  // ── Fechar ticket ──
  if (customId === 'ticket_close') {
    const ticket = await db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
    if (!ticket) return interaction.reply({
      content: '❌ Este não é um canal de ticket.',
      ephemeral: true
    });

    // Confirmação
    const confirmEmbed = embedPadrao('🔒 Confirmar Fecho', 'Tens a certeza que queres fechar este ticket?', CONFIG.COR_AVISO);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('✅ Confirmar').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary));
    return interaction.reply({
      embeds: [confirmEmbed],
      components: [row],
      ephemeral: true
    });
  }
  if (customId === 'ticket_close_confirm') {
    await interaction.deferReply({
      ephemeral: true
    });
    await fecharTicket(channel, user.id, guild);
    return interaction.editReply({
      content: '✅ Ticket fechado.'
    });
  }
  if (customId === 'ticket_close_cancel') {
    return interaction.reply({
      content: '❌ Fecho cancelado.',
      ephemeral: true
    });
  }

  // ── Fechar ticket com motivo ──
  if (customId === 'ticket_close_reason') {
    const ticket = await db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
    if (!ticket) return interaction.reply({
      content: '❌ Este não é um canal de ticket.',
      ephemeral: true
    });
    const modal = new ModalBuilder().setCustomId('ticket_close_reason_modal').setTitle('📝 Fechar Ticket com Motivo');
    const input = new TextInputBuilder().setCustomId('motivo_input').setLabel('Motivo do encerramento').setPlaceholder('Escreve aqui o motivo do encerramento...').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ── Transcript ──
  if (customId === 'ticket_transcript') {
    await interaction.deferReply({
      ephemeral: true
    });
    const html = await gerarTranscript(channel);
    const buffer = Buffer.from(html, 'utf-8');
    const file = new AttachmentBuilder(buffer, {
      name: `transcript-${channel.name}.html`
    });
    return interaction.editReply({
      content: '📄 Aqui está o transcript:',
      files: [file]
    });
  }

  // ── Add User ──
  if (customId === 'ticket_adduser') {
    const modal = new ModalBuilder().setCustomId('ticket_adduser_modal').setTitle('➕ Adicionar Utilizador ao Ticket');
    const input = new TextInputBuilder().setCustomId('user_id_input').setLabel('ID do utilizador').setPlaceholder('Cole o ID do utilizador aqui').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ── Remove User ──
  if (customId === 'ticket_removeuser') {
    const modal = new ModalBuilder().setCustomId('ticket_removeuser_modal').setTitle('➖ Remover Utilizador do Ticket');
    const input = new TextInputBuilder().setCustomId('user_id_input').setLabel('ID do utilizador').setPlaceholder('Cole o ID do utilizador aqui').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ── Rename ticket ──
  if (customId === 'ticket_rename') {
    const modal = new ModalBuilder().setCustomId('ticket_rename_modal').setTitle('✏️ Renomear Ticket');
    const input = new TextInputBuilder().setCustomId('new_name').setLabel('Novo nome do canal').setPlaceholder('Ex: ticket-vip-joao').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ── Voto na votação diária ──
  if (customId.startsWith('votacao_vote_')) {
    const opcao = customId.slice('votacao_vote_'.length);
    const config = await db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guild.id);
    if (!config || !config.ativa_hoje || config.encerrada_hoje) {
      return interaction.reply({
        content: '❌ Esta votação já não está ativa.',
        ephemeral: true
      });
    }
    const hojeStr = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Europe/Lisbon'
    });
    if (config.data_atual !== hojeStr) {
      return interaction.reply({
        content: '❌ Esta votação já não está ativa.',
        ephemeral: true
      });
    }
    const opcoes = JSON.parse(config.opcoes);
    if (!opcoes.includes(opcao)) {
      return interaction.reply({
        content: '❌ Opção inválida.',
        ephemeral: true
      });
    }
    await db.prepare(`
      INSERT INTO votacao_votos (guild_id, data, user_id, opcao)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id, data, user_id) DO UPDATE SET opcao=excluded.opcao
    `).run(guild.id, hojeStr, user.id, opcao);
    return interaction.reply({
      content: `✅ O teu voto em **${opcao}** foi registado! Podes mudar de opção a qualquer momento até a votação fechar.`,
      ephemeral: true
    });
  }

  // ── Participar num giveaway ──
  if (customId.startsWith('giveaway_join_')) {
    const giveawayId = parseInt(customId.slice('giveaway_join_'.length));
    const gw = await db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(giveawayId, guild.id);
    if (!gw || gw.ended) {
      return interaction.reply({
        content: '❌ Este sorteio já não está ativo.',
        ephemeral: true
      });
    }
    const jaEntrou = await db.prepare('SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?').get(giveawayId, user.id);
    if (jaEntrou) {
      await db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?').run(giveawayId, user.id);
      const totalAtual = (await db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(giveawayId)).c;
      await atualizarBotaoGiveaway(guild, gw, totalAtual).catch(() => {});
      return interaction.reply({
        content: '🚫 Saíste do sorteio.',
        ephemeral: true
      });
    }
    await db.prepare('INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)').run(giveawayId, user.id);
    const total = (await db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(giveawayId)).c;
    await atualizarBotaoGiveaway(guild, gw, total).catch(() => {});
    return interaction.reply({
      content: `🎉 Estás a participar no sorteio de **${gw.premio}**! Boa sorte!`,
      ephemeral: true
    });
  }

  // ── Votos em sugestões ──
  if (customId.startsWith('sug_up_') || customId.startsWith('sug_down_')) {
    const [, tipo, sugId] = customId.split('_');
    const id = parseInt(sugId);
    const voto = tipo === 'up' ? 'up' : 'down';
    const existing = await db.prepare('SELECT * FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?').get(id, user.id);
    if (existing) {
      if (existing.vote === voto) {
        // Remove voto
        await db.prepare('DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?').run(id, user.id);
        if (voto === 'up') await db.prepare('UPDATE suggestions SET votes_up = MAX(0, votes_up-1) WHERE id = ?').run(id);else await db.prepare('UPDATE suggestions SET votes_down = MAX(0, votes_down-1) WHERE id = ?').run(id);
      } else {
        // Muda voto
        await db.prepare('UPDATE suggestion_votes SET vote = ? WHERE suggestion_id = ? AND user_id = ?').run(voto, id, user.id);
        if (voto === 'up') {
          await db.prepare('UPDATE suggestions SET votes_up = votes_up+1, votes_down = MAX(0,votes_down-1) WHERE id = ?').run(id);
        } else {
          await db.prepare('UPDATE suggestions SET votes_down = votes_down+1, votes_up = MAX(0,votes_up-1) WHERE id = ?').run(id);
        }
      }
    } else {
      // Novo voto
      await db.prepare('INSERT INTO suggestion_votes (suggestion_id, user_id, vote) VALUES (?,?,?)').run(id, user.id, voto);
      if (voto === 'up') await db.prepare('UPDATE suggestions SET votes_up = votes_up+1 WHERE id = ?').run(id);else await db.prepare('UPDATE suggestions SET votes_down = votes_down+1 WHERE id = ?').run(id);
    }
    const sug = await db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id);

    // Atualiza o embed
    const oldEmbed = interaction.message.embeds[0];
    const embed = EmbedBuilder.from(oldEmbed).spliceFields(0, 2, {
      name: '👍 Votos positivos',
      value: `${sug.votes_up}`,
      inline: true
    }, {
      name: '👎 Votos negativos',
      value: `${sug.votes_down}`,
      inline: true
    });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`sug_up_${id}`).setLabel(`👍 ${sug.votes_up}`).setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`sug_down_${id}`).setLabel(`👎 ${sug.votes_down}`).setStyle(ButtonStyle.Danger));
    await interaction.update({
      embeds: [embed],
      components: [row]
    });
  }
}

// ============================
// HANDLER DE SELECT MENUS
// ============================
async function handleSelectMenu(interaction) {
  const {
    customId,
    values,
    guild,
    user
  } = interaction;
  if (customId === 'ticket_create_select') {
    const valor = values[0]; // ex: "tipo_3"
    const typeId = parseInt(valor.replace('tipo_', '')) || null;

    // Se o tipo de ticket tiver formulário configurado, mostra o modal antes de criar o ticket
    const tipo = typeId ? await db.prepare('SELECT * FROM ticket_types WHERE id = ?').get(typeId) : null;
    if (tipo?.has_form) {
      const perguntas = await db.prepare('SELECT * FROM ticket_form_questions WHERE type_id = ? ORDER BY order_num, id').all(typeId);
      if (perguntas.length) {
        const modal = new ModalBuilder().setCustomId(`ticket_form_modal_${typeId}`).setTitle((tipo.label || 'Novo Ticket').substring(0, 45));
        perguntas.slice(0, 5).forEach(q => {
          const input = new TextInputBuilder().setCustomId(`ticket_form_q_${q.id}`).setLabel(q.question.substring(0, 45)).setStyle(q.style === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!!q.required).setMaxLength(q.style === 'long' ? 1000 : 200);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
        });
        return interaction.showModal(modal);
      }
    }
    await interaction.deferReply({
      ephemeral: true
    });
    const result = await criarTicket(guild, user, typeId, interaction);
    if (result.erro) return interaction.editReply({
      content: `❌ ${result.erro}`
    });
    return interaction.editReply({
      content: `✅ Ticket criado: ${result.channel}`
    });
  }
}

// ============================
// HANDLER DE MODAIS
// ============================
async function handleModal(interaction) {
  const {
    customId,
    guild,
    user,
    channel
  } = interaction;

  // ── Formulário de criação de ticket ──
  if (customId.startsWith('ticket_form_modal_')) {
    const typeId = parseInt(customId.replace('ticket_form_modal_', '')) || null;
    await interaction.deferReply({
      ephemeral: true
    });
    const perguntas = typeId ? await db.prepare('SELECT * FROM ticket_form_questions WHERE type_id = ? ORDER BY order_num, id').all(typeId) : [];
    const respostas = perguntas.slice(0, 5).map(q => {
      let valor = '';
      try {
        valor = interaction.fields.getTextInputValue(`ticket_form_q_${q.id}`);
      } catch (_) {}
      return {
        question: q.question,
        answer: valor
      };
    });
    const result = await criarTicket(guild, user, typeId, interaction, respostas);
    if (result.erro) return interaction.editReply({
      content: `❌ ${result.erro}`
    });
    return interaction.editReply({
      content: `✅ Ticket criado: ${result.channel}`
    });
  }

  // ── Configuração da votação recorrente (diária) ──
  if (customId === 'votacao_setup_modal_recorrente') {
    const titulo = interaction.fields.getTextInputValue('votacao_titulo').trim();
    const descricao = interaction.fields.getTextInputValue('votacao_descricao').trim();
    const opcoesRaw = interaction.fields.getTextInputValue('votacao_opcoes').trim();
    const horaInicio = interaction.fields.getTextInputValue('votacao_hora_inicio').trim();
    const horaFim = interaction.fields.getTextInputValue('votacao_hora_fim').trim();
    const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!horaRegex.test(horaInicio) || !horaRegex.test(horaFim)) {
      return interaction.reply({
        content: '❌ Formato de hora inválido. Usa o formato **HH:MM** (24h), ex: `12:00`.',
        ephemeral: true
      });
    }
    const opcoes = opcoesRaw.split(',').map(o => o.trim()).filter(o => o.length > 0);
    if (opcoes.length < 2) {
      return interaction.reply({
        content: '❌ Precisas de pelo menos **2 opções** separadas por vírgula.',
        ephemeral: true
      });
    }
    if (opcoes.length > 10) {
      return interaction.reply({
        content: '❌ O máximo é **10 opções** (10 botões).',
        ephemeral: true
      });
    }
    if (opcoes.some(o => o.length > 80)) {
      return interaction.reply({
        content: '❌ Cada opção deve ter no máximo 80 caracteres.',
        ephemeral: true
      });
    }
    const [hiH, hiM] = horaInicio.split(':').map(Number);
    const [hfH, hfM] = horaFim.split(':').map(Number);
    if (hiH * 60 + hiM >= hfH * 60 + hfM) {
      return interaction.reply({
        content: '❌ A hora de início tem de ser antes da hora de fim.',
        ephemeral: true
      });
    }
    await db.prepare(`
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
    const embed = embedPadrao('✅ Votação Recorrente Configurada', `**Título:** ${titulo}\n**Descrição:** ${descricao}\n**Opções:** ${opcoes.join(' • ')}\n**Início:** ${horaInicio}\n**Fim:** ${horaFim}\n**Canal:** ${channel}\n\nA votação será publicada automaticamente todos os dias às **${horaInicio}** e encerrada às **${horaFim}**.`, CONFIG.COR_SUCESSO);
    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }

  // ── Configuração da votação de um dia único (começa imediatamente) ──
  if (customId === 'votacao_setup_modal_unica') {
    const titulo = interaction.fields.getTextInputValue('votacao_titulo').trim();
    const descricao = interaction.fields.getTextInputValue('votacao_descricao').trim();
    const opcoesRaw = interaction.fields.getTextInputValue('votacao_opcoes').trim();
    const dataFim = interaction.fields.getTextInputValue('votacao_data_fim').trim();
    const horaFim = interaction.fields.getTextInputValue('votacao_hora_fim').trim();
    const dataRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const dataMatch = dataFim.match(dataRegex);
    if (!dataMatch) {
      return interaction.reply({
        content: '❌ Formato de data inválido. Usa o formato **DD/MM/AAAA**, ex: `20/07/2026`.',
        ephemeral: true
      });
    }
    const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!horaRegex.test(horaFim)) {
      return interaction.reply({
        content: '❌ Formato de hora inválido. Usa o formato **HH:MM** (24h), ex: `20:30`.',
        ephemeral: true
      });
    }
    const opcoes = opcoesRaw.split(',').map(o => o.trim()).filter(o => o.length > 0);
    if (opcoes.length < 2) {
      return interaction.reply({
        content: '❌ Precisas de pelo menos **2 opções** separadas por vírgula.',
        ephemeral: true
      });
    }
    if (opcoes.length > 10) {
      return interaction.reply({
        content: '❌ O máximo é **10 opções** (10 botões).',
        ephemeral: true
      });
    }
    if (opcoes.some(o => o.length > 80)) {
      return interaction.reply({
        content: '❌ Cada opção deve ter no máximo 80 caracteres.',
        ephemeral: true
      });
    }
    const [, dd, mm, yyyy] = dataMatch;
    const dataFimISO = `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD, comparável com toLocaleDateString('en-CA', ...)

    // Valida que a data/hora de fim é no futuro (fuso Europe/Lisbon)
    const agora = new Date();
    const hojeISO = agora.toLocaleDateString('en-CA', {
      timeZone: 'Europe/Lisbon'
    });
    const horaAtual = agora.toLocaleTimeString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    if (dataFimISO < hojeISO || dataFimISO === hojeISO && horaFim <= horaAtual) {
      return interaction.reply({
        content: '❌ A data/hora de fim tem de ser no futuro.',
        ephemeral: true
      });
    }

    // Guarda a configuração já como ativa (a votação começa imediatamente)
    await db.prepare(`
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
    const config = await db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guild.id);
    await publicarVotacao(guild, config, hojeISO).catch(err => console.error('❌ Erro ao publicar votação única:', err.message));
    return;
  }

  // ── Avaliação de staff ──
  if (customId.startsWith('rating_')) {
    const parts = customId.split('_');
    const staffId = parts[1];
    const ticketId = parseInt(parts[2]) || 0;
    const channelId = parts[3] && parts[3] !== '0' ? parts[3] : null;
    const rating = parseInt(interaction.fields.getTextInputValue('rating_value'));
    const comment = interaction.fields.getTextInputValue('rating_comment').trim();
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return interaction.reply({
        content: '❌ Avaliação inválida. Usa um número de 1 a 5.',
        ephemeral: true
      });
    }
    await interaction.deferReply({
      ephemeral: true
    });
    await db.prepare(`
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
          const embed = new EmbedBuilder().setAuthor({
            name: `Realizado por ${user.username}`,
            iconURL: user.displayAvatarURL()
          }).setTitle('📋 Avaliação de Staff').setColor(CONFIG.COR_PRINCIPAL).addFields({
            name: 'Staff',
            value: staffUser ? `${staffUser} (@${staffUser.username})` : `<@${staffId}>`,
            inline: false
          }, {
            name: 'Nota',
            value: `${estrelas} **${rating}/5**`,
            inline: false
          }, {
            name: '📝 Feedback',
            value: comment || '*Sem comentário*',
            inline: false
          }).setThumbnail(staffUser?.displayAvatarURL() || null).setTimestamp();
          await canalDestino.send({
            embeds: [embed]
          });
        }
      } catch (e) {
        console.error('Erro ao enviar avaliação para canal:', e);
      }
    }
    return interaction.editReply({
      content: `✅ Avaliação enviada com sucesso!`
    });
  }

  // ── Adicionar utilizador ao ticket ──
  if (customId === 'ticket_adduser_modal') {
    const userId = interaction.fields.getTextInputValue('user_id_input').trim();
    await interaction.deferReply({
      ephemeral: true
    });
    try {
      const membro = await guild.members.fetch(userId);
      await channel.permissionOverwrites.edit(membro.id, {
        ViewChannel: true,
        SendMessages: true
      });
      const ticket = await db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id);
      if (ticket) {
        await db.prepare('INSERT OR IGNORE INTO ticket_users (ticket_id, user_id, added_by) VALUES (?,?,?)').run(ticket.id, userId, user.id);
      }
      return interaction.editReply({
        content: `✅ ${membro} adicionado ao ticket!`
      });
    } catch (e) {
      return interaction.editReply({
        content: `❌ Utilizador não encontrado: ${e.message}`
      });
    }
  }

  // ── Remover utilizador do ticket ──
  if (customId === 'ticket_removeuser_modal') {
    const userId = interaction.fields.getTextInputValue('user_id_input').trim();
    await interaction.deferReply({
      ephemeral: true
    });
    try {
      const membro = await guild.members.fetch(userId);
      await channel.permissionOverwrites.delete(membro.id);
      return interaction.editReply({
        content: `✅ ${membro} removido do ticket!`
      });
    } catch (e) {
      return interaction.editReply({
        content: `❌ Erro: ${e.message}`
      });
    }
  }

  // ── Fechar ticket com motivo ──
  if (customId === 'ticket_close_reason_modal') {
    const motivo = interaction.fields.getTextInputValue('motivo_input').trim();
    await interaction.deferReply({
      ephemeral: true
    });
    await fecharTicket(channel, user.id, guild, motivo);
    return interaction.editReply({
      content: '✅ Ticket fechado com o motivo registado.'
    });
  }

  // ── Renomear ticket ──
  if (customId === 'ticket_rename_modal') {
    const newName = interaction.fields.getTextInputValue('new_name').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    await interaction.deferReply({
      ephemeral: true
    });
    await channel.setName(newName);
    return interaction.editReply({
      content: `✅ Canal renomeado para **${newName}**!`
    });
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
  await aplicarIdentidadeGlobalDoBot();
  await registarComandos();
  await sincronizarComandosEmbedTodosServidores();
  iniciarCrons();
  agendarGiveawaysExistentes();
});

// Aplica o nome e avatar globais do bot (Nexo XT), apenas quando necessário.
// O Discord limita trocas de username/avatar (poucas vezes por hora), por isso
// só chamamos setAvatar/setUsername quando o valor atual é diferente do configurado.
async function aplicarIdentidadeGlobalDoBot() {
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS bot_identity (
      chave TEXT PRIMARY KEY,
      valor TEXT
    )`);
    const ultimoNome = (await db.prepare('SELECT valor FROM bot_identity WHERE chave = ?').get('bot_name'))?.valor;
    const ultimoAvatar = (await db.prepare('SELECT valor FROM bot_identity WHERE chave = ?').get('bot_avatar'))?.valor;
    if (CONFIG.BOT_NAME && client.user.username !== CONFIG.BOT_NAME && ultimoNome !== CONFIG.BOT_NAME) {
      try {
        await client.user.setUsername(CONFIG.BOT_NAME);
        await db.prepare('INSERT INTO bot_identity (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor').run('bot_name', CONFIG.BOT_NAME);
        console.log(`✏️ Nome do bot atualizado para: ${CONFIG.BOT_NAME}`);
      } catch (e) {
        console.error('⚠️ Não foi possível atualizar o nome do bot (limite de trocas do Discord?):', e.message);
      }
    }
    if (CONFIG.BOT_AVATAR_URL && ultimoAvatar !== CONFIG.BOT_AVATAR_URL) {
      try {
        await client.user.setAvatar(CONFIG.BOT_AVATAR_URL);
        await db.prepare('INSERT INTO bot_identity (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor').run('bot_avatar', CONFIG.BOT_AVATAR_URL);
        console.log('🖼️ Avatar do bot atualizado a partir do GitHub.');
      } catch (e) {
        console.error('⚠️ Não foi possível atualizar o avatar do bot (limite de trocas do Discord?):', e.message);
      }
    }
  } catch (e) {
    console.error('⚠️ Erro geral ao aplicar identidade do bot:', e.message);
  }
}

// Define a presença/atividade do bot. Chamada no arranque e também
// periodicamente (via cron), porque o Discord por vezes "esquece"
// a presença definida logo no evento ready, sobretudo após reconexões.
function definirPresenca() {
  client.user.setPresence({
    activities: [{
      name: '/help',
      type: ActivityType.Watching
    }],
    status: 'online'
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
    const canaisTexto = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks]));
    if (!canaisTexto.size) return;
    const preferido = canaisTexto.find(c => /geral|general|boas.?vindas|welcome|inicio|início/i.test(c.name));
    const canal = preferido || canaisTexto.sort((a, b) => a.position - b.position).first();
    if (!canal) return;
    const DASHBOARD_URL = 'https://agent-xt.onrender.com';
    const embed = new EmbedBuilder().setTitle('🎉 Obrigado por escolher o Bot!').setDescription(`Olá! Obrigado por me adicionares a **${guild.name}**. 🙌\n\n` + `Sou um bot completo feito para ajudar a gerir o teu servidor, com sistemas de:\n` + `🎫 **Tickets** — suporte organizado por categorias\n` + `🔨 **Moderação** — avisos, blacklist, antispam e logs\n` + `👋 **Boas-vindas & AutoRole** — recebe novos membros com estilo\n` + `🎭 **Reaction Roles** — cargos por reação, geridos pelo dashboard\n` + `🎖️ **Cargos** — autorole e exclusividade de cargos\n` + `🎨 **Embeds personalizados** — envio manual, por intervalo ou a horas fixas todos os dias\n` + `⭐ **Avaliações de Staff** e **Sugestões** da comunidade\n` + `📈 **Estatísticas** do servidor e **Votações** diárias\n\n` + `Tudo isto é configurado de forma simples e visual — sem precisares de decorar comandos.`).setColor(CONFIG.COR_PRINCIPAL).setThumbnail(client.user.displayAvatarURL({
      dynamic: true
    })).addFields({
      name: '🌐 Dashboard de Configuração',
      value: `Configura tudo de forma simples e visual clicando no botão abaixo.`
    }).setFooter({
      text: 'Usa /help no Discord para veres os comandos disponíveis.'
    }).setTimestamp();
    const linkRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('🌐 Abrir Dashboard').setStyle(ButtonStyle.Link).setURL(DASHBOARD_URL));
    await canal.send({
      embeds: [embed],
      components: [linkRow]
    });
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
  const blEntry = await db.prepare('SELECT * FROM blacklist WHERE guild_id = ? AND (user_id = ? OR LOWER(username) = ?)').get(member.guild.id, member.id, usernameLower);
  if (blEntry) {
    await member.ban({
      reason: `Blacklist: ${blEntry.reason || 'Conta bloqueada'}`,
      deleteMessageSeconds: 7 * 86400
    }).catch(() => {});
    // Guarda o ID descoberto agora, para futuras referências (ex: remover por ID)
    if (!blEntry.user_id) {
      await db.prepare('UPDATE blacklist SET user_id = ? WHERE id = ?').run(member.id, blEntry.id);
    }
    const embed = embedPadrao('🚫 Blacklist: Utilizador Banido Automaticamente', `**Utilizador:** ${member.user.tag} (\`${member.id}\`)\n**Motivo original:** ${blEntry.reason || 'Sem motivo especificado'}\n**Adicionado à blacklist por:** <@${blEntry.added_by}>`, CONFIG.COR_ERRO);
    await sendLogTyped(member.guild, 'blacklist', embed);
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
  const embed = embedLogModeracao({
    titulo: '📥 Membro Entrou',
    cor: CONFIG.COR_SUCESSO,
    alvo: member,
    camposExtra: [{
      name: '📅 Conta Criada',
      value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
      inline: false
    }, {
      name: '👥 Membros no Servidor',
      value: `${member.guild.memberCount}`,
      inline: true
    }]
  });
  await sendLogTyped(member.guild, 'member_join', embed);
});

// Quando os cargos de um membro mudam (por qualquer via — Discord UI, outro bot, etc.),
// aplica a exclusividade de cargos configurada na aba "Cargos" do dashboard.
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    // ── Log de cargos ganhos/perdidos ──
    const cargosGanhos = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const cargosPerdidos = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (cargosGanhos.size > 0) {
      const {
        executor,
        motivo
      } = await obterExecutorAuditLog(newMember.guild, 25 /* AuditLogEvent.MemberRoleUpdate */, newMember.id);
      const embed = embedLogModeracao({
        titulo: '➕ Cargo(s) Atribuído(s)',
        cor: CONFIG.COR_SUCESSO,
        alvo: newMember,
        moderador: executor,
        motivoDesconhecido: motivo,
        camposExtra: [{
          name: '🎭 Cargo(s)',
          value: cargosGanhos.map(r => `<@&${r.id}>`).join(', '),
          inline: false
        }]
      });
      await sendLogTyped(newMember.guild, 'member_role', embed);
    }
    if (cargosPerdidos.size > 0) {
      const {
        executor,
        motivo
      } = await obterExecutorAuditLog(newMember.guild, 25 /* AuditLogEvent.MemberRoleUpdate */, newMember.id);
      const embed = embedLogModeracao({
        titulo: '➖ Cargo(s) Removido(s)',
        cor: CONFIG.COR_ERRO,
        alvo: newMember,
        moderador: executor,
        motivoDesconhecido: motivo,
        camposExtra: [{
          name: '🎭 Cargo(s)',
          value: cargosPerdidos.map(r => `<@&${r.id}>`).join(', '),
          inline: false
        }]
      });
      await sendLogTyped(newMember.guild, 'member_role', embed);
    }

    // ── Log de mudança de apelido (nickname) ──
    if (oldMember.nickname !== newMember.nickname) {
      const {
        executor,
        motivo
      } = await obterExecutorAuditLog(newMember.guild, 24 /* AuditLogEvent.MemberUpdate */, newMember.id);
      const embed = embedLogModeracao({
        titulo: '✏️ Apelido Alterado',
        cor: CONFIG.COR_AVISO,
        alvo: newMember,
        moderador: executor,
        motivoDesconhecido: motivo,
        camposExtra: [{
          name: '📛 Antes',
          value: oldMember.nickname || '*Nenhum*',
          inline: true
        }, {
          name: '📛 Depois',
          value: newMember.nickname || '*Nenhum*',
          inline: true
        }]
      });
      await sendLogTyped(newMember.guild, 'member_nick', embed);
    }
    if (oldMember.roles.cache.size === newMember.roles.cache.size && oldMember.roles.cache.every(r => newMember.roles.cache.has(r.id))) {
      return; // cargos não mudaram, ignora (evita trabalho desnecessário)
    }
    await aplicarExclusividadeCargos(newMember);
  } catch (err) {
    console.error('❌ Erro ao aplicar exclusividade de cargos:', err.message);
  }
});

// ── Cargo criado ──
client.on(Events.GuildRoleCreate, async role => {
  const {
    executor,
    motivo
  } = await obterExecutorAuditLog(role.guild, 30 /* AuditLogEvent.RoleCreate */, role.id); // 30
  const embed = embedLogModeracao({
    titulo: '🆕 Cargo Criado',
    cor: CONFIG.COR_SUCESSO,
    moderador: executor,
    motivoDesconhecido: motivo,
    camposExtra: [{
      name: '🎭 Cargo',
      value: `<@&${role.id}> (\`${role.name}\`)`,
      inline: false
    }, {
      name: '🎨 Cor',
      value: role.hexColor,
      inline: true
    }, {
      name: '🆔 ID do Cargo',
      value: `\`${role.id}\``,
      inline: true
    }]
  });
  await sendLogTyped(role.guild, 'role_update', embed);
});

// ── Cargo eliminado ──
client.on(Events.GuildRoleDelete, async role => {
  const {
    executor,
    motivo
  } = await obterExecutorAuditLog(role.guild, 32 /* AuditLogEvent.RoleDelete */, role.id);
  const embed = embedLogModeracao({
    titulo: '🗑️ Cargo Eliminado',
    cor: CONFIG.COR_ERRO,
    moderador: executor,
    motivoDesconhecido: motivo,
    camposExtra: [{
      name: '🎭 Nome do Cargo',
      value: `\`${role.name}\``,
      inline: false
    }, {
      name: '🆔 ID do Cargo',
      value: `\`${role.id}\``,
      inline: true
    }]
  });
  await sendLogTyped(role.guild, 'role_update', embed);
});

// ── Cargo editado ──
client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  if (oldRole.name === newRole.name && oldRole.hexColor === newRole.hexColor && oldRole.permissions.bitfield === newRole.permissions.bitfield) return;
  const {
    executor,
    motivo
  } = await obterExecutorAuditLog(newRole.guild, 31 /* AuditLogEvent.RoleUpdate */, newRole.id);
  const embed = embedLogModeracao({
    titulo: '✏️ Cargo Editado',
    cor: CONFIG.COR_AVISO,
    moderador: executor,
    motivoDesconhecido: motivo,
    camposExtra: [{
      name: '🎭 Cargo',
      value: `<@&${newRole.id}>`,
      inline: false
    }, {
      name: '📛 Nome',
      value: `${oldRole.name} → ${newRole.name}`,
      inline: false
    }, {
      name: '🎨 Cor',
      value: `${oldRole.hexColor} → ${newRole.hexColor}`,
      inline: true
    }, {
      name: '🆔 ID do Cargo',
      value: `\`${newRole.id}\``,
      inline: true
    }]
  });
  await sendLogTyped(newRole.guild, 'role_update', embed);
});

// ── Canal criado ──
client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;
  const {
    executor,
    motivo
  } = await obterExecutorAuditLog(channel.guild, 10 /* AuditLogEvent.ChannelCreate */, channel.id);
  const embed = embedLogModeracao({
    titulo: '🆕 Canal Criado',
    cor: CONFIG.COR_SUCESSO,
    moderador: executor,
    motivoDesconhecido: motivo,
    canal: channel,
    camposExtra: [{
      name: '🗂️ Tipo',
      value: `\`${channel.type}\``,
      inline: true
    }]
  });
  await sendLogTyped(channel.guild, 'channel_update', embed);
});

// ── Canal eliminado ──
client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;
  const {
    executor,
    motivo
  } = await obterExecutorAuditLog(channel.guild, 12 /* AuditLogEvent.ChannelDelete */, channel.id);
  const embed = embedLogModeracao({
    titulo: '🗑️ Canal Eliminado',
    cor: CONFIG.COR_ERRO,
    moderador: executor,
    motivoDesconhecido: motivo,
    camposExtra: [{
      name: '📛 Nome do Canal',
      value: `\`#${channel.name}\``,
      inline: false
    }, {
      name: '🗂️ Tipo',
      value: `\`${channel.type}\``,
      inline: true
    }, {
      name: '🆔 ID do Canal',
      value: `\`${channel.id}\``,
      inline: true
    }]
  });
  await sendLogTyped(channel.guild, 'channel_update', embed);
});

// ── Canal atualizado (nome/topico) ──
client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  if (oldChannel.name === newChannel.name) return;
  const {
    executor,
    motivo
  } = await obterExecutorAuditLog(newChannel.guild, 11 /* AuditLogEvent.ChannelUpdate */, newChannel.id);
  const embed = embedLogModeracao({
    titulo: '✏️ Canal Editado',
    cor: CONFIG.COR_AVISO,
    moderador: executor,
    motivoDesconhecido: motivo,
    canal: newChannel,
    camposExtra: [{
      name: '📛 Nome',
      value: `${oldChannel.name} → ${newChannel.name}`,
      inline: false
    }]
  });
  await sendLogTyped(newChannel.guild, 'channel_update', embed);
});

// ── Entrada/Saída/Mudança de canal de voz ──
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  const guild = newState.guild || oldState.guild;

  // Entrou num canal de voz (não estava em nenhum antes)
  if (!oldState.channelId && newState.channelId) {
    const embed = embedPadrao('🔊 Entrou em Canal de Voz', `**Utilizador:** ${member.user.tag} (\`${member.id}\`)\n**Canal:** <#${newState.channelId}>`, CONFIG.COR_SUCESSO);
    await sendLogTyped(guild, 'voice_update', embed);
    return;
  }

  // Saiu de um canal de voz (não está em nenhum agora)
  if (oldState.channelId && !newState.channelId) {
    const embed = embedPadrao('🔇 Saiu de Canal de Voz', `**Utilizador:** ${member.user.tag} (\`${member.id}\`)\n**Canal:** <#${oldState.channelId}>`, CONFIG.COR_ERRO);
    await sendLogTyped(guild, 'voice_update', embed);
    return;
  }

  // Mudou de canal de voz
  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const embed = embedPadrao('🔀 Mudou de Canal de Voz', `**Utilizador:** ${member.user.tag} (\`${member.id}\`)\n**De:** <#${oldState.channelId}>\n**Para:** <#${newState.channelId}>`, CONFIG.COR_AVISO);
    await sendLogTyped(guild, 'voice_update', embed);
    return;
  }

  // Mute/Deafen (servidor)
  if (oldState.serverMute !== newState.serverMute) {
    const embed = embedPadrao(newState.serverMute ? '🔇 Silenciado no Servidor (Voz)' : '🔊 Dessilenciado no Servidor (Voz)', `**Utilizador:** ${member.user.tag} (\`${member.id}\`)`, newState.serverMute ? CONFIG.COR_ERRO : CONFIG.COR_SUCESSO);
    await sendLogTyped(guild, 'voice_update', embed);
  }
  if (oldState.serverDeaf !== newState.serverDeaf) {
    const embed = embedPadrao(newState.serverDeaf ? '🔇 Ensurdecido no Servidor (Voz)' : '🔊 Voz Restaurada no Servidor', `**Utilizador:** ${member.user.tag} (\`${member.id}\`)`, newState.serverDeaf ? CONFIG.COR_ERRO : CONFIG.COR_SUCESSO);
    await sendLogTyped(guild, 'voice_update', embed);
  }
});

/**
 * Verifica se um bot foi adicionado por alguém sem permissão de Administrador.
 * Se a proteção "anti_bot_add" estiver ativa, expulsa o bot e bane quem o adicionou.
 * Retorna true se a situação foi tratada (bot é raid), false caso contrário.
 */
async function verificarAntiBotAdd(botMember) {
  const guild = botMember.guild;
  const config = await db.prepare('SELECT * FROM antispam_config WHERE guild_id = ? AND enabled = 1 AND anti_bot_add = 1').get(guild.id);
  if (!config) return false;

  // Vai buscar ao audit log quem adicionou o bot (BotAdd = tipo 28)
  let executor = null;
  try {
    const audit = await guild.fetchAuditLogs({
      type: 28,
      limit: 5
    }); // AuditLogEvent.BotAdd
    const entry = audit.entries.find(e => e.target?.id === botMember.id);
    executor = entry?.executor || null;
  } catch (_) {/* falta permissão de ver audit log, ou falhou */}
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
  const config2 = await db.prepare('SELECT log_channel FROM antispam_config WHERE guild_id = ?').get(guild.id);
  if (config2?.log_channel) {
    const ch = guild.channels.cache.get(config2.log_channel);
    if (ch) {
      const embed = embedPadrao('🚨 Anti-Raid: Bot Bloqueado', `**Bot:** ${botMember.user.tag} (${botMember.id})\n**Adicionado por:** <@${executor.id}> (${executor.tag})\n**Ação:** Bot expulso e utilizador banido.`, CONFIG.COR_ERRO);
      await ch.send({
        embeds: [embed]
      });
    }
  }
  return true;
}

// ── Membro saiu ──
client.on(Events.GuildMemberRemove, async member => {
  // Tenta perceber se foi kick (audit log) — se foi, o log de 'kick' já cobre isso com detalhe,
  // mas mantemos este log de "Membro Saiu" para cobrir também saídas voluntárias.
  const embed = embedLogModeracao({
    titulo: '📤 Membro Saiu',
    cor: CONFIG.COR_ERRO,
    alvo: member,
    camposExtra: [{
      name: '📅 Estava no Servidor Desde',
      value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '*Desconhecido*',
      inline: false
    }, {
      name: '👥 Membros Restantes',
      value: `${member.guild.memberCount}`,
      inline: true
    }]
  });
  await sendLogTyped(member.guild, 'member_leave', embed);
});

// ── Mensagem criada (antispam) ──
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  // Mensagens enviadas: NÃO vão para o log normal, só para o Mod Log (que recebe tudo mesmo).
  const embedMsg = embedPadrao('💬 Mensagem Enviada', `**Autor:** ${message.author.tag} (\`${message.author.id}\`)\n**Canal:** <#${message.channel.id}>\n**Conteúdo:**\n${message.content?.substring(0, 1000) || '*Sem conteúdo de texto (anexo/embed)*'}`, CONFIG.COR_PRINCIPAL).addFields({
    name: '🔗 Link',
    value: `[Ver mensagem](${message.url})`
  });
  await sendLogTyped(message.guild, 'message_sent', embedMsg);
  const banido = await verificarTrapChannel(message);
  if (banido) return; // já foi banido, não faz mais verificações
  await verificarSpam(message);

  // ── Comandos com prefixo "!" (ex: !lock / !unlock) ──
  if (message.content.startsWith(CONFIG.PREFIX)) {
    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();
    if (cmd === 'lock' || cmd === 'unlock') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply({
          content: '❌ Não tens permissão para usar este comando (é necessário ser Administrador).'
        }).catch(() => {});
      }
      const canal = message.mentions.channels.first() || message.channel;
      if (!canal || !canal.permissionOverwrites) {
        return message.reply({
          content: '❌ Não foi possível alterar este canal.'
        }).catch(() => {});
      }
      try {
        if (cmd === 'lock') {
          await canal.permissionOverwrites.edit(message.guild.roles.everyone, {
            SendMessages: false
          });
          const embed = embedPadrao('🔒 Canal Trancado', `**Canal:** <#${canal.id}>\n**Moderador:** <@${message.author.id}>\n\nO envio de mensagens para @everyone foi bloqueado.\n\nPara desbloquear o canal use \`/unlock\` ou \`!unlock\`.`, CONFIG.COR_ERRO);
          logMod(message.guild.id, 'LOCK', canal.id, message.author.id, 'Canal trancado (prefixo)');
          await sendLogTyped(message.guild, 'lock', embed);
          await message.channel.send({
            embeds: [embed]
          }).catch(() => {});
        } else {
          await canal.permissionOverwrites.edit(message.guild.roles.everyone, {
            SendMessages: null
          });
          const embed = embedPadrao('🔓 Canal Destrancado', `**Canal:** <#${canal.id}>\n**Moderador:** <@${message.author.id}>\n\nO envio de mensagens para @everyone foi restaurado.\n\nPara bloquear o canal use \`/lock\` ou \`!lock\`.`, CONFIG.COR_SUCESSO);
          logMod(message.guild.id, 'UNLOCK', canal.id, message.author.id, 'Canal destrancado (prefixo)');
          await sendLogTyped(message.guild, 'unlock', embed);
          await message.channel.send({
            embeds: [embed]
          }).catch(() => {});
        }
      } catch (e) {
        await message.reply({
          content: `❌ Erro: ${e.message}`
        }).catch(() => {});
      }
      return;
    }
  }

  // Nota: os comandos de embed guardada deixaram de usar prefixo de texto (ex: "+comando").
  // Agora são comandos slash reais (ex: "/comando"), geridos em sincronizarComandosEmbed()
  // e tratados em tratarComandoSlashEmbed() no handler de InteractionCreate.
});

// ── Mensagem apagada ──
client.on(Events.MessageDelete, async message => {
  if (!message.guild || message.author?.bot) return;
  const embed = embedPadrao('🗑️ Mensagem Apagada', `**Autor:** ${message.author?.tag}\n**Canal:** <#${message.channel.id}>\n**Conteúdo:**\n${message.content?.substring(0, 1000) || '*Sem conteúdo*'}`, CONFIG.COR_ERRO);
  await sendLogTyped(message.guild, 'message_delete', embed);
});

// ── Mensagem editada ──
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  const embed = embedPadrao('✏️ Mensagem Editada', `**Autor:** ${newMsg.author?.tag}\n**Canal:** <#${newMsg.channel.id}>\n\n**Antes:**\n${oldMsg.content?.substring(0, 500) || '*Sem conteúdo*'}\n\n**Depois:**\n${newMsg.content?.substring(0, 500)}`, CONFIG.COR_AVISO).addFields({
    name: '🔗 Link',
    value: `[Ver mensagem](${newMsg.url})`
  });
  await sendLogTyped(newMsg.guild, 'message_edit', embed);
});

// ── Reaction Roles ──
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (_) {
      return;
    }
  }
  const emojiStr = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
  const rr = await db.prepare('SELECT * FROM reaction_roles WHERE message_id = ? AND (emoji = ? OR emoji = ?)').get(reaction.message.id, emojiStr, reaction.emoji.name);
  if (!rr) return;
  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  const role = guild.roles.cache.get(rr.role_id);
  if (!member || !role) return;
  await member.roles.add(role).catch(() => {});
});
client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (_) {
      return;
    }
  }
  const emojiStr = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
  const rr = await db.prepare('SELECT * FROM reaction_roles WHERE message_id = ? AND (emoji = ? OR emoji = ?)').get(reaction.message.id, emojiStr, reaction.emoji.name);
  if (!rr) return;
  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  const role = guild.roles.cache.get(rr.role_id);
  if (!member || !role) return;
  await member.roles.remove(role).catch(() => {});
});

// ── Canal deletado (limpa tickets da BD) ──
client.on(Events.ChannelDelete, async channel => {
  await db.prepare("UPDATE tickets SET status='deleted' WHERE channel_id = ?").run(channel.id);
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
    ativos = await db.prepare(`
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
      try {
        ultimosEnvios = JSON.parse(saved.schedule_daily_last_sent || '{}');
      } catch (_) {
        ultimosEnvios = {};
      }
      const chave = horaAtual; // um registo por horário do dia
      if (ultimosEnvios[chave] === hojeStr) continue; // já enviado hoje a esta hora

      const guild = client.guilds.cache.get(saved.guild_id);
      const canal = guild?.channels.cache.get(saved.schedule_daily_channel);
      if (!guild || !canal) {
        await db.prepare('UPDATE saved_embeds SET schedule_daily_active = 0 WHERE id = ?').run(saved.id);
        continue;
      }
      const data = JSON.parse(saved.data);
      const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp();
      if (data.image) embed.setImage(data.image);
      if (data.thumbnail) embed.setThumbnail(data.thumbnail);
      if (data.footer) embed.setFooter({
        text: data.footer
      });
      await canal.send({
        content: data.content || undefined,
        embeds: [embed]
      });
      ultimosEnvios[chave] = hojeStr;
      await db.prepare('UPDATE saved_embeds SET schedule_daily_last_sent = ? WHERE id = ?').run(JSON.stringify(ultimosEnvios), saved.id);
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
  const embed = new EmbedBuilder().setTitle(`🗳️ ${config.titulo}`).setDescription(`${config.descricao}\n\nVotação aberta até às **${config.hora_fim}**. Clica num botão para votares!`).setColor(CONFIG.COR_PRINCIPAL).setTimestamp();
  const rows = [];
  for (let i = 0; i < opcoes.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(opcoes.slice(i, i + 5).map(o => new ButtonBuilder().setCustomId(`votacao_vote_${o}`).setLabel(o.slice(0, 80)).setStyle(ButtonStyle.Primary)));
    rows.push(row);
  }
  try {
    const msg = await canal.send({
      content: '@everyone',
      embeds: [embed],
      components: rows,
      allowedMentions: {
        parse: ['everyone']
      }
    });
    await db.prepare(`
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
  const votos = await db.prepare('SELECT opcao, COUNT(*) as total FROM votacao_votos WHERE guild_id = ? AND data = ? GROUP BY opcao').all(guild.id, hojeStr);
  const opcoes = JSON.parse(config.opcoes);
  const contagem = {};
  opcoes.forEach(o => contagem[o] = 0);
  votos.forEach(v => {
    contagem[v.opcao] = v.total;
  });
  const totalVotos = Object.values(contagem).reduce((a, b) => a + b, 0);
  const maxVotos = Math.max(0, ...Object.values(contagem));
  const vencedores = maxVotos > 0 ? Object.keys(contagem).filter(o => contagem[o] === maxVotos) : [];

  // Desativa os botões da mensagem original
  if (canal && config.message_id) {
    try {
      const msg = await canal.messages.fetch(config.message_id);
      const oldRows = msg.components.map(row => new ActionRowBuilder().addComponents(row.components.map(c => ButtonBuilder.from(c).setDisabled(true))));
      await msg.edit({
        components: oldRows
      });
    } catch (_) {}
  }
  if (canal) {
    const ranking = Object.entries(contagem).sort((a, b) => b[1] - a[1]).map(([opcao, total]) => `**${opcao}** — ${total} voto${total === 1 ? '' : 's'}`).join('\n');
    let resultadoTexto;
    if (totalVotos === 0) {
      resultadoTexto = 'Ninguém votou hoje. 😕';
    } else if (vencedores.length === 1) {
      resultadoTexto = `🏆 A opção vencedora foi **${vencedores[0]}** com **${maxVotos}** voto${maxVotos === 1 ? '' : 's'}!`;
    } else {
      resultadoTexto = `🏆 Empate entre: **${vencedores.join(', ')}**, cada uma com **${maxVotos}** votos!`;
    }
    const embed = new EmbedBuilder().setTitle(`🗳️ Resultado: ${config.titulo}`).setDescription(`${resultadoTexto}\n\n**Resultados:**\n${ranking}\n\n**Total de votos:** ${totalVotos}`).setColor(CONFIG.COR_SUCESSO).setTimestamp();
    await canal.send({
      embeds: [embed]
    }).catch(() => {});
  }
  if (config.tipo === 'unica') {
    // Votação de dia único: não repete, remove a configuração por completo
    await db.prepare('DELETE FROM votacao_config WHERE guild_id = ?').run(guild.id);
    await db.prepare('DELETE FROM votacao_votos WHERE guild_id = ? AND data = ?').run(guild.id, hojeStr);
  } else {
    // Votação recorrente: fica pronta para o próximo dia
    await db.prepare('UPDATE votacao_config SET encerrada_hoje = 1, ativa_hoje = 0 WHERE guild_id = ?').run(guild.id);
    await db.prepare('DELETE FROM votacao_votos WHERE guild_id = ? AND data = ?').run(guild.id, hojeStr);
  }
}

// ============================
// GIVEAWAYS
// ============================

/** Constrói a embed pública de um giveaway */
// ============================
// PAINÉIS DE INFORMAÇÃO (embed configurável + botões ephemeral)
// ============================
function embedInfoPanel(panel) {
  const embed = new EmbedBuilder().setColor(panel.color || CONFIG.COR_PRINCIPAL);
  if (panel.title) embed.setTitle(panel.title);

  // Descrição com um separador subtil antes dos campos de info (dono/fundado/etc.),
  // para dar mais "respiração" visual — só é adicionado se houver campos a seguir.
  const temCamposInfo = panel.founded_text || panel.owner_text;
  let descricao = panel.description ? panel.description.trim() : '';
  if (descricao && temCamposInfo) {
    descricao += '\n\n' + '▬'.repeat(16);
  }
  if (descricao) embed.setDescription(descricao);
  if (panel.banner_url) embed.setImage(panel.banner_url);
  if (panel.thumbnail_url) embed.setThumbnail(panel.thumbnail_url);
  const campos = [];
  if (panel.founded_text) campos.push({
    name: '📅 Fundado',
    value: panel.founded_text,
    inline: true
  });
  if (panel.owner_text) campos.push({
    name: '👑 Dono',
    value: panel.owner_text,
    inline: true
  });
  let extra = [];
  try {
    extra = JSON.parse(panel.extra_fields || '[]');
  } catch (_) {}
  for (const f of extra) {
    if (f && f.name && f.value) campos.push({
      name: f.name,
      value: f.value,
      inline: !!f.inline
    });
  }
  if (campos.length) embed.addFields(campos);

  // Footer: usa o texto configurado; se não houver, mostra um footer discreto por
  // omissão para a embed nunca parecer "vazia" em baixo.
  if (panel.footer_text) {
    embed.setFooter({
      text: panel.footer_text
    });
  }
  embed.setTimestamp();
  return embed;
}
function botoesInfoPanel(panelId, botoes) {
  const styleMap = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger
  };
  const rows = [];
  let row = new ActionRowBuilder();
  botoes.forEach((b, i) => {
    if (i > 0 && i % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    const btn = new ButtonBuilder().setCustomId(`infopanel_btn_${b.id}`).setLabel(b.label.substring(0, 80)).setStyle(styleMap[b.style] || ButtonStyle.Primary);
    if (b.emoji) btn.setEmoji(b.emoji);
    row.addComponents(btn);
  });
  if (row.components.length) rows.push(row);
  return rows;
}
function embedGiveaway(gw, totalEntradas, encerrado, vencedoresTexto) {
  const tituloBase = gw.titulo || 'SORTEIO';
  const embed = new EmbedBuilder().setAuthor({
    name: encerrado ? '🔴 Sorteio Encerrado' : '🟢 Sorteio Ativo'
  }).setTitle(`🎉 ${tituloBase} 🎉`)
  // Cor muda consoante o estado: dourado enquanto ativo, vermelho quando termina
  .setColor(encerrado ? CONFIG.COR_ERRO : 0xFFD700).setDescription((gw.descricao ? `*${gw.descricao}*\n\n` : '') + `${'▬'.repeat(20)}\n` + (encerrado ? vencedoresTexto ? `## 🏆 Vencedor(es)\n${vencedoresTexto}\n\n*Parabéns! Contacta o organizador para receberes o teu prémio.*` : `## 😔 Sem vencedor\nNinguém participou neste sorteio.` : `Clica no botão 🎉 abaixo para participares!\n\nBoa sorte a todos! 🍀`)).addFields({
    name: '🎁 Prémio',
    value: `**${gw.premio}**`,
    inline: true
  }, {
    name: '👥 Vencedores',
    value: `**${gw.vencedores}**`,
    inline: true
  }, {
    name: '🙋 Participantes',
    value: `**${totalEntradas}**`,
    inline: true
  }, {
    name: '⏰ Termina',
    value: encerrado ? '`Encerrado`' : `<t:${Math.floor(new Date(gw.ends_at + 'Z').getTime() / 1000)}:R> (<t:${Math.floor(new Date(gw.ends_at + 'Z').getTime() / 1000)}:f>)`,
    inline: false
  }).setFooter({
    text: `Giveaway #${gw.id}`
  }).setTimestamp();
  if (gw.imagem_url) embed.setImage(gw.imagem_url);
  return embed;
}
function botaoGiveaway(gw, totalEntradas, desativado = false) {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`giveaway_join_${gw.id}`).setLabel(desativado ? 'Sorteio Encerrado' : `🎉 Participar (${totalEntradas})`).setStyle(ButtonStyle.Success).setDisabled(desativado));
}
async function atualizarBotaoGiveaway(guild, gw, totalEntradas) {
  if (!gw.message_id) return;
  const canal = guild.channels.cache.get(gw.channel_id);
  if (!canal) return;
  const msg = await canal.messages.fetch(gw.message_id).catch(() => null);
  if (!msg) return;
  // Atualiza também a embed (não só o botão), para que o número de participantes
  // fique sempre correto e visível na própria embed, não só no botão.
  await msg.edit({
    embeds: [embedGiveaway(gw, totalEntradas, false)],
    components: [botaoGiveaway(gw, totalEntradas, false)]
  }).catch(() => {});
}

/** Escolhe N vencedores aleatórios entre os participantes */
async function sortearVencedores(giveawayId, quantidade) {
  const entradas = (await db.prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?').all(giveawayId)).map(e => e.user_id);
  if (entradas.length === 0) return [];
  // Fisher-Yates parcial
  const pool = [...entradas];
  const vencedores = [];
  const n = Math.min(quantidade, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    vencedores.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return vencedores;
}

/** Encerra um giveaway: sorteia vencedores, edita a mensagem e anuncia */
async function encerrarGiveaway(guild, gw) {
  const total = (await db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(gw.id)).c;
  const vencedores = sortearVencedores(gw.id, gw.vencedores);
  const vencedoresTexto = vencedores.length ? vencedores.map(id => `<@${id}>`).join(', ') : '';

  // Usa fetch (não só cache) para não perder o canal/guild se ainda não estiverem populados,
  // o que antes fazia o giveaway ser marcado como terminado sem nunca revelar o vencedor.
  const canal = guild.channels.cache.get(gw.channel_id) || (await guild.channels.fetch(gw.channel_id).catch(() => null));
  if (!canal) {
    console.error(`❌ Giveaway #${gw.id}: canal ${gw.channel_id} não encontrado. Não marcado como terminado, tentará novamente.`);
    return null; // não marca como ended — o cron tenta de novo no próximo minuto
  }
  let mensagemEditada = true;
  if (gw.message_id) {
    const msg = await canal.messages.fetch(gw.message_id).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [embedGiveaway(gw, total, true, vencedoresTexto)],
        components: [botaoGiveaway(gw, total, true)]
      }).catch(() => {
        mensagemEditada = false;
      });
    } else {
      mensagemEditada = false;
    }
  }
  let anuncioEnviado = true;
  if (vencedores.length) {
    await canal.send({
      content: `🎉 Parabéns ${vencedoresTexto}! Ganhaste(s) **${gw.premio}**! 🏆`,
      allowedMentions: {
        users: vencedores
      }
    }).catch(() => {
      anuncioEnviado = false;
    });
  } else {
    await canal.send({
      content: `😔 O sorteio de **${gw.premio}** terminou sem participantes.`
    }).catch(() => {
      anuncioEnviado = false;
    });
  }

  // Só marca como terminado depois de conseguir editar a mensagem e enviar o anúncio,
  // para não perder giveaways silenciosamente caso o canal/mensagem estejam temporariamente indisponíveis.
  if (mensagemEditada && anuncioEnviado) {
    await db.prepare('UPDATE giveaways SET ended = 1 WHERE id = ?').run(gw.id);
  } else {
    console.error(`⚠️ Giveaway #${gw.id}: falha ao editar/anunciar. Vai tentar novamente no próximo ciclo.`);
    return null;
  }
  return vencedores;
}

/** Verifica giveaways ativos e encerra os que já passaram da hora (rede de segurança) */
async function verificarGiveaways() {
  const agora = new Date();
  const ativos = await db.prepare('SELECT * FROM giveaways WHERE ended = 0').all();
  for (const gw of ativos) {
    const guild = client.guilds.cache.get(gw.guild_id);
    if (!guild) continue;
    const endsAt = new Date(gw.ends_at + 'Z');
    if (agora >= endsAt) {
      await encerrarGiveaway(guild, gw).catch(err => console.error('❌ Erro ao encerrar giveaway:', err.message));
    }
  }
}

// Guarda os timers agendados por giveaway, para poder cancelar (ex: se for encerrado manualmente)
const giveawayTimers = new Map();

/** Agenda o encerramento exato de um giveaway, para não depender só do cron de 1 em 1 minuto */
function agendarEncerramentoGiveaway(gw) {
  // Cancela timer anterior, se existir (evita duplicados)
  const antigo = giveawayTimers.get(gw.id);
  if (antigo) clearTimeout(antigo);
  const endsAt = new Date(gw.ends_at + 'Z');
  const delay = endsAt.getTime() - Date.now();
  const executar = async () => {
    giveawayTimers.delete(gw.id);
    const atual = await db.prepare('SELECT * FROM giveaways WHERE id = ?').get(gw.id);
    if (!atual || atual.ended) return; // já foi encerrado (manualmente ou pelo cron)
    const guild = client.guilds.cache.get(atual.guild_id);
    if (!guild) return; // o cron de segurança trata disto mais tarde
    await encerrarGiveaway(guild, atual).catch(err => console.error('❌ Erro ao encerrar giveaway (timer):', err.message));
  };

  // setTimeout tem um limite de ~24.8 dias; para durações maiores, o cron de segurança
  // (a cada minuto) trata do encerramento quando chegar a altura.
  const MAX_TIMEOUT = 2147483647;
  if (delay <= 0) {
    executar();
  } else if (delay <= MAX_TIMEOUT) {
    const timer = setTimeout(executar, delay);
    giveawayTimers.set(gw.id, timer);
  }
}

/** Cancela o timer agendado de um giveaway (usar ao terminar/cancelar manualmente) */
function cancelarTimerGiveaway(giveawayId) {
  const timer = giveawayTimers.get(giveawayId);
  if (timer) {
    clearTimeout(timer);
    giveawayTimers.delete(giveawayId);
  }
}

/** Agenda todos os giveaways ativos guardados na BD (chamar no arranque do bot) */
async function agendarGiveawaysExistentes() {
  const ativos = await db.prepare('SELECT * FROM giveaways WHERE ended = 0').all();
  for (const gw of ativos) {
    agendarEncerramentoGiveaway(gw);
  }
}

/** Converte string de duração (ex: "10m", "2h", "1d") em milissegundos */
function parseDuracao(str) {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec(String(str).trim());
  if (!match) return null;
  const valor = parseInt(match[1]);
  const unidade = match[2].toLowerCase();
  const multiplicadores = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000
  };
  return valor * multiplicadores[unidade];
}

/** Verifica todas as votações configuradas e publica/encerra conforme a hora atual (fuso: Europe/Lisbon) */
async function verificarVotacoes() {
  const now = new Date();
  // Usa sempre a hora de Portugal, independentemente do fuso horário do servidor (Render usa UTC)
  const horaAtual = now.toLocaleTimeString('pt-PT', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const hojeStr = now.toLocaleDateString('en-CA', {
    timeZone: 'Europe/Lisbon'
  }); // formato YYYY-MM-DD

  const configs = await db.prepare('SELECT * FROM votacao_config').all();
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
      await db.prepare('UPDATE votacao_config SET ativa_hoje = 0, encerrada_hoje = 0 WHERE guild_id = ?').run(config.guild_id);
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

  // Verifica giveaways ativos a cada minuto (encerra os que já terminaram)
  cron.schedule('* * * * *', () => verificarGiveaways());

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
    pendentes = await db.prepare(`
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
        await db.prepare('UPDATE saved_embeds SET schedule_active = 0 WHERE id = ?').run(saved.id);
        continue;
      }
      const data = JSON.parse(saved.data);
      const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp();
      if (data.image) embed.setImage(data.image);
      if (data.thumbnail) embed.setThumbnail(data.thumbnail);
      if (data.footer) embed.setFooter({
        text: data.footer
      });

      // Envia a quantidade configurada de seguida (mínimo 1), com um pequeno intervalo
      // entre cada uma para não sermos rate-limited pelo Discord.
      const quantidade = saved.schedule_quantity && saved.schedule_quantity > 0 ? saved.schedule_quantity : 1;
      for (let i = 0; i < quantidade; i++) {
        await canal.send({
          content: data.content || undefined,
          embeds: [embed]
        });
        if (i < quantidade - 1) await new Promise(r => setTimeout(r, 1000));
      }

      // Usa datetime('now', '+N minutes') do próprio SQLite — mesmo formato usado na
      // condição WHERE acima, evita o bug de comparar strings ISO com strings SQLite.
      await db.prepare(`
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
  app.use(express.urlencoded({
    extended: true
  }));
  app.use(session({
    secret: CONFIG.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 86400000
    } // 24h
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
        headers: {
          Authorization: `Bearer ${user.token}`
        }
      });
      const guilds = guildsRes.data.filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8));
      user.guilds = guilds;
      guildsCache.set(user.id, {
        guilds,
        expiresAt: Date.now() + GUILDS_CACHE_TTL
      });
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
    const {
      guildId
    } = req.params;
    if (!userIsGuildAdmin(req, guildId)) {
      return res.status(403).send(renderDashboard(req.session.user, null, 'Acesso negado: so administradores deste servidor podem aceder ao dashboard.'));
    }
    next();
  }

  // Middleware para rotas de API: exige sessao + Administrador no guildId. Responde 403 JSON.
  async function requireGuildAdminApi(req, res, next) {
    if (!req.session?.user) return res.status(401).json({
      error: 'not_authenticated'
    });
    await refreshUserGuilds(req);
    const {
      guildId
    } = req.params;
    if (!userIsGuildAdmin(req, guildId)) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Nao tens permissao de Administrador neste servidor.'
      });
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
      scope: 'identify guilds'
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
        redirect_uri: CONFIG.REDIRECT_URI
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      const {
        access_token
      } = tokenRes.data;

      // Obtém dados do utilizador
      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });
      const discordUser = userRes.data;

      // Obtém servidores
      const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });
      const guilds = guildsRes.data.filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)); // Admin only

      req.session.user = {
        id: discordUser.id,
        username: discordUser.username,
        avatar: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator) % 5 || 0}.png`,
        guilds,
        token: access_token
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

  /**
   * Reúne todos os dados usados pelo dashboard de um servidor (a mesma
   * lógica que a rota /dashboard/:guildId usava inline). Extraído para uma
   * função à parte para poder ser reaproveitado pela rota que devolve o HTML
   * de uma única secção (usada para atualizar o dashboard sem dar reload à
   * página inteira sempre que se guarda algo).
   */
  async function buildDashboardData(guild) {
    const guildId = guild.id;
    const ticketConfig = await db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guildId);
    const guildConfig = await db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
    const antispam = await db.prepare('SELECT * FROM antispam_config WHERE guild_id = ?').get(guildId);
    const statsConfig = await db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);
    const votacaoConfig = await db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guildId);
    const sugestaoConfig = await db.prepare('SELECT * FROM suggestion_config WHERE guild_id = ?').get(guildId);
    const rrPaineis = await db.prepare('SELECT * FROM reaction_role_panels WHERE guild_id = ? ORDER BY id DESC').all(guildId);
    const autoroleHumanos = (await db.prepare("SELECT role_id FROM autorole_config WHERE guild_id = ? AND target = 'human'").all(guildId)).map(r => r.role_id);
    const autoroleBots = (await db.prepare("SELECT role_id FROM autorole_config WHERE guild_id = ? AND target = 'bot'").all(guildId)).map(r => r.role_id);
    const roleExclusivity = await db.prepare('SELECT * FROM role_exclusivity WHERE guild_id = ? ORDER BY id DESC').all(guildId);
    const blacklist = await db.prepare('SELECT * FROM blacklist WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
    let immuneRoles = [];
    try {
      immuneRoles = JSON.parse(guildConfig?.immune_roles || '[]');
    } catch (_) {}
    const reactionRoles = rrPaineis.map(async p => ({
      ...p,
      itens: await db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ?').all(guildId, p.message_id)
    }));
    const ticketTypes = await db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num, id').all(guildId);
    const savedEmbeds = await db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
    const perguntas = await db.prepare('SELECT * FROM perguntas WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50').all(guildId);
    const staffRanking = getRankingStaff(guildId);

    // Stats rápidos
    const totalTickets = (await db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ?").get(guildId))?.c || 0;
    const openTickets = (await db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND status='open'").get(guildId))?.c || 0;
    const totalWarns = (await db.prepare("SELECT COUNT(*) as c FROM warns WHERE guild_id = ?").get(guildId))?.c || 0;
    const totalSugs = (await db.prepare("SELECT COUNT(*) as c FROM suggestions WHERE guild_id = ?").get(guildId))?.c || 0;
    const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({
      id: c.id,
      name: c.name
    }));
    const roles = guild.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position).map(r => ({
      id: r.id,
      name: r.name,
      color: r.hexColor
    }));
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(c => ({
      id: c.id,
      name: c.name
    }));

    // Lista de membros para dropdown de moderação (pesquisável)
    let members = [];
    try {
      await guild.members.fetch();
      members = guild.members.cache.filter(m => !m.user.bot).map(m => ({
        id: m.id,
        name: `${m.user.username}${m.nickname ? ' (' + m.nickname + ')' : ''}`
      })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      members = guild.members.cache.filter(m => !m.user.bot).map(m => ({
        id: m.id,
        name: m.user.username
      }));
    }
    return {
      ticketConfig,
      guildConfig,
      antispam,
      statsConfig,
      votacaoConfig,
      sugestaoConfig,
      reactionRoles,
      ticketTypes,
      savedEmbeds,
      perguntas,
      staffRanking,
      members,
      totalTickets,
      openTickets,
      totalWarns,
      totalSugs,
      channels,
      roles,
      categories,
      autoroleHumanos,
      autoroleBots,
      roleExclusivity,
      blacklist,
      immuneRoles
    };
  }
  app.get('/dashboard/:guildId', requireAuth, requireGuildAdminPage, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const userGuild = req.session.user.guilds?.find(g => g.id === guildId);
    if (!guild || !userGuild) {
      return res.send(renderDashboard(req.session.user, null, 'Servidor não encontrado ou sem permissões.'));
    }
    const data = await buildDashboardData(guild);
    res.send(renderGuildDashboard(req.session.user, guild, data));
  });

  // Devolve o HTML atualizado de UMA secção do dashboard (identificada pelo id
  // da <div class="section" id="...">), para o frontend poder substituir só
  // essa secção depois de guardar/apagar algo, sem recarregar a página toda.
  app.get('/api/:guildId/section-html/:sectionId', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      sectionId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });

    // Apenas ids simples (letras, números, underscore) são aceites — evita
    // qualquer tentativa de injeção via parâmetro de rota na regex abaixo.
    if (!/^[a-zA-Z0-9_]+$/.test(sectionId)) {
      return res.status(400).json({
        ok: false,
        message: 'Id de secção inválido.'
      });
    }
    try {
      const data = await buildDashboardData(guild);
      const fullHtml = renderGuildDashboard(req.session.user, guild, data);

      // Extrai o conteúdo INTERNO da <div id="sectionId" class="section" ...> ... </div>
      // correspondente, procurando a divisão de abertura e depois fazendo o
      // balanceamento de <div> para encontrar o fecho certo (as secções têm
      // divs aninhadas lá dentro).
      const openTagRe = new RegExp('<div id="' + sectionId + '"[^>]*class="[^"]*\\bsection\\b[^"]*"[^>]*>');
      const match = openTagRe.exec(fullHtml);
      if (!match) return res.status(404).json({
        ok: false,
        message: 'Secção não encontrada.'
      });
      let depth = 1;
      let i = match.index + match[0].length;
      const innerStart = i;
      const divRe = /<div\b[^>]*>|<\/div>/g;
      divRe.lastIndex = i;
      let m;
      let innerEnd = -1;
      while (m = divRe.exec(fullHtml)) {
        if (m[0].startsWith('</div')) {
          depth--;
          if (depth === 0) {
            innerEnd = m.index;
            break;
          }
        } else {
          depth++;
        }
      }
      if (innerEnd === -1) return res.status(500).json({
        ok: false,
        message: 'Erro ao extrair a secção.'
      });
      const inner = fullHtml.slice(innerStart, innerEnd);
      res.json({
        ok: true,
        html: inner
      });
    } catch (e) {
      console.error('❌ Erro ao gerar HTML da secção', sectionId, ':', e.message);
      res.status(500).json({
        ok: false,
        message: 'Erro ao atualizar a secção.'
      });
    }
  });

  // ── API Endpoints ──
  app.post('/api/:guildId/ticket-config', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      category_id,
      log_channel,
      support_role,
      transcript_channel,
      max_tickets,
      welcome_msg,
      panel_mode,
      panel_color
    } = req.body;
    const modoFinal = panel_mode === 'buttons' ? 'buttons' : 'select';
    const corFinal = /^#[0-9A-Fa-f]{6}$/.test(panel_color || '') ? panel_color : '#5865F2';
    await db.prepare(`
    INSERT INTO ticket_config (guild_id, category_id, log_channel, support_role, transcript_channel, max_tickets, welcome_msg, enabled, panel_mode, panel_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      category_id=excluded.category_id, log_channel=excluded.log_channel,
      support_role=excluded.support_role, transcript_channel=excluded.transcript_channel,
      max_tickets=excluded.max_tickets, welcome_msg=excluded.welcome_msg, enabled=1,
      panel_mode=excluded.panel_mode, panel_color=excluded.panel_color
  `).run(guildId, category_id || null, log_channel || null, support_role || null, transcript_channel || null, parseInt(max_tickets) || 3, welcome_msg || 'Olá {user}!', modoFinal, corFinal);
    res.json({
      ok: true,
      message: 'Configuração de tickets guardada!'
    });
  });

  // Envia o painel de tickets (equivalente ao /ticket-painel), a partir do Dashboard
  app.post('/api/:guildId/ticket-painel', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      channel_id,
      titulo,
      descricao
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!channel_id) return res.status(400).json({
      ok: false,
      message: 'Escolhe um canal para o painel.'
    });
    const ticketConfig = await db.prepare('SELECT * FROM ticket_config WHERE guild_id = ?').get(guildId);
    if (!ticketConfig) return res.status(400).json({
      ok: false,
      message: 'Configura primeiro o sistema de tickets (categoria, etc.) antes de enviar o painel.'
    });
    try {
      const canal = guild.channels.cache.get(channel_id);
      if (!canal) return res.status(404).json({
        ok: false,
        message: 'Canal não encontrado.'
      });
      const tituloFinal = titulo && titulo.trim() || '🎫 Suporte';
      const descricaoFinal = descricao && descricao.trim() || 'Clica no botão abaixo para abrir um ticket de suporte.\nA nossa equipa irá responder o mais brevemente possível!';
      const embed = new EmbedBuilder().setTitle(tituloFinal).setDescription(descricaoFinal).setColor(ticketConfig.panel_color || CONFIG.COR_PRINCIPAL).setTimestamp();
      const components = montarComponentesPainelTicket(guildId, ticketConfig);
      const msg = await canal.send({
        embeds: [embed],
        components
      });
      await db.prepare(`UPDATE ticket_config SET panel_msg_id=?, panel_channel_id=? WHERE guild_id=?`).run(msg.id, canal.id, guildId);
      res.json({
        ok: true,
        message: `✅ Painel de tickets enviado em #${canal.name}!`
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/welcome-config', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      welcome_channel,
      welcome_title,
      welcome_msg,
      welcome_embed,
      welcome_image,
      autorole,
      welcome_color,
      welcome_author_name,
      welcome_author_icon,
      welcome_thumbnail,
      welcome_footer,
      welcome_image_pos,
      welcome_content,
      welcome_url
    } = req.body;
    const corValida = /^#[0-9A-Fa-f]{6}$/.test(welcome_color || '') ? welcome_color : '#5865F2';
    const posValida = ['bottom', 'thumbnail', 'none'].includes(welcome_image_pos) ? welcome_image_pos : 'bottom';
    await db.prepare(`
    INSERT INTO guild_config (
      guild_id, welcome_channel, welcome_title, welcome_msg, welcome_embed, welcome_image, autorole,
      welcome_color, welcome_author_name, welcome_author_icon, welcome_thumbnail,
      welcome_footer, welcome_image_pos, welcome_content, welcome_url
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET
      welcome_channel=excluded.welcome_channel, welcome_title=excluded.welcome_title,
      welcome_msg=excluded.welcome_msg, welcome_embed=excluded.welcome_embed,
      welcome_image=excluded.welcome_image, autorole=excluded.autorole,
      welcome_color=excluded.welcome_color, welcome_author_name=excluded.welcome_author_name,
      welcome_author_icon=excluded.welcome_author_icon, welcome_thumbnail=excluded.welcome_thumbnail,
      welcome_footer=excluded.welcome_footer, welcome_image_pos=excluded.welcome_image_pos,
      welcome_content=excluded.welcome_content, welcome_url=excluded.welcome_url
  `).run(guildId, welcome_channel || null, welcome_title || null, welcome_msg || 'Bem-vindo ${usermention}!', welcome_embed === '1' ? 1 : 0, welcome_image || null, autorole || null, corValida, welcome_author_name || null, welcome_author_icon || null, welcome_thumbnail || null, welcome_footer || null, posValida, welcome_content || null, welcome_url || null);
    res.json({
      ok: true,
      message: 'Configuração de boas-vindas guardada!'
    });
  });

  // ============================
  // API — MENSAGENS DE BOAS-VINDAS (multi, nomeadas — estilo Sapphire)
  // ============================
  const WELCOME_MSG_CAMPOS = ['welcome_channel', 'autorole', 'welcome_embed', 'welcome_content', 'welcome_title', 'welcome_url', 'welcome_msg', 'welcome_color', 'welcome_author_name', 'welcome_author_icon', 'welcome_image_pos', 'welcome_image', 'welcome_thumbnail', 'welcome_footer'];
  app.get('/api/:guildId/welcome-messages', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const linhas = await db.prepare('SELECT * FROM welcome_messages WHERE guild_id = ? ORDER BY created_at ASC').all(guildId);
    const comExtras = linhas.map(w => ({
      ...w,
      channel_name: guild?.channels.cache.get(w.welcome_channel)?.name || null
    }));
    res.json(comExtras);
  });
  app.get('/api/:guildId/welcome-messages/:id', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const linha = await db.prepare('SELECT * FROM welcome_messages WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!linha) return res.status(404).json({
      ok: false,
      message: 'Mensagem de boas-vindas não encontrada.'
    });
    res.json(linha);
  });
  app.post('/api/:guildId/welcome-messages', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const nome = (req.body?.name || '').trim();
    if (!nome) return res.status(400).json({
      ok: false,
      message: '❌ Dá um nome a esta mensagem de boas-vindas.'
    });
    const existente = await db.prepare('SELECT id FROM welcome_messages WHERE guild_id = ? AND name = ?').get(guildId, nome);
    if (existente) return res.status(400).json({
      ok: false,
      message: `❌ Já existe uma mensagem chamada "${nome}".`
    });
    const cor = (req.body?.welcome_color || '').trim() || '#5865F2';
    if (!/^#([0-9A-Fa-f]{6})$/.test(cor)) {
      return res.status(400).json({
        ok: false,
        message: '❌ Cor inválida. Usa o formato hex, ex: #5865F2.'
      });
    }
    const posValida = ['bottom', 'thumbnail', 'none'].includes(req.body?.welcome_image_pos) ? req.body.welcome_image_pos : 'bottom';

    // A primeira mensagem de boas-vindas de um servidor nasce automaticamente ativa
    const totalExistentes = (await db.prepare('SELECT COUNT(*) AS c FROM welcome_messages WHERE guild_id = ?').get(guildId)).c;
    const ativa = totalExistentes === 0 ? 1 : 0;
    const info = await db.prepare(`
    INSERT INTO welcome_messages (
      guild_id, name, is_active, welcome_channel, autorole, welcome_embed,
      welcome_content, welcome_title, welcome_url, welcome_msg, welcome_color,
      welcome_author_name, welcome_author_icon, welcome_image_pos, welcome_image,
      welcome_thumbnail, welcome_footer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, nome, ativa, req.body?.welcome_channel || null, req.body?.autorole || null, req.body?.welcome_embed === '1' || req.body?.welcome_embed === 1 ? 1 : 0, (req.body?.welcome_content || '').trim() || null, (req.body?.welcome_title || '').trim() || null, (req.body?.welcome_url || '').trim() || null, (req.body?.welcome_msg || '').trim() || null, cor, (req.body?.welcome_author_name || '').trim() || null, (req.body?.welcome_author_icon || '').trim() || null, posValida, (req.body?.welcome_image || '').trim() || null, (req.body?.welcome_thumbnail || '').trim() || null, (req.body?.welcome_footer || '').trim() || null);
    res.json({
      ok: true,
      message: `✅ Mensagem "${nome}" criada!`,
      id: info.lastInsertRowid
    });
  });
  app.put('/api/:guildId/welcome-messages/:id', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const linha = await db.prepare('SELECT * FROM welcome_messages WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!linha) return res.status(404).json({
      ok: false,
      message: 'Mensagem de boas-vindas não encontrada.'
    });
    const nome = (req.body?.name || '').trim();
    if (!nome) return res.status(400).json({
      ok: false,
      message: '❌ Dá um nome a esta mensagem de boas-vindas.'
    });
    const duplicado = await db.prepare('SELECT id FROM welcome_messages WHERE guild_id = ? AND name = ? AND id != ?').get(guildId, nome, id);
    if (duplicado) return res.status(400).json({
      ok: false,
      message: `❌ Já existe uma mensagem chamada "${nome}".`
    });
    const cor = (req.body?.welcome_color || '').trim() || '#5865F2';
    if (!/^#([0-9A-Fa-f]{6})$/.test(cor)) {
      return res.status(400).json({
        ok: false,
        message: '❌ Cor inválida. Usa o formato hex, ex: #5865F2.'
      });
    }
    const posValida = ['bottom', 'thumbnail', 'none'].includes(req.body?.welcome_image_pos) ? req.body.welcome_image_pos : 'bottom';
    await db.prepare(`
    UPDATE welcome_messages SET
      name = ?, welcome_channel = ?, autorole = ?, welcome_embed = ?, welcome_content = ?,
      welcome_title = ?, welcome_url = ?, welcome_msg = ?, welcome_color = ?,
      welcome_author_name = ?, welcome_author_icon = ?, welcome_image_pos = ?,
      welcome_image = ?, welcome_thumbnail = ?, welcome_footer = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND guild_id = ?
  `).run(nome, req.body?.welcome_channel || null, req.body?.autorole || null, req.body?.welcome_embed === '1' || req.body?.welcome_embed === 1 ? 1 : 0, (req.body?.welcome_content || '').trim() || null, (req.body?.welcome_title || '').trim() || null, (req.body?.welcome_url || '').trim() || null, (req.body?.welcome_msg || '').trim() || null, cor, (req.body?.welcome_author_name || '').trim() || null, (req.body?.welcome_author_icon || '').trim() || null, posValida, (req.body?.welcome_image || '').trim() || null, (req.body?.welcome_thumbnail || '').trim() || null, (req.body?.welcome_footer || '').trim() || null, id, guildId);
    res.json({
      ok: true,
      message: `✅ Mensagem "${nome}" atualizada!`
    });
  });
  app.delete('/api/:guildId/welcome-messages/:id', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const linha = await db.prepare('SELECT * FROM welcome_messages WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!linha) return res.status(404).json({
      ok: false,
      message: 'Mensagem de boas-vindas não encontrada.'
    });
    await db.prepare('DELETE FROM welcome_messages WHERE id = ? AND guild_id = ?').run(id, guildId);

    // Se a que foi apagada era a ativa, promove a mais antiga que sobrou (se houver)
    if (linha.is_active) {
      const proxima = await db.prepare('SELECT id FROM welcome_messages WHERE guild_id = ? ORDER BY created_at ASC LIMIT 1').get(guildId);
      if (proxima) await db.prepare('UPDATE welcome_messages SET is_active = 1 WHERE id = ?').run(proxima.id);
    }
    res.json({
      ok: true,
      message: '✅ Mensagem de boas-vindas apagada.'
    });
  });

  // Marca uma mensagem de boas-vindas como a ATIVA (só uma pode estar ativa por servidor)
  app.post('/api/:guildId/welcome-messages/:id/activate', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const linha = await db.prepare('SELECT * FROM welcome_messages WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!linha) return res.status(404).json({
      ok: false,
      message: 'Mensagem de boas-vindas não encontrada.'
    });
    await db.prepare('UPDATE welcome_messages SET is_active = 0 WHERE guild_id = ?').run(guildId);
    await db.prepare('UPDATE welcome_messages SET is_active = 1 WHERE id = ?').run(id);
    res.json({
      ok: true,
      message: `✅ "${linha.name}" é agora a mensagem de boas-vindas ativa.`
    });
  });

  // Preview do embed de boas-vindas: devolve o JSON do embed já com as variáveis
  // substituídas pelos dados do próprio utilizador logado, para o dashboard desenhar
  // o preview em tempo real (equivalente ao painel "Preview" do Sapphire).
  app.post('/api/:guildId/welcome-preview', requireGuildAdminApi, (req, res) => {
    try {
      const {
        guildId
      } = req.params;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({
        ok: false,
        message: 'Servidor não encontrado.'
      });

      // Usa o próprio utilizador da sessão (ou o bot, como fallback) como "membro" fictício para o preview
      const previewUser = req.session?.user;
      const fakeMember = {
        id: previewUser?.id || client.user.id,
        guild,
        user: {
          id: previewUser?.id || client.user.id,
          username: previewUser?.username || client.user.username,
          tag: previewUser ? `${previewUser.username}` : client.user.tag,
          createdTimestamp: Date.now(),
          displayAvatarURL: () => previewUser?.avatar ? `https://cdn.discordapp.com/avatars/${previewUser.id}/${previewUser.avatar}.png` : client.user.displayAvatarURL()
        }
      };

      // Usa os dados enviados pelo formulário (ainda não guardados) para o preview refletir o que está a ser editado
      const configPreview = {
        ...req.body
      };
      const embed = construirEmbedWelcome(configPreview, fakeMember);
      const conteudoFora = substituirVariaveisWelcome(configPreview.welcome_content || '', fakeMember);
      res.json({
        ok: true,
        content: conteudoFora,
        embed: embed.toJSON()
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: 'Erro ao gerar preview: ' + e.message
      });
    }
  });
  app.post('/api/:guildId/antispam-config', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      enabled,
      max_messages,
      action,
      mute_duration,
      anti_links,
      anti_invites,
      anti_raid,
      log_channel,
      trap_channel,
      anti_bot_add
    } = req.body;
    const muteDurationSeconds = Math.min(Math.max(parseInt(mute_duration) || 300, 10), 2419200);
    await db.prepare(`
    INSERT INTO antispam_config (guild_id, enabled, max_messages, action, mute_duration, anti_links, anti_invites, anti_raid, log_channel, trap_channel, anti_bot_add)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET
      enabled=excluded.enabled, max_messages=excluded.max_messages, action=excluded.action,
      mute_duration=excluded.mute_duration,
      anti_links=excluded.anti_links, anti_invites=excluded.anti_invites,
      anti_raid=excluded.anti_raid, log_channel=excluded.log_channel,
      trap_channel=excluded.trap_channel, anti_bot_add=excluded.anti_bot_add
  `).run(guildId, enabled === '1' ? 1 : 0, parseInt(max_messages) || 5, action || 'mute', muteDurationSeconds, anti_links === '1' ? 1 : 0, anti_invites === '1' ? 1 : 0, anti_raid === '1' ? 1 : 0, log_channel || null, trap_channel || null, anti_bot_add === '1' ? 1 : 0);

    // Envia o aviso no canal-armadilha (se foi definido/alterado a partir do dashboard)
    if (trap_channel) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) await enviarAvisoTrapChannel(guild, trap_channel);
    }
    res.json({
      ok: true,
      message: 'Configuração AntiSpam guardada!'
    });
  });
  app.post('/api/:guildId/antispam-link-channels', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      channels,
      mode
    } = req.body; // mode: 'all' ou 'specific'
    if (!Array.isArray(channels)) return res.status(400).json({
      ok: false,
      message: 'Lista inválida.'
    });

    // 'all' → guarda lista vazia, que significa "aplica-se a TODOS os canais"
    // 'specific' → guarda só os canais escolhidos (pode ser 1, vários ou (quase) todos)
    const lista = mode === 'all' ? [] : channels.map(c => String(c).trim()).filter(c => c);
    await db.prepare('INSERT OR IGNORE INTO antispam_config (guild_id) VALUES (?)').run(guildId);
    await db.prepare('UPDATE antispam_config SET link_invite_channels = ? WHERE guild_id = ?').run(JSON.stringify(lista), guildId);
    res.json({
      ok: true,
      message: mode === 'all' ? '✅ Anti-links/Anti-convites vão aplicar-se a TODOS os canais!' : `✅ Anti-links/Anti-convites vão aplicar-se apenas a ${lista.length} canal(is) escolhido(s)!`
    });
  });

  // ── Canais onde o Anti-Links/Anti-Convites NUNCA se aplica (exceções) ──
  app.post('/api/:guildId/antispam-link-excluded-channels', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      channels
    } = req.body;
    if (!Array.isArray(channels)) return res.status(400).json({
      ok: false,
      message: 'Lista inválida.'
    });
    const lista = channels.map(c => String(c).trim()).filter(c => c);
    await db.prepare('INSERT OR IGNORE INTO antispam_config (guild_id) VALUES (?)').run(guildId);
    await db.prepare('UPDATE antispam_config SET link_invite_excluded_channels = ? WHERE guild_id = ?').run(JSON.stringify(lista), guildId);
    res.json({
      ok: true,
      message: lista.length ? `✅ Anti-links/Anti-convites vão ficar desligados em ${lista.length} canal(is) escolhido(s)!` : '✅ Nenhum canal excluído — o anti-links/anti-convites volta a seguir a configuração normal em todos.'
    });
  });
  app.post('/api/:guildId/antispam-blocked-words', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      words
    } = req.body;
    if (!Array.isArray(words)) return res.status(400).json({
      ok: false,
      message: 'Lista inválida.'
    });
    const palavras = words.map(w => String(w).trim()).filter(w => w).slice(0, 100);
    await db.prepare('INSERT OR IGNORE INTO antispam_config (guild_id) VALUES (?)').run(guildId);
    await db.prepare('UPDATE antispam_config SET blocked_words = ? WHERE guild_id = ?').run(JSON.stringify(palavras), guildId);
    res.json({
      ok: true,
      message: `✅ ${palavras.length} palavra(s) bloqueada(s) guardada(s)!`
    });
  });
  app.post('/api/:guildId/antispam-blocked-links', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      links
    } = req.body;
    if (!Array.isArray(links)) return res.status(400).json({
      ok: false,
      message: 'Lista inválida.'
    });
    const dominios = links.map(l => String(l).trim().toLowerCase()).filter(l => l).slice(0, 100);
    await db.prepare('INSERT OR IGNORE INTO antispam_config (guild_id) VALUES (?)').run(guildId);
    await db.prepare('UPDATE antispam_config SET blocked_links = ? WHERE guild_id = ?').run(JSON.stringify(dominios), guildId);
    res.json({
      ok: true,
      message: `✅ ${dominios.length} link(s)/domínio(s) bloqueado(s) guardado(s)!`
    });
  });
  app.post('/api/:guildId/logs-config', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      log_channel,
      mod_log
    } = req.body;

    // Checkboxes vêm como array (ou string única se só um estiver marcado, ou undefined se nenhum)
    const normalizarTipos = val => {
      if (val === undefined) return [];
      const arr = Array.isArray(val) ? val : [val];
      return arr.filter(t => Object.prototype.hasOwnProperty.call(LOG_TYPES, t));
    };
    const logTypes = normalizarTipos(req.body.log_types);
    const modLogTypes = normalizarTipos(req.body.mod_log_types);
    await db.prepare(`
    INSERT INTO guild_config (guild_id, log_channel, mod_log, log_types, mod_log_types)
    VALUES (?,?,?,?,?)
    ON CONFLICT(guild_id) DO UPDATE SET log_channel=excluded.log_channel, mod_log=excluded.mod_log,
      log_types=excluded.log_types, mod_log_types=excluded.mod_log_types
  `).run(guildId, log_channel || null, mod_log || null, JSON.stringify(logTypes), JSON.stringify(modLogTypes));
    res.json({
      ok: true,
      message: 'Configuração de logs guardada!'
    });
  });
  app.post('/api/:guildId/logs-criar-canais', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    try {
      const {
        logChannelId,
        modLogChannelId
      } = await criarCanaisDeLogs(guild);
      await db.prepare(`
      INSERT INTO guild_config (guild_id, log_channel, mod_log)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET log_channel=excluded.log_channel, mod_log=excluded.mod_log
    `).run(guildId, logChannelId, modLogChannelId);
      res.json({
        ok: true,
        message: '✅ Categoria "Logs" criada com os canais 📜│logs e 📜│mod-logs (visíveis só para Administradores)!'
      });
    } catch (e) {
      res.status(400).json({
        ok: false,
        message: `❌ Não foi possível criar os canais: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/bot-identity', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      bot_nickname
    } = req.body;
    const nickname = (bot_nickname || '').trim().slice(0, 32) || null;
    await db.prepare(`
    INSERT INTO guild_config (guild_id, bot_nickname)
    VALUES (?,?)
    ON CONFLICT(guild_id) DO UPDATE SET
      bot_nickname=excluded.bot_nickname
  `).run(guildId, nickname);
    const guild = client.guilds.cache.get(guildId);
    let nickResult = {
      ok: true
    };
    if (guild) nickResult = await aplicarNicknameBot(guild, nickname);
    res.json({
      ok: true,
      message: nickResult.ok ? '✅ Apelido do bot guardado e atualizado neste servidor!' : `⚠️ Guardado, mas não foi possível mudar o nickname automaticamente: ${nickResult.error}`
    });
  });
  app.get('/api/:guildId/bot-identity', requireGuildAdminApi, (req, res) => {
    const {
      guildId
    } = req.params;
    const config = getGuildConfig(guildId);
    res.json({
      bot_nickname: config?.bot_nickname || ''
    });
  });
  app.get('/api/:guildId/stats', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const totalTickets = (await db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ?").get(guildId))?.c || 0;
    const openTickets = (await db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND status='open'").get(guildId))?.c || 0;
    const totalWarns = (await db.prepare("SELECT COUNT(*) as c FROM warns WHERE guild_id = ?").get(guildId))?.c || 0;
    const totalSugs = (await db.prepare("SELECT COUNT(*) as c FROM suggestions WHERE guild_id = ?").get(guildId))?.c || 0;
    res.json({
      totalTickets,
      openTickets,
      totalWarns,
      totalSugs
    });
  });
  app.get('/api/:guildId/tickets', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const tickets = await db.prepare("SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guildId);
    res.json(tickets);
  });
  app.get('/api/:guildId/warns', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const warns = await db.prepare("SELECT * FROM warns WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guildId);
    res.json(warns);
  });
  app.get('/api/:guildId/suggestions', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const suggestions = await db.prepare("SELECT * FROM suggestions WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50").all(guildId);
    const comTipo = suggestions.map(async s => {
      const tipo = s.type_id ? await db.prepare('SELECT name, emoji FROM suggestion_types WHERE id = ?').get(s.type_id) : null;
      return {
        ...s,
        type_name: tipo?.name || null,
        type_emoji: tipo?.emoji || null
      };
    });
    res.json(comTipo);
  });
  app.get('/api/:guildId/staff-ranking', requireGuildAdminApi, (req, res) => {
    const {
      guildId
    } = req.params;
    const ranking = getRankingStaff(guildId);
    res.json(ranking);
  });

  // ── Server Stats ──
  app.post('/api/:guildId/stats-config', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const {
      enabled,
      show_emoji,
      show_members,
      show_bots,
      show_channels,
      show_roles,
      show_boosts
    } = req.body;
    try {
      let config = await db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);
      if (!config) {
        await db.prepare('INSERT INTO server_stats (guild_id) VALUES (?)').run(guildId);
        config = await db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);
      }
      if (enabled) {
        if (!show_members && !show_bots && !show_channels && !show_roles && !show_boosts) {
          return res.status(400).json({
            ok: false,
            message: '❌ Escolhe pelo menos um canal para mostrar.'
          });
        }
        await db.prepare(`
        UPDATE server_stats SET
          enabled = 1, show_emoji = ?, show_members = ?, show_bots = ?,
          show_channels = ?, show_roles = ?, show_boosts = ?
        WHERE guild_id = ?
      `).run(show_emoji ? 1 : 0, show_members ? 1 : 0, show_bots ? 1 : 0, show_channels ? 1 : 0, show_roles ? 1 : 0, show_boosts ? 1 : 0, guildId);
        config = await db.prepare('SELECT * FROM server_stats WHERE guild_id = ?').get(guildId);
        await setupServerStats(guild, config);
        await atualizarStats(guild);
      } else {
        await db.prepare('UPDATE server_stats SET enabled = 0 WHERE guild_id = ?').run(guildId);
        // Apaga os canais existentes ao desativar
        await apagarCanaisServerStats(guild, config);
      }
      res.json({
        ok: true,
        message: enabled ? '✅ Server Stats ativado e canais criados!' : '✅ Server Stats desativado e canais removidos.'
      });
    } catch (e) {
      console.error('Erro stats-config:', e.message);
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/stats-atualizar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    try {
      await atualizarStats(guild);
      res.json({
        ok: true,
        message: '✅ Estatísticas atualizadas!'
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });

  // ── Cargos: AutoRole ──
  app.post('/api/:guildId/autorole', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      target,
      role_ids
    } = req.body;
    if (target !== 'human' && target !== 'bot') {
      return res.status(400).json({
        ok: false,
        message: 'Alvo inválido.'
      });
    }
    if (!Array.isArray(role_ids)) {
      return res.status(400).json({
        ok: false,
        message: 'Lista de cargos inválida.'
      });
    }
    const del = db.prepare('DELETE FROM autorole_config WHERE guild_id = ? AND target = ?');
    const ins = db.prepare('INSERT INTO autorole_config (guild_id, role_id, target) VALUES (?, ?, ?)');
    const tx = db.transaction(async ids => {
      await del.run(guildId, target);
      for (const roleId of ids) {
        if (roleId) await ins.run(guildId, roleId, target);
      }
    });
    await tx(role_ids);
    res.json({
      ok: true,
      message: `AutoRole de ${target === 'bot' ? 'bots' : 'pessoas'} guardado! (${role_ids.length} cargo(s))`
    });
  });

  // ── Imunidade ao AutoMod ──
  app.post('/api/:guildId/immunity-config', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      immune_admins,
      immune_role_ids
    } = req.body;
    if (!Array.isArray(immune_role_ids)) {
      return res.status(400).json({
        ok: false,
        message: 'Lista de cargos inválida.'
      });
    }
    const rolesFiltrados = immune_role_ids.filter(id => id);
    await db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
    await db.prepare('UPDATE guild_config SET immune_admins = ?, immune_roles = ? WHERE guild_id = ?').run(immune_admins ? 1 : 0, JSON.stringify(rolesFiltrados), guildId);
    res.json({
      ok: true,
      message: `✅ Imunidade guardada! (${rolesFiltrados.length} cargo(s) imunes${immune_admins ? ', administradores imunes' : ''})`
    });
  });

  // ── Cargos: Exclusividade ──
  app.post('/api/:guildId/role-exclusivity', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });

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
      return res.status(400).json({
        ok: false,
        message: 'Escolhe pelo menos um cargo a ganhar e pelo menos um cargo a perder.'
      });
    }
    try {
      const ins = db.prepare(`
      INSERT INTO role_exclusivity (guild_id, gain_role_id, lose_role_id)
      VALUES (?, ?, ?)
      ON CONFLICT(guild_id, gain_role_id, lose_role_id) DO NOTHING
    `);
      const tx = db.transaction(async (gains, loses) => {
        for (const gainId of gains) {
          for (const loseId of loses) {
            if (loseId === gainId) continue; // um cargo não pode excluir-se a si mesmo
            await ins.run(guildId, gainId, loseId);
          }
        }
      });
      await tx(gainRoleIds, loseRoleIds);

      // Responde já: a regra já está gravada na DB, não vale a pena o browser
      // ficar à espera de aplicar retroativamente a todos os membros.
      res.json({
        ok: true,
        message: 'Regra(s) adicionada(s)! A aplicar retroativamente aos membros em segundo plano...'
      });

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
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/role-exclusivity/delete', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    await db.prepare('DELETE FROM role_exclusivity WHERE guild_id = ? AND id = ?').run(guildId, id);
    res.json({
      ok: true,
      message: 'Regra removida!'
    });
  });

  // ── Sugestões: Tipos ──
  app.get('/api/:guildId/sugestao-tipos', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const tipos = await db.prepare('SELECT * FROM suggestion_types WHERE guild_id = ? ORDER BY order_num, id').all(guildId);
    const comNomes = tipos.map(t => ({
      ...t,
      channel_name: guild?.channels.cache.get(t.channel_id)?.name || null,
      log_channel_name: t.log_channel ? guild?.channels.cache.get(t.log_channel)?.name || null : null,
      role_name: t.ping_role ? guild?.roles.cache.get(t.ping_role)?.name || null : null
    }));
    res.json(comNomes);
  });
  app.post('/api/:guildId/sugestao-tipos', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      name,
      emoji,
      channel_id,
      log_channel,
      ping_role
    } = req.body || {};
    const nome = (name || '').trim();
    if (!nome) return res.status(400).json({
      ok: false,
      message: '❌ O nome do tipo é obrigatório.'
    });
    if (!channel_id) return res.status(400).json({
      ok: false,
      message: '❌ Escolhe um canal de sugestões.'
    });
    const existente = await db.prepare('SELECT id FROM suggestion_types WHERE guild_id = ? AND name = ?').get(guildId, nome);
    if (existente) return res.status(400).json({
      ok: false,
      message: `❌ Já existe um tipo chamado "${nome}".`
    });
    const {
      c: total
    } = await db.prepare('SELECT COUNT(*) AS c FROM suggestion_types WHERE guild_id = ?').get(guildId);
    await db.prepare(`
    INSERT INTO suggestion_types (guild_id, name, emoji, channel_id, log_channel, ping_role, enabled, order_num)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(guildId, nome, (emoji || '').trim() || '💡', channel_id, log_channel || null, ping_role || null, total);
    res.json({
      ok: true,
      message: `✅ Tipo "${nome}" criado!`
    });
  });
  app.post('/api/:guildId/sugestao-tipos/:id/toggle', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const tipo = await db.prepare('SELECT * FROM suggestion_types WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!tipo) return res.status(404).json({
      ok: false,
      message: 'Tipo não encontrado.'
    });
    await db.prepare('UPDATE suggestion_types SET enabled = ? WHERE id = ?').run(tipo.enabled ? 0 : 1, tipo.id);
    res.json({
      ok: true,
      message: tipo.enabled ? '✅ Tipo desativado.' : '✅ Tipo ativado.'
    });
  });
  app.delete('/api/:guildId/sugestao-tipos/:id', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const tipo = await db.prepare('SELECT * FROM suggestion_types WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!tipo) return res.status(404).json({
      ok: false,
      message: 'Tipo não encontrado.'
    });
    await db.prepare('DELETE FROM suggestion_types WHERE id = ?').run(tipo.id);
    res.json({
      ok: true,
      message: `✅ Tipo "${tipo.name}" apagado.`
    });
  });

  // ── Perguntas à comunidade (envio + listagem + remoção) ──
  app.get('/api/:guildId/perguntas', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const perguntas = await db.prepare('SELECT * FROM perguntas WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50').all(guildId);
    const channels = guild ? guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({
      id: c.id,
      name: c.name
    })) : [];
    res.json({
      perguntas,
      html: renderPerguntasHistorico(perguntas, channels, guildId)
    });
  });
  app.post('/api/:guildId/perguntas', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      channel_id,
      pergunta,
      mensagem_extra
    } = req.body;
    if (!channel_id || !pergunta || !pergunta.trim()) {
      return res.status(400).json({
        ok: false,
        message: 'Escolhe um canal e escreve a pergunta.'
      });
    }
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const canal = guild.channels.cache.get(channel_id);
    if (!canal) return res.status(404).json({
      ok: false,
      message: 'Canal não encontrado.'
    });
    const resultado = await enviarPergunta(guild, canal, pergunta.trim(), req.session.user.id, mensagem_extra);
    if (!resultado.ok) return res.status(500).json(resultado);
    res.json({
      ok: true,
      message: `✅ Pergunta enviada em #${canal.name}! Tópico criado para respostas.`,
      perguntaId: resultado.perguntaId
    });
  });
  app.post('/api/:guildId/perguntas/delete', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    await db.prepare('DELETE FROM perguntas WHERE id = ? AND guild_id = ?').run(id, guildId);
    res.json({
      ok: true,
      message: '✅ Registo removido do histórico.'
    });
  });

  // ── Reaction Roles (100% Dashboard) ──
  // Fluxo: escolhes canal + escreves mensagem + defines 1 a 5 pares emoji->cargo.
  // O bot envia a mensagem exatamente como escrita e reage com os emojis escolhidos.
  app.get('/api/:guildId/reaction-roles', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const paineis = await db.prepare('SELECT * FROM reaction_role_panels WHERE guild_id = ? ORDER BY id DESC').all(guildId);
    const paineisComItens = paineis.map(async p => ({
      ...p,
      itens: await db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ?').all(guildId, p.message_id)
    }));
    res.json(paineisComItens);
  });
  app.post('/api/:guildId/reaction-roles', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const {
      channel_id,
      conteudo
    } = req.body;
    let emojis = req.body.emoji;
    let cargos = req.body.cargo;
    if (!emojis) emojis = [];
    if (!cargos) cargos = [];
    if (!Array.isArray(emojis)) emojis = [emojis];
    if (!Array.isArray(cargos)) cargos = [cargos];
    if (!channel_id || !conteudo || !conteudo.trim()) {
      return res.status(400).json({
        ok: false,
        message: 'Escolhe um canal e escreve a mensagem.'
      });
    }

    // Filtra pares válidos (emoji + cargo preenchidos)
    const pares = [];
    for (let i = 0; i < Math.max(emojis.length, cargos.length); i++) {
      const emoji = (emojis[i] || '').trim();
      const cargo = (cargos[i] || '').trim();
      if (emoji && cargo) pares.push({
        emoji,
        cargo
      });
    }
    if (pares.length < 1) return res.status(400).json({
      ok: false,
      message: 'Define pelo menos 1 emoji com o respetivo cargo.'
    });
    if (pares.length > 5) return res.status(400).json({
      ok: false,
      message: 'O máximo são 5 emojis por mensagem.'
    });

    // Emojis não podem repetir-se na mesma mensagem
    const emojisUnicos = new Set(pares.map(p => p.emoji));
    if (emojisUnicos.size !== pares.length) {
      return res.status(400).json({
        ok: false,
        message: 'Não podes repetir o mesmo emoji na mesma mensagem.'
      });
    }
    try {
      const canal = guild.channels.cache.get(channel_id);
      if (!canal) return res.status(404).json({
        ok: false,
        message: 'Canal não encontrado.'
      });

      // O bot publica a mensagem exatamente como foi escrita no dashboard
      const msg = await canal.send({
        content: conteudo
      });
      for (const par of pares) {
        await msg.react(par.emoji);
      }
      await db.prepare(`
      INSERT INTO reaction_role_panels (guild_id, channel_id, message_id, conteudo)
      VALUES (?, ?, ?, ?)
    `).run(guildId, channel_id, msg.id, conteudo);
      const insertRR = db.prepare(`
      INSERT OR REPLACE INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id)
      VALUES (?, ?, ?, ?, ?)
    `);
      for (const par of pares) {
        await insertRR.run(guildId, channel_id, msg.id, par.emoji, par.cargo);
      }
      res.json({
        ok: true,
        message: '✅ Mensagem publicada e reaction roles configurados!'
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/reaction-roles/delete', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      message_id
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    const painel = await db.prepare('SELECT * FROM reaction_role_panels WHERE guild_id = ? AND message_id = ?').get(guildId, message_id);

    // Tenta apagar a mensagem original no Discord (se ainda existir)
    if (guild && painel) {
      try {
        const canal = guild.channels.cache.get(painel.channel_id);
        const msg = await canal?.messages.fetch(painel.message_id).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      } catch (_) {}
    }
    await db.prepare('DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ?').run(guildId, message_id);
    await db.prepare('DELETE FROM reaction_role_panels WHERE guild_id = ? AND message_id = ?').run(guildId, message_id);
    res.json({
      ok: true,
      message: '✅ Painel de reaction roles removido!'
    });
  });

  // ── Moderação (Dashboard) ──
  app.get('/api/:guildId/members', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    try {
      await guild.members.fetch();
    } catch (_) {}
    const members = guild.members.cache.filter(m => !m.user.bot).map(m => ({
      id: m.id,
      name: `${m.user.username}${m.nickname ? ' (' + m.nickname + ')' : ''}`
    })).sort((a, b) => a.name.localeCompare(b.name));
    res.json(members);
  });
  app.post('/api/:guildId/mod/ban', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      user_id,
      motivo,
      dias
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!user_id) return res.status(400).json({
      ok: false,
      message: 'Escolhe um membro.'
    });
    try {
      const target = await guild.members.fetch(user_id).catch(() => null);
      if (!target) return res.status(404).json({
        ok: false,
        message: 'Membro não encontrado.'
      });
      if (!target.bannable) return res.status(400).json({
        ok: false,
        message: 'Não é possível banir este membro (cargo demasiado alto).'
      });
      const razao = motivo || 'Sem motivo especificado';
      // Por padrão apaga 7 dias de mensagens do banido; só muda se explicitamente enviado outro valor
      const diasApagar = dias !== undefined && dias !== null && dias !== '' ? parseInt(dias) : 7;
      await target.ban({
        reason: razao,
        deleteMessageSeconds: diasApagar * 86400
      });
      logMod(guildId, 'BAN', target.id, req.session.user.id, razao);
      const embed = embedPadrao('🔨 Utilizador Banido (via Dashboard)', `**Utilizador:** <@${target.id}> (\`${target.user.tag}\`)\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_ERRO);
      await sendLogTyped(guild, 'ban', embed);
      res.json({
        ok: true,
        message: `✅ ${target.user.tag} foi banido.`
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/mod/unban', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      user_id,
      motivo
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!user_id) return res.status(400).json({
      ok: false,
      message: 'Indica o ID do utilizador.'
    });
    try {
      const razao = motivo || 'Sem motivo especificado';
      await guild.members.unban(user_id, razao);
      logMod(guildId, 'UNBAN', user_id, req.session.user.id, razao);
      const embed = embedPadrao('✅ Ban Removido (via Dashboard)', `**ID:** \`${user_id}\`\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_SUCESSO);
      await sendLogTyped(guild, 'unban', embed);
      res.json({
        ok: true,
        message: '✅ Ban removido.'
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/mod/kick', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      user_id,
      motivo
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!user_id) return res.status(400).json({
      ok: false,
      message: 'Escolhe um membro.'
    });
    try {
      const target = await guild.members.fetch(user_id).catch(() => null);
      if (!target) return res.status(404).json({
        ok: false,
        message: 'Membro não encontrado.'
      });
      if (!target.kickable) return res.status(400).json({
        ok: false,
        message: 'Não é possível expulsar este membro.'
      });
      const razao = motivo || 'Sem motivo especificado';
      await target.kick(razao);
      logMod(guildId, 'KICK', target.id, req.session.user.id, razao);
      const embed = embedPadrao('👢 Utilizador Expulso (via Dashboard)', `**Utilizador:** <@${target.id}>\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_ERRO);
      await sendLogTyped(guild, 'kick', embed);
      res.json({
        ok: true,
        message: `✅ ${target.user.tag} foi expulso.`
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/mod/timeout', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      user_id,
      duracao,
      motivo
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!user_id) return res.status(400).json({
      ok: false,
      message: 'Escolhe um membro.'
    });
    const durMs = parseDuration(duracao);
    if (!durMs) return res.status(400).json({
      ok: false,
      message: 'Duração inválida. Usa por exemplo: 10m, 2h, 1d.'
    });
    try {
      const target = await guild.members.fetch(user_id).catch(() => null);
      if (!target) return res.status(404).json({
        ok: false,
        message: 'Membro não encontrado.'
      });
      if (!target.moderatable) return res.status(400).json({
        ok: false,
        message: 'Não é possível silenciar este membro.'
      });
      const razao = motivo || 'Sem motivo especificado';
      await target.timeout(durMs, razao);
      logMod(guildId, 'TIMEOUT', target.id, req.session.user.id, razao, duracao);
      const embed = embedPadrao('🔇 Utilizador Silenciado (via Dashboard)', `**Utilizador:** <@${target.id}>\n**Duração:** ${formatDuration(durMs)}\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_AVISO);
      await sendLogTyped(guild, 'timeout', embed);
      res.json({
        ok: true,
        message: `✅ ${target.user.tag} foi silenciado por ${formatDuration(durMs)}.`
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/mod/untimeout', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      user_id,
      motivo
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!user_id) return res.status(400).json({
      ok: false,
      message: 'Escolhe um membro.'
    });
    try {
      const target = await guild.members.fetch(user_id).catch(() => null);
      if (!target) return res.status(404).json({
        ok: false,
        message: 'Membro não encontrado.'
      });
      const razao = motivo || 'Sem motivo especificado';
      await target.timeout(null, razao);
      logMod(guildId, 'UNTIMEOUT', target.id, req.session.user.id, razao);
      const embed = embedPadrao('🔊 Silêncio Removido (via Dashboard)', `**Utilizador:** <@${target.id}>\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}`, CONFIG.COR_SUCESSO);
      await sendLogTyped(guild, 'timeout', embed);
      res.json({
        ok: true,
        message: `✅ Silêncio removido de ${target.user.tag}.`
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/mod/warn', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      user_id,
      motivo
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!user_id || !motivo) return res.status(400).json({
      ok: false,
      message: 'Escolhe um membro e escreve o motivo.'
    });
    try {
      const target = await guild.members.fetch(user_id).catch(() => null);
      if (!target) return res.status(404).json({
        ok: false,
        message: 'Membro não encontrado.'
      });
      await db.prepare('INSERT INTO warns (guild_id, user_id, mod_id, reason) VALUES (?, ?, ?, ?)').run(guildId, target.id, req.session.user.id, motivo);
      const total = (await db.prepare('SELECT COUNT(*) as c FROM warns WHERE guild_id = ? AND user_id = ?').get(guildId, target.id)).c;
      logMod(guildId, 'WARN', target.id, req.session.user.id, motivo);
      const embed = embedPadrao('⚠️ Utilizador Avisado (via Dashboard)', `**Utilizador:** <@${target.id}>\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${motivo}\n**Total de avisos:** ${total}`, CONFIG.COR_AVISO);
      await sendLogTyped(guild, 'warn', embed);
      try {
        await target.send({
          embeds: [embedPadrao('⚠️ Recebeste um aviso', `**Servidor:** ${guild.name}\n**Motivo:** ${motivo}\n**Avisos totais:** ${total}`, CONFIG.COR_AVISO)]
        });
      } catch (_) {}
      res.json({
        ok: true,
        message: `✅ ${target.user.tag} foi avisado. Total: ${total}.`
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/mod/clearwarns', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      user_id
    } = req.body;
    if (!user_id) return res.status(400).json({
      ok: false,
      message: 'Escolhe um membro.'
    });
    const result = await db.prepare('DELETE FROM warns WHERE guild_id = ? AND user_id = ?').run(guildId, user_id);
    res.json({
      ok: true,
      message: `✅ ${result.changes} aviso(s) removido(s).`
    });
  });
  app.post('/api/:guildId/mod/limpar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      channel_id,
      quantidade,
      user_id
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!channel_id) return res.status(400).json({
      ok: false,
      message: 'Escolhe um canal.'
    });
    const qtd = Math.min(Math.max(parseInt(quantidade) || 10, 1), 100);
    try {
      const canal = guild.channels.cache.get(channel_id);
      if (!canal) return res.status(404).json({
        ok: false,
        message: 'Canal não encontrado.'
      });
      let msgs = await canal.messages.fetch({
        limit: 100
      });
      if (user_id) msgs = msgs.filter(m => m.author.id === user_id);
      msgs = [...msgs.values()].slice(0, qtd);
      const apagadas = await canal.bulkDelete(msgs, true);
      const embed = embedPadrao('🗑️ Mensagens Apagadas (via Dashboard)', `**${apagadas.size}** mensagem(ns) apagada(s) em #${canal.name}.`, CONFIG.COR_SUCESSO);
      await sendLogTyped(guild, 'clear', embed);
      res.json({
        ok: true,
        message: `✅ ${apagadas.size} mensagem(ns) apagada(s).`
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });

  // ── Blacklist (Dashboard) ──
  app.post('/api/:guildId/mod/blacklist-add', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      username,
      motivo
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const usernameInput = (username || '').trim().replace(/^@/, '').toLowerCase();
    if (!usernameInput) return res.status(400).json({
      ok: false,
      message: 'Indica o username.'
    });
    const razao = motivo || 'Sem motivo especificado';
    try {
      await db.prepare('INSERT INTO blacklist (guild_id, user_id, username, reason, added_by) VALUES (?, NULL, ?, ?, ?)').run(guildId, usernameInput, razao, req.session.user.id);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return res.status(400).json({
          ok: false,
          message: `⚠️ "${usernameInput}" já está na blacklist deste servidor.`
        });
      }
      return res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }

    // Se a conta já estiver no servidor agora (por username), bane imediatamente
    let jaBanido = false;
    try {
      await guild.members.fetch();
      const membroEncontrado = guild.members.cache.find(m => m.user.username.toLowerCase() === usernameInput);
      if (membroEncontrado && membroEncontrado.bannable) {
        await membroEncontrado.ban({
          reason: `Blacklist: ${razao}`
        }).catch(() => {});
        jaBanido = true;
        await db.prepare('UPDATE blacklist SET user_id = ? WHERE guild_id = ? AND username = ?').run(membroEncontrado.id, guildId, usernameInput);
      }
    } catch (_) {}
    logMod(guildId, 'BLACKLIST-ADD', usernameInput, req.session.user.id, razao);
    const embed = embedPadrao('🚫 Utilizador Adicionado à Blacklist (via Dashboard)', `**Username:** \`${usernameInput}\`\n**Moderador:** ${req.session.user.username} (dashboard)\n**Motivo:** ${razao}\n\n${jaBanido ? '⚠️ Este utilizador já estava no servidor e foi banido agora.' : '✅ Se uma conta com este username entrar no servidor, será banida automaticamente.'}`, CONFIG.COR_ERRO);
    await sendLogTyped(guild, 'blacklist', embed);
    res.json({
      ok: true,
      message: jaBanido ? `✅ "${usernameInput}" adicionado à blacklist e banido agora.` : `✅ "${usernameInput}" adicionado à blacklist.`
    });
  });
  app.post('/api/:guildId/mod/blacklist-remove', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    const result = await db.prepare('DELETE FROM blacklist WHERE guild_id = ? AND id = ?').run(guildId, id);
    if (result.changes === 0) return res.status(404).json({
      ok: false,
      message: 'Entrada não encontrada.'
    });
    logMod(guildId, 'BLACKLIST-REMOVE', id, req.session.user.id, 'Removido via dashboard');
    res.json({
      ok: true,
      message: '✅ Removido da blacklist.'
    });
  });
  app.get('/api/:guildId/ticket-types', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const tipos = await db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY order_num, id').all(guildId);
    res.json(tipos);
  });
  app.post('/api/:guildId/ticket-types', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      label,
      description,
      emoji,
      category_id,
      support_role,
      color,
      has_form
    } = req.body;
    if (!label) return res.status(400).json({
      ok: false,
      message: 'Indica o nome do tipo de ticket.'
    });
    const maxOrder = (await db.prepare('SELECT MAX(order_num) as m FROM ticket_types WHERE guild_id = ?').get(guildId))?.m || 0;
    await db.prepare(`
    INSERT INTO ticket_types (guild_id, label, description, emoji, category_id, support_role, color, order_num, has_form)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, label, description || null, emoji || '🎫', category_id || null, support_role || null, color || CONFIG.COR_PRINCIPAL, maxOrder + 1, has_form ? 1 : 0);
    res.json({
      ok: true,
      message: '✅ Tipo de ticket adicionado!'
    });
  });
  app.post('/api/:guildId/ticket-types/edit', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id,
      label,
      description,
      emoji,
      category_id,
      support_role,
      color
    } = req.body;
    const tipo = await db.prepare('SELECT * FROM ticket_types WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!tipo) return res.status(404).json({
      ok: false,
      message: 'Tipo de ticket não encontrado.'
    });
    if (!label || !label.trim()) return res.status(400).json({
      ok: false,
      message: 'Indica o nome do tipo de ticket.'
    });
    await db.prepare(`
    UPDATE ticket_types SET label=?, description=?, emoji=?, category_id=?, support_role=?, color=?
    WHERE id=? AND guild_id=?
  `).run(label.trim(), description || null, emoji || '🎫', category_id || null, support_role || null, color || '#5865F2', id, guildId);
    res.json({
      ok: true,
      message: '✅ Tipo de ticket atualizado!'
    });
  });

  // ── Reordenar tipos de ticket (define a ordem dos botões/opções no painel) ──
  app.post('/api/:guildId/ticket-types/reorder', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      order
    } = req.body; // array de IDs na nova ordem
    if (!Array.isArray(order)) return res.status(400).json({
      ok: false,
      message: 'Ordem inválida.'
    });
    const stmt = db.prepare('UPDATE ticket_types SET order_num = ? WHERE id = ? AND guild_id = ?');
    const tx = db.transaction(async ids => {
      for (let idx = 0; idx < ids.length; idx++) {
        await stmt.run(idx, ids[idx], guildId);
      }
    });
    await tx(order);
    res.json({
      ok: true,
      message: '✅ Ordem atualizada!'
    });
  });
  app.post('/api/:guildId/ticket-types/delete', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    await db.prepare('DELETE FROM ticket_types WHERE id = ? AND guild_id = ?').run(id, guildId);
    await db.prepare('DELETE FROM ticket_form_questions WHERE type_id = ? AND guild_id = ?').run(id, guildId);
    res.json({
      ok: true,
      message: '✅ Tipo de ticket removido!'
    });
  });

  // ── Ativar/desativar formulário de um tipo de ticket ──
  app.post('/api/:guildId/ticket-types/toggle-form', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    const tipo = await db.prepare('SELECT * FROM ticket_types WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!tipo) return res.status(404).json({
      ok: false,
      message: 'Tipo de ticket não encontrado.'
    });
    await db.prepare('UPDATE ticket_types SET has_form = ? WHERE id = ? AND guild_id = ?').run(tipo.has_form ? 0 : 1, id, guildId);
    res.json({
      ok: true,
      message: `✅ Formulário ${tipo.has_form ? 'desativado' : 'ativado'} para este tipo de ticket!`
    });
  });

  // ── Perguntas do formulário de um tipo de ticket ──
  app.get('/api/:guildId/ticket-types/:typeId/questions', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      typeId
    } = req.params;
    const perguntas = await db.prepare('SELECT * FROM ticket_form_questions WHERE guild_id = ? AND type_id = ? ORDER BY order_num, id').all(guildId, typeId);
    res.json(perguntas);
  });
  app.post('/api/:guildId/ticket-types/:typeId/questions', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      typeId
    } = req.params;
    const {
      question,
      style,
      required
    } = req.body;
    if (!question || !question.trim()) return res.status(400).json({
      ok: false,
      message: 'Indica o texto da pergunta.'
    });
    const total = (await db.prepare('SELECT COUNT(*) as c FROM ticket_form_questions WHERE guild_id = ? AND type_id = ?').get(guildId, typeId)).c;
    if (total >= 5) return res.status(400).json({
      ok: false,
      message: '❌ Cada formulário pode ter no máximo 5 perguntas (limite dos modais do Discord).'
    });
    const maxOrder = (await db.prepare('SELECT MAX(order_num) as m FROM ticket_form_questions WHERE guild_id = ? AND type_id = ?').get(guildId, typeId))?.m || 0;
    await db.prepare(`
    INSERT INTO ticket_form_questions (guild_id, type_id, question, style, required, order_num)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, typeId, question.trim(), style === 'long' ? 'long' : 'short', required ? 1 : 0, maxOrder + 1);
    res.json({
      ok: true,
      message: '✅ Pergunta adicionada!'
    });
  });
  app.post('/api/:guildId/ticket-types/:typeId/questions/delete', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      typeId
    } = req.params;
    const {
      id
    } = req.body;
    await db.prepare('DELETE FROM ticket_form_questions WHERE id = ? AND guild_id = ? AND type_id = ?').run(id, guildId, typeId);
    res.json({
      ok: true,
      message: '✅ Pergunta removida!'
    });
  });

  // ── Embeds (Dashboard) ──
  app.get('/api/:guildId/embeds', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const embeds = await db.prepare('SELECT * FROM saved_embeds WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
    res.json(embeds);
  });
  app.post('/api/:guildId/embeds/enviar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      channel_id,
      titulo,
      descricao,
      cor,
      imagem,
      thumbnail,
      footer,
      mensagem,
      guardar_como
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!channel_id || !titulo || !descricao) return res.status(400).json({
      ok: false,
      message: 'Preenche canal, título e descrição.'
    });
    try {
      const canal = guild.channels.cache.get(channel_id);
      if (!canal) return res.status(404).json({
        ok: false,
        message: 'Canal não encontrado.'
      });
      const embed = new EmbedBuilder().setTitle(titulo).setDescription(descricao).setColor(cor || CONFIG.COR_PRINCIPAL).setTimestamp();
      if (imagem) embed.setImage(imagem);
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (footer) embed.setFooter({
        text: footer
      });
      await canal.send({
        content: mensagem && mensagem.trim() || undefined,
        embeds: [embed]
      });
      if (guardar_como && guardar_como.trim()) {
        const data = JSON.stringify({
          title: titulo,
          description: descricao,
          color: cor || CONFIG.COR_PRINCIPAL,
          image: imagem || null,
          thumbnail: thumbnail || null,
          footer: footer || null,
          content: mensagem && mensagem.trim() || null
        });
        await db.prepare('INSERT INTO saved_embeds (guild_id, name, data, created_by) VALUES (?, ?, ?, ?)').run(guildId, guardar_como.trim(), data, req.session.user.id);
      }
      res.json({
        ok: true,
        message: '✅ Embed enviado!'
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/embeds/guardar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      nome,
      titulo,
      descricao,
      cor,
      imagem,
      thumbnail,
      footer,
      mensagem
    } = req.body;
    if (!nome || !titulo || !descricao) return res.status(400).json({
      ok: false,
      message: 'Preenche nome, título e descrição.'
    });
    const data = JSON.stringify({
      title: titulo,
      description: descricao,
      color: cor || CONFIG.COR_PRINCIPAL,
      image: imagem || null,
      thumbnail: thumbnail || null,
      footer: footer || null,
      content: mensagem && mensagem.trim() || null
    });
    await db.prepare('INSERT INTO saved_embeds (guild_id, name, data, created_by) VALUES (?, ?, ?, ?)').run(guildId, nome, data, req.session.user.id);
    res.json({
      ok: true,
      message: `✅ Embed "${nome}" guardado!`
    });
  });
  app.post('/api/:guildId/embeds/enviar-guardado', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id,
      channel_id
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const saved = await db.prepare('SELECT * FROM saved_embeds WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!saved) return res.status(404).json({
      ok: false,
      message: 'Embed não encontrado.'
    });
    try {
      const canal = guild.channels.cache.get(channel_id);
      if (!canal) return res.status(404).json({
        ok: false,
        message: 'Canal não encontrado.'
      });
      const data = JSON.parse(saved.data);
      const embed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp();
      if (data.image) embed.setImage(data.image);
      if (data.thumbnail) embed.setThumbnail(data.thumbnail);
      if (data.footer) embed.setFooter({
        text: data.footer
      });
      await canal.send({
        content: data.content || undefined,
        embeds: [embed]
      });
      res.json({
        ok: true,
        message: '✅ Embed enviado!'
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        message: `Erro: ${e.message}`
      });
    }
  });
  app.post('/api/:guildId/embeds/agendar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id,
      channel_id,
      interval_minutes,
      quantity
    } = req.body;
    const saved = await db.prepare('SELECT * FROM saved_embeds WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!saved) return res.status(404).json({
      ok: false,
      message: 'Embed não encontrado.'
    });
    const guild = client.guilds.cache.get(guildId);
    const canal = guild?.channels.cache.get(channel_id);
    if (!canal) return res.status(404).json({
      ok: false,
      message: 'Canal não encontrado.'
    });
    const minutos = parseInt(interval_minutes, 10);
    if (!minutos || minutos < 1) return res.status(400).json({
      ok: false,
      message: 'Intervalo inválido. Indica um número de minutos maior que 0.'
    });
    const quantidade = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 20);

    // Usa datetime('now', '+N minutes') do próprio SQLite para garantir o mesmo formato
    // usado na comparação em processarEmbedsAgendadas (evita bug de formato ISO vs SQLite).
    await db.prepare(`
    UPDATE saved_embeds
    SET schedule_channel = ?, schedule_interval_minutes = ?, schedule_active = 1,
        schedule_next_send = datetime('now', '+' || ? || ' minutes'), schedule_quantity = ?
    WHERE id = ? AND guild_id = ?
  `).run(channel_id, minutos, minutos, quantidade, id, guildId);
    res.json({
      ok: true,
      message: `✅ Envio automático ativado — ${quantidade}x a cada ${minutos} minuto(s) em #${canal.name}.`
    });
  });
  app.post('/api/:guildId/embeds/agendar-parar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    await db.prepare(`UPDATE saved_embeds SET schedule_active = 0 WHERE id = ? AND guild_id = ?`).run(id, guildId);
    res.json({
      ok: true,
      message: '⏹️ Envio automático desativado.'
    });
  });

  // ── Embeds: envio diário a horas fixas (até 5 horários HH:MM, todos os dias) ──
  app.post('/api/:guildId/embeds/agendar-horas-fixas', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id,
      channel_id,
      times
    } = req.body;
    const saved = await db.prepare('SELECT * FROM saved_embeds WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!saved) return res.status(404).json({
      ok: false,
      message: 'Embed não encontrado.'
    });
    const guild = client.guilds.cache.get(guildId);
    const canal = guild?.channels.cache.get(channel_id);
    if (!canal) return res.status(404).json({
      ok: false,
      message: 'Canal não encontrado.'
    });
    let horarios = Array.isArray(times) ? times : times ? [times] : [];
    horarios = horarios.map(h => String(h).trim()).filter(Boolean);
    // Valida formato HH:MM
    const regexHora = /^([01]\d|2[0-3]):([0-5]\d)$/;
    horarios = horarios.filter(h => regexHora.test(h));
    // Remove duplicados e limita a 5
    horarios = [...new Set(horarios)].slice(0, 5);
    if (!horarios.length) {
      return res.status(400).json({
        ok: false,
        message: 'Indica pelo menos um horário válido (formato HH:MM), até 5.'
      });
    }
    await db.prepare(`
    UPDATE saved_embeds
    SET schedule_daily_channel = ?, schedule_daily_times = ?, schedule_daily_active = 1, schedule_daily_last_sent = '{}'
    WHERE id = ? AND guild_id = ?
  `).run(channel_id, horarios.join(','), id, guildId);
    res.json({
      ok: true,
      message: `✅ Envio diário ativado às ${horarios.join(', ')} em #${canal.name}.`
    });
  });
  app.post('/api/:guildId/embeds/agendar-horas-fixas-parar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    await db.prepare(`UPDATE saved_embeds SET schedule_daily_active = 0 WHERE id = ? AND guild_id = ?`).run(id, guildId);
    res.json({
      ok: true,
      message: '⏹️ Envio diário a horas fixas desativado.'
    });
  });
  app.post('/api/:guildId/embeds/delete', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    const saved = await db.prepare('SELECT trigger_command FROM saved_embeds WHERE id = ? AND guild_id = ?').get(id, guildId);
    await db.prepare('DELETE FROM saved_embeds WHERE id = ? AND guild_id = ?').run(id, guildId);

    // Se a embed apagada tinha um comando slash associado, remove-o também do Discord
    if (saved?.trigger_command) {
      try {
        await sincronizarComandosEmbed(guildId);
      } catch (e) {
        console.error('❌ Erro ao sincronizar comandos de embed após apagar:', e.message);
      }
    }
    res.json({
      ok: true,
      message: '✅ Embed removido!'
    });
  });

  // ── Embeds: comando slash personalizado (ex: /abrirservidor) que envia a embed guardada ──
  // O comando só funciona no servidor onde foi configurado (é gravado por guild_id) e é
  // registado como um verdadeiro comando slash do Discord, visível apenas a Administradores.
  app.post('/api/:guildId/embeds/comando', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    let {
      id,
      comando
    } = req.body;
    const saved = await db.prepare('SELECT * FROM saved_embeds WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!saved) return res.status(404).json({
      ok: false,
      message: 'Embed não encontrado.'
    });
    comando = (comando || '').trim().toLowerCase().replace(/^[+!/]+/, ''); // remove prefixo se a pessoa o escrever por engano
    if (!comando) return res.status(400).json({
      ok: false,
      message: 'Indica o nome do comando (ex: abrirservidor).'
    });
    // Regras de nome de comando slash do Discord: 1-32 caracteres, minúsculas, números, "-" e "_"
    if (!/^[a-z0-9_-]{1,32}$/.test(comando)) {
      return res.status(400).json({
        ok: false,
        message: 'O comando só pode ter letras minúsculas, números, "-" e "_", até 32 caracteres.'
      });
    }

    // Garante que não existe já outra embed com o mesmo comando NESTE servidor
    const conflito = await db.prepare('SELECT id FROM saved_embeds WHERE guild_id = ? AND trigger_command = ? AND id != ?').get(guildId, comando, id);
    if (conflito) {
      return res.status(400).json({
        ok: false,
        message: `Já existe outra embed guardada neste servidor a usar o comando "${comando}".`
      });
    }
    await db.prepare('UPDATE saved_embeds SET trigger_command = ? WHERE id = ? AND guild_id = ?').run(comando, id, guildId);
    try {
      await sincronizarComandosEmbed(guildId);
    } catch (e) {
      console.error('❌ Erro ao sincronizar comando slash de embed:', e.message);
      return res.json({
        ok: true,
        message: `✅ Comando guardado, mas houve um erro ao registá-lo no Discord. Tenta novamente em instantes.`
      });
    }
    res.json({
      ok: true,
      message: `✅ Comando "/${comando}" criado! Já podes usá-lo neste servidor (só administradores o veem).`
    });
  });
  app.post('/api/:guildId/embeds/comando-remover', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    await db.prepare('UPDATE saved_embeds SET trigger_command = NULL WHERE id = ? AND guild_id = ?').run(id, guildId);
    try {
      await sincronizarComandosEmbed(guildId);
    } catch (e) {
      console.error('❌ Erro ao sincronizar comando slash de embed:', e.message);
    }
    res.json({
      ok: true,
      message: '✅ Comando removido desta embed.'
    });
  });

  // ── Embeds: editar uma embed já guardada (mantém o mesmo nome e comando, se existirem) ──
  app.post('/api/:guildId/embeds/editar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id,
      titulo,
      descricao,
      cor,
      imagem,
      thumbnail,
      footer,
      mensagem,
      url,
      autor_nome,
      autor_icon,
      image_pos
    } = req.body;
    const saved = await db.prepare('SELECT * FROM saved_embeds WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!saved) return res.status(404).json({
      ok: false,
      message: 'Embed não encontrado.'
    });
    if (!titulo && !descricao) {
      return res.status(400).json({
        ok: false,
        message: 'Indica pelo menos um título ou descrição.'
      });
    }
    const posValida = ['bottom', 'thumbnail', 'none'].includes(image_pos) ? image_pos : 'bottom';
    const data = JSON.stringify({
      title: titulo || null,
      description: descricao || null,
      color: cor || CONFIG.COR_PRINCIPAL,
      image: imagem || null,
      thumbnail: thumbnail || null,
      footer: footer || null,
      content: mensagem || null,
      url: url || null,
      author_name: autor_nome || null,
      author_icon: autor_icon || null,
      image_pos: posValida
    });
    await db.prepare('UPDATE saved_embeds SET data = ? WHERE id = ? AND guild_id = ?').run(data, id, guildId);
    res.json({
      ok: true,
      message: `✅ Embed "${saved.name}" atualizada!`
    });
  });

  // ── Staff (Dashboard) ──
  app.get('/api/:guildId/staff/ranking', requireGuildAdminApi, (req, res) => {
    const {
      guildId
    } = req.params;
    res.json(getRankingStaff(guildId));
  });
  app.get('/api/:guildId/staff/historico/:staffId', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      staffId
    } = req.params;
    const historico = await db.prepare('SELECT * FROM staff_ratings WHERE guild_id = ? AND staff_id = ? ORDER BY created_at DESC LIMIT 20').all(guildId, staffId);
    const stats = await db.prepare('SELECT AVG(rating) as media, COUNT(*) as total, MIN(rating) as min, MAX(rating) as max FROM staff_ratings WHERE guild_id = ? AND staff_id = ?').get(guildId, staffId);
    res.json({
      historico,
      stats
    });
  });
  app.post('/api/:guildId/staff/avaliar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      staff_id,
      rating,
      comment
    } = req.body;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!staff_id || !rating) return res.status(400).json({
      ok: false,
      message: 'Escolhe um membro da staff e uma classificação.'
    });
    const nota = parseInt(rating);
    if (nota < 1 || nota > 5) return res.status(400).json({
      ok: false,
      message: 'A classificação tem de ser entre 1 e 5.'
    });
    await db.prepare('INSERT INTO staff_ratings (guild_id, staff_id, user_id, rating, comment) VALUES (?, ?, ?, ?, ?)').run(guildId, staff_id, req.session.user.id, nota, comment || null);
    res.json({
      ok: true,
      message: '✅ Avaliação registada!'
    });
  });
  app.post('/api/:guildId/staff/remover-avaliacao', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      id
    } = req.body;
    await db.prepare('DELETE FROM staff_ratings WHERE id = ? AND guild_id = ?').run(id, guildId);
    res.json({
      ok: true,
      message: '✅ Avaliação removida!'
    });
  });

  // ── Votação ──
  app.post('/api/:guildId/votacao-config', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      channel_id,
      tipo,
      titulo,
      descricao,
      opcoes_raw,
      hora_inicio,
      hora_fim,
      data_fim
    } = req.body;
    if (!channel_id || !titulo || !descricao || !opcoes_raw || !hora_fim) {
      return res.status(400).json({
        ok: false,
        message: 'Preenche todos os campos obrigatórios.'
      });
    }
    const opcoes = opcoes_raw.split(',').map(o => o.trim()).filter(o => o.length > 0);
    if (opcoes.length < 2) return res.status(400).json({
      ok: false,
      message: 'Precisas de pelo menos 2 opções separadas por vírgula.'
    });
    if (opcoes.length > 10) return res.status(400).json({
      ok: false,
      message: 'O máximo é 10 opções.'
    });
    if (opcoes.some(o => o.length > 80)) return res.status(400).json({
      ok: false,
      message: 'Cada opção deve ter no máximo 80 caracteres.'
    });
    const horaRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!horaRegex.test(hora_fim)) return res.status(400).json({
      ok: false,
      message: 'Formato de hora de fim inválido (HH:MM).'
    });
    if (tipo === 'recorrente') {
      if (!hora_inicio || !horaRegex.test(hora_inicio)) return res.status(400).json({
        ok: false,
        message: 'Formato de hora de início inválido (HH:MM).'
      });
      const [hiH, hiM] = hora_inicio.split(':').map(Number);
      const [hfH, hfM] = hora_fim.split(':').map(Number);
      if (hiH * 60 + hiM >= hfH * 60 + hfM) return res.status(400).json({
        ok: false,
        message: 'A hora de início tem de ser antes da hora de fim.'
      });
      await db.prepare(`
      INSERT INTO votacao_config (guild_id, channel_id, tipo, titulo, descricao, opcoes, hora_inicio, hora_fim, data_fim, ativa_hoje, encerrada_hoje, data_atual, message_id)
      VALUES (?, ?, 'recorrente', ?, ?, ?, ?, ?, NULL, 0, 0, NULL, NULL)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id=excluded.channel_id, tipo='recorrente', titulo=excluded.titulo, descricao=excluded.descricao,
        opcoes=excluded.opcoes, hora_inicio=excluded.hora_inicio, hora_fim=excluded.hora_fim, data_fim=NULL,
        ativa_hoje=0, encerrada_hoje=0, data_atual=NULL, message_id=NULL
    `).run(guildId, channel_id, titulo, descricao, JSON.stringify(opcoes), hora_inicio, hora_fim);
      return res.json({
        ok: true,
        message: '✅ Votação recorrente configurada! Publica automaticamente todos os dias.'
      });
    }

    // tipo === 'unica'
    if (!data_fim) return res.status(400).json({
      ok: false,
      message: 'Escolhe a data de fim.'
    });
    const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dataRegex.test(data_fim)) return res.status(400).json({
      ok: false,
      message: 'Data de fim inválida.'
    });
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const agora = new Date();
    const hojeISO = agora.toLocaleDateString('en-CA', {
      timeZone: 'Europe/Lisbon'
    });
    const horaAtual = agora.toLocaleTimeString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    if (data_fim < hojeISO || data_fim === hojeISO && hora_fim <= horaAtual) {
      return res.status(400).json({
        ok: false,
        message: 'A data/hora de fim tem de ser no futuro.'
      });
    }
    await db.prepare(`
    INSERT INTO votacao_config (guild_id, channel_id, tipo, titulo, descricao, opcoes, hora_inicio, hora_fim, data_fim, ativa_hoje, encerrada_hoje, data_atual, message_id)
    VALUES (?, ?, 'unica', ?, ?, ?, NULL, ?, ?, 0, 0, NULL, NULL)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id=excluded.channel_id, tipo='unica', titulo=excluded.titulo, descricao=excluded.descricao,
      opcoes=excluded.opcoes, hora_inicio=NULL, hora_fim=excluded.hora_fim, data_fim=excluded.data_fim,
      ativa_hoje=0, encerrada_hoje=0, data_atual=NULL, message_id=NULL
  `).run(guildId, channel_id, titulo, descricao, JSON.stringify(opcoes), hora_fim, data_fim);

    // Publica imediatamente
    const config = await db.prepare('SELECT * FROM votacao_config WHERE guild_id = ?').get(guildId);
    publicarVotacao(guild, config, hojeISO).catch(err => console.error('❌ Erro ao publicar votação única (dashboard):', err.message));
    res.json({
      ok: true,
      message: '✅ Votação de dia único configurada e publicada!'
    });
  });
  app.post('/api/:guildId/votacao-remove', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    await db.prepare('DELETE FROM votacao_config WHERE guild_id = ?').run(guildId);
    await db.prepare('DELETE FROM votacao_votos WHERE guild_id = ?').run(guildId);
    res.json({
      ok: true,
      message: '✅ Votação removida!'
    });
  });

  // ── Giveaways ──
  app.get('/api/:guildId/giveaways', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const giveaways = await db.prepare('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY ended ASC, created_at DESC LIMIT 50').all(guildId);
    const comContagem = giveaways.map(async gw => ({
      ...gw,
      total_entradas: (await db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(gw.id)).c
    }));
    res.json(comContagem);
  });
  app.post('/api/:guildId/giveaways', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      canal_id,
      titulo,
      descricao,
      premio,
      imagem_url,
      duracao,
      vencedores,
      mensagem_extra
    } = req.body || {};
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    if (!premio || !String(premio).trim()) return res.status(400).json({
      ok: false,
      message: '❌ O prémio é obrigatório.'
    });
    if (!canal_id) return res.status(400).json({
      ok: false,
      message: '❌ Escolhe um canal.'
    });
    const canal = guild.channels.cache.get(canal_id);
    if (!canal) return res.status(400).json({
      ok: false,
      message: '❌ Canal inválido.'
    });
    const duracaoMs = parseDuracao(String(duracao || '').trim());
    if (!duracaoMs || duracaoMs < 60000) {
      return res.status(400).json({
        ok: false,
        message: '❌ Duração inválida. Usa um formato como 1m, 10m, 2h ou 1d (mínimo 1 minuto).'
      });
    }
    const nVencedores = Math.max(1, Math.min(20, parseInt(vencedores) || 1));
    const imagemUrl = (imagem_url || '').trim() || null;
    if (imagemUrl && !/^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(imagemUrl)) {
      return res.status(400).json({
        ok: false,
        message: '❌ URL de imagem inválido. Tem de ser um link direto (png, jpg, gif ou webp).'
      });
    }
    const mensagemExtra = (mensagem_extra || '').trim() || null;
    const endsAt = new Date(Date.now() + duracaoMs);
    const endsAtISO = endsAt.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    const info = await db.prepare(`
    INSERT INTO giveaways (guild_id, channel_id, premio, vencedores, ends_at, host_id, titulo, descricao, imagem_url, mensagem_extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, canal.id, String(premio).trim(), nVencedores, endsAtISO, req.session?.user?.id || null, (titulo || '').trim() || null, (descricao || '').trim() || null, imagemUrl, mensagemExtra);
    const gw = await db.prepare('SELECT * FROM giveaways WHERE id = ?').get(info.lastInsertRowid);
    const embed = embedGiveaway(gw, 0, false);
    const row = botaoGiveaway(gw, 0, false);
    const msg = await canal.send({
      content: mensagemExtra || undefined,
      embeds: [embed],
      components: [row],
      allowedMentions: {
        parse: ['everyone', 'roles', 'users']
      }
    }).catch(() => null);
    if (!msg) {
      await db.prepare('DELETE FROM giveaways WHERE id = ?').run(gw.id);
      return res.status(400).json({
        ok: false,
        message: '❌ Não foi possível publicar o giveaway nesse canal (verifica as permissões do bot).'
      });
    }
    await db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(msg.id, gw.id);
    agendarEncerramentoGiveaway(gw);
    res.json({
      ok: true,
      message: `✅ Giveaway #${gw.id} criado em #${canal.name}!`
    });
  });
  app.post('/api/:guildId/giveaways/:id/terminar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const gw = await db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!gw) return res.status(404).json({
      ok: false,
      message: 'Giveaway não encontrado.'
    });
    if (gw.ended) return res.status(400).json({
      ok: false,
      message: 'Este giveaway já terminou.'
    });
    const vencedores = await encerrarGiveaway(guild, gw);
    cancelarTimerGiveaway(gw.id);
    res.json({
      ok: true,
      message: vencedores.length ? `✅ Encerrado! Vencedor(es): ${vencedores.length}` : '✅ Encerrado sem participantes.'
    });
  });
  app.post('/api/:guildId/giveaways/:id/reroll', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const gw = await db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!gw) return res.status(404).json({
      ok: false,
      message: 'Giveaway não encontrado.'
    });
    if (!gw.ended) return res.status(400).json({
      ok: false,
      message: 'Este giveaway ainda está ativo.'
    });
    const vencedores = sortearVencedores(gw.id, gw.vencedores);
    if (!vencedores.length) return res.status(400).json({
      ok: false,
      message: 'Não há participantes para sortear.'
    });
    const canal = guild.channels.cache.get(gw.channel_id);
    if (canal) {
      await canal.send({
        content: `🔁 **Reroll do giveaway #${gw.id}** (${gw.premio})\n🎉 Novo(s) vencedor(es): ${vencedores.map(v => `<@${v}>`).join(', ')}`
      }).catch(() => {});
    }
    res.json({
      ok: true,
      message: '✅ Reroll feito!'
    });
  });
  app.post('/api/:guildId/giveaways/:id/cancelar', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const gw = await db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!gw) return res.status(404).json({
      ok: false,
      message: 'Giveaway não encontrado.'
    });
    if (gw.message_id) {
      const canal = guild.channels.cache.get(gw.channel_id);
      const msg = canal ? await canal.messages.fetch(gw.message_id).catch(() => null) : null;
      if (msg) {
        const total = (await db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?').get(gw.id)).c;
        await msg.edit({
          embeds: [new EmbedBuilder().setTitle('🚫 Sorteio Cancelado').setDescription(`**Prémio:** ${gw.premio}\n\nEste sorteio foi cancelado por um administrador.`).setColor(CONFIG.COR_ERRO)],
          components: [botaoGiveaway(gw, total, true)]
        }).catch(() => {});
      }
    }
    await db.prepare('DELETE FROM giveaways WHERE id = ?').run(gw.id);
    await db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ?').run(gw.id);
    cancelarTimerGiveaway(gw.id);
    res.json({
      ok: true,
      message: '✅ Giveaway cancelado.'
    });
  });

  // ── Painéis de Informação ──
  app.get('/api/:guildId/infopanels', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const paineis = await db.prepare('SELECT * FROM info_panels WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
    const comContagem = paineis.map(async p => ({
      ...p,
      button_count: (await db.prepare('SELECT COUNT(*) AS c FROM info_panel_buttons WHERE panel_id = ?').get(p.id)).c,
      channel_name: guild?.channels.cache.get(p.channel_id)?.name || null
    }));
    res.json(comContagem);
  });
  app.post('/api/:guildId/infopanels', requireGuildAdminApi, async (req, res) => {
    const {
      guildId
    } = req.params;
    const {
      name,
      title,
      description,
      color,
      banner_url,
      thumbnail_url,
      footer_text,
      owner_text,
      founded_text,
      channel_id
    } = req.body || {};
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const nome = (name || '').trim();
    if (!nome) return res.status(400).json({
      ok: false,
      message: '❌ O nome interno é obrigatório.'
    });
    const existente = await db.prepare('SELECT id FROM info_panels WHERE guild_id = ? AND name = ?').get(guildId, nome);
    if (existente) return res.status(400).json({
      ok: false,
      message: `❌ Já existe um painel chamado "${nome}".`
    });
    if (!channel_id) return res.status(400).json({
      ok: false,
      message: '❌ Escolhe um canal.'
    });
    const canal = guild.channels.cache.get(channel_id);
    if (!canal) return res.status(400).json({
      ok: false,
      message: '❌ Canal inválido.'
    });
    const cor = (color || '').trim() || CONFIG.COR_PRINCIPAL;
    if (!/^#([0-9A-Fa-f]{6})$/.test(cor)) {
      return res.status(400).json({
        ok: false,
        message: '❌ Cor inválida. Usa o formato hex, ex: #5865F2.'
      });
    }
    const info = await db.prepare(`
    INSERT INTO info_panels (guild_id, name, title, description, color, banner_url, thumbnail_url, footer_text, owner_text, founded_text, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, nome, (title || '').trim() || null, (description || '').trim() || null, cor, (banner_url || '').trim() || null, (thumbnail_url || '').trim() || null, (footer_text || '').trim() || null, (owner_text || '').trim() || null, (founded_text || '').trim() || null, req.session?.user?.id || null);

    // Guarda o canal já escolhido, mas NÃO publica ainda no Discord — o painel fica
    // em rascunho até o admin adicionar os botões e clicar em "Publicar Painel".
    // Isto evita que a mensagem apareça como "(editado)" no Discord assim que o
    // primeiro botão for adicionado.
    await db.prepare('UPDATE info_panels SET channel_id = ? WHERE id = ?').run(channel_id, info.lastInsertRowid);
    res.json({
      ok: true,
      message: `✅ Painel "${nome}" criado! Agora adiciona os botões e depois clica em "Publicar".`,
      id: info.lastInsertRowid
    });
  });
  app.post('/api/:guildId/infopanels/:id/publish', requireGuildAdminApi, async (req, res) => {
    const {
      id,
      guildId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({
      ok: false,
      message: 'Servidor não encontrado.'
    });
    const panel = await db.prepare('SELECT * FROM info_panels WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!panel) return res.status(404).json({
      ok: false,
      message: 'Painel não encontrado.'
    });
    if (!panel.channel_id) return res.status(400).json({
      ok: false,
      message: '❌ Este painel não tem canal definido.'
    });
    const canal = guild.channels.cache.get(panel.channel_id);
    if (!canal) return res.status(400).json({
      ok: false,
      message: '❌ Canal inválido ou já não existe.'
    });
    const embed = embedInfoPanel(panel);
    const botoes = await db.prepare('SELECT * FROM info_panel_buttons WHERE panel_id = ? ORDER BY order_num, id').all(panel.id);
    const rows = botoesInfoPanel(panel.id, botoes);

    // Já publicado antes? Reenvia como mensagem nova (apaga a antiga) em vez de
    // editar, para manter o comportamento consistente e não deixar "(editado)".
    if (panel.published && panel.message_id) {
      const antiga = await canal.messages.fetch(panel.message_id).catch(() => null);
      if (antiga) await antiga.delete().catch(() => {});
    }
    const msg = await canal.send({
      embeds: [embed],
      components: rows
    }).catch(() => null);
    if (!msg) {
      return res.status(400).json({
        ok: false,
        message: '❌ Não foi possível publicar o painel nesse canal (verifica as permissões do bot).'
      });
    }
    await db.prepare('UPDATE info_panels SET message_id = ?, published = 1 WHERE id = ?').run(msg.id, panel.id);
    res.json({
      ok: true,
      message: `✅ Painel publicado em #${canal.name}!`
    });
  });
  app.delete('/api/:guildId/infopanels/:id', requireGuildAdminApi, async (req, res) => {
    const {
      guildId,
      id
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const panel = await db.prepare('SELECT * FROM info_panels WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!panel) return res.status(404).json({
      ok: false,
      message: 'Painel não encontrado.'
    });
    if (guild && panel.message_id && panel.channel_id) {
      const canal = guild.channels.cache.get(panel.channel_id);
      const msg = canal ? await canal.messages.fetch(panel.message_id).catch(() => null) : null;
      if (msg) await msg.delete().catch(() => {});
    }
    await db.prepare('DELETE FROM info_panel_buttons WHERE panel_id = ?').run(panel.id);
    await db.prepare('DELETE FROM info_panels WHERE id = ?').run(panel.id);
    res.json({
      ok: true,
      message: '✅ Painel apagado.'
    });
  });
  app.get('/api/:guildId/infopanels/:id/buttons', requireGuildAdminApi, async (req, res) => {
    const {
      id,
      guildId
    } = req.params;
    const panel = await db.prepare('SELECT * FROM info_panels WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!panel) return res.status(404).json({
      ok: false,
      message: 'Painel não encontrado.'
    });
    const botoes = await db.prepare('SELECT * FROM info_panel_buttons WHERE panel_id = ? ORDER BY order_num, id').all(id);
    res.json(botoes);
  });
  app.post('/api/:guildId/infopanels/:id/buttons', requireGuildAdminApi, async (req, res) => {
    const {
      id,
      guildId
    } = req.params;
    const {
      label,
      emoji,
      style,
      response_text,
      response_title,
      response_image,
      response_thumbnail,
      response_color
    } = req.body || {};
    const guild = client.guilds.cache.get(guildId);
    const panel = await db.prepare('SELECT * FROM info_panels WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!panel) return res.status(404).json({
      ok: false,
      message: 'Painel não encontrado.'
    });
    const lbl = (label || '').trim();
    const resp = (response_text || '').trim();
    if (!lbl) return res.status(400).json({
      ok: false,
      message: '❌ O texto do botão é obrigatório.'
    });
    if (!resp) return res.status(400).json({
      ok: false,
      message: '❌ A resposta do botão é obrigatória.'
    });
    const cor = (response_color || '').trim() || null;
    if (cor && !/^#([0-9A-Fa-f]{6})$/.test(cor)) {
      return res.status(400).json({
        ok: false,
        message: '❌ Cor da resposta inválida. Usa o formato hex, ex: #5865F2.'
      });
    }
    const contagem = (await db.prepare('SELECT COUNT(*) AS c FROM info_panel_buttons WHERE panel_id = ?').get(panel.id)).c;
    if (contagem >= 25) return res.status(400).json({
      ok: false,
      message: '❌ Este painel já tem o máximo de 25 botões.'
    });
    const estilosValidos = ['Primary', 'Secondary', 'Success', 'Danger'];
    const estilo = estilosValidos.includes(style) ? style : 'Primary';
    const info = await db.prepare(`
    INSERT INTO info_panel_buttons (panel_id, label, emoji, style, response_text, response_title, response_image, response_thumbnail, response_color, order_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(panel.id, lbl, (emoji || '').trim() || null, estilo, resp, (response_title || '').trim() || null, (response_image || '').trim() || null, (response_thumbnail || '').trim() || null, cor, contagem);

    // Só atualiza a mensagem no Discord se o painel já estiver publicado. Se ainda
    // estiver em rascunho, o botão fica só guardado na BD até se clicar em "Publicar"
    // — assim a mensagem final nasce já com todos os botões, sem aparecer "(editado)".
    if (panel.published && guild && panel.message_id && panel.channel_id) {
      const canalMsg = guild.channels.cache.get(panel.channel_id);
      const msg = canalMsg ? await canalMsg.messages.fetch(panel.message_id).catch(() => null) : null;
      if (msg) {
        const botoes = await db.prepare('SELECT * FROM info_panel_buttons WHERE panel_id = ? ORDER BY order_num, id').all(panel.id);
        const rows = botoesInfoPanel(panel.id, botoes);
        await msg.edit({
          embeds: [embedInfoPanel(panel)],
          components: rows
        }).catch(() => {});
      }
    }
    res.json({
      ok: true,
      message: `✅ Botão "${lbl}" adicionado!`,
      id: info.lastInsertRowid
    });
  });
  app.delete('/api/:guildId/infopanels/:id/buttons/:buttonId', requireGuildAdminApi, async (req, res) => {
    const {
      id,
      guildId,
      buttonId
    } = req.params;
    const guild = client.guilds.cache.get(guildId);
    const panel = await db.prepare('SELECT * FROM info_panels WHERE id = ? AND guild_id = ?').get(id, guildId);
    if (!panel) return res.status(404).json({
      ok: false,
      message: 'Painel não encontrado.'
    });
    await db.prepare('DELETE FROM info_panel_buttons WHERE id = ? AND panel_id = ?').run(buttonId, panel.id);
    if (panel.published && guild && panel.message_id && panel.channel_id) {
      const canalMsg = guild.channels.cache.get(panel.channel_id);
      const msg = canalMsg ? await canalMsg.messages.fetch(panel.message_id).catch(() => null) : null;
      if (msg) {
        const botoes = await db.prepare('SELECT * FROM info_panel_buttons WHERE panel_id = ? ORDER BY order_num, id').all(panel.id);
        const rows = botoesInfoPanel(panel.id, botoes);
        await msg.edit({
          embeds: [embedInfoPanel(panel)],
          components: rows
        }).catch(() => {});
      }
    }
    res.json({
      ok: true,
      message: '✅ Botão apagado.'
    });
  });

  // ============================
  // TEMPLATES HTML DO DASHBOARD
  // ============================

  /** CSS e JS partilhados do dashboard */
  const dashboardCSS = `
  :root {
    --bg: #0a0e17;
    --bg2: #121826;
    --bg3: #1a2133;
    --bg4: #222b41;
    --accent: #2196f3;
    --accent2: #0d8bf0;
    --accent-glow: rgba(33,150,243,.35);
    --success: #57F287;
    --danger: #ED4245;
    --warning: #FEE75C;
    --text: #e8ecf5;
    --text2: #8b92b8;
    --border: #232c42;
    --card-shadow: 0 4px 24px rgba(0,0,0,0.35);
    --card-shadow-hover: 0 8px 32px rgba(0,0,0,0.45);
    --radius: 14px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: radial-gradient(circle at 15% 0%, #101828 0%, var(--bg) 45%);
    color: var(--text); font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    min-height: 100vh; letter-spacing: 0.1px;
  }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: var(--bg2); }
  ::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--accent); }
  a { color: var(--accent); text-decoration: none; }
  .navbar {
    background: rgba(18,24,38,0.85); border-bottom: 1px solid var(--border); padding: 0 24px; height: 64px;
    display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100;
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  }
  .navbar .logo { font-size: 1.25rem; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 10px; }
  .navbar .logo img { width: 32px; height: 32px; border-radius: 8px; box-shadow: 0 0 16px var(--accent-glow); }
  .navbar .logo span { color: var(--accent); text-shadow: 0 0 20px var(--accent-glow); }
  .navbar .user { display: flex; align-items: center; gap: 10px; }
  .navbar .user img { width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--accent); box-shadow: 0 0 0 3px rgba(33,150,243,.12); }
  .navbar .logout-btn { background: var(--danger); color: #fff; border: none; padding: 7px 16px; border-radius: 999px; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all 0.2s; }
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
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 22px; border-radius: 999px; border: none; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.18s ease; }
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
  .sidebar { width: 240px; background: var(--bg2); border-right: 1px solid var(--border); position: fixed; top: 60px; left: 0; bottom: 0; overflow-y: auto; padding: 16px 0 24px; }
  .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 11px 20px; color: var(--text2); cursor: pointer; transition: all 0.18s ease; border: none; background: none; width: 100%; font-size: 0.9rem; border-right: 2px solid transparent; }
  .sidebar-item:hover { background: var(--bg3); color: var(--text); }
  .sidebar-item.active { background: var(--bg3); color: var(--accent); border-right: 2px solid var(--accent); font-weight: 600; }
  .main-content { margin-left: 240px; padding: 24px; }
  .alert { padding: 12px 16px; border-radius: 9px; margin-bottom: 16px; font-size: 0.9rem; }
  .alert-success { background: rgba(87,242,135,.1); border: 1px solid var(--success); color: var(--success); }
  .alert-error   { background: rgba(237,66,69,.1); border: 1px solid var(--danger); color: var(--danger); }
  .guild-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 24px; }

  /* ── Editor de Painel de Tickets ── */
  .ticket-mode-card {
    flex: 1; min-width: 180px; background: var(--bg3); border: 2px solid var(--border); border-radius: 10px;
    padding: 14px 16px; cursor: pointer; transition: all 0.18s ease; text-align: center;
  }
  .ticket-mode-card:hover { border-color: #3a4066; background: var(--bg4); }
  .ticket-mode-card.active { border-color: var(--accent); background: rgba(88,101,242,0.12); }

  /* ── Simulador de mensagem do Discord ── */
  .discord-preview {
    background: #313338; border-radius: 10px; padding: 16px; font-family: 'gg sans', 'Segoe UI', sans-serif;
  }
  .discord-preview-msgrow { display: flex; gap: 14px; }
  .discord-preview-avatar {
    width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg,#5865F2,#7289da);
    display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;
  }
  .discord-preview-username { color: #f2f3f5; font-weight: 600; font-size: 0.95rem; margin-bottom: 4px; }
  .discord-preview-bottag {
    background: #5865F2; color: #fff; font-size: 0.6rem; font-weight: 700; padding: 1px 4px; border-radius: 3px; vertical-align: middle;
  }
  .discord-preview-embed {
    background: #2b2d31; border-left: 4px solid #5865F2; border-radius: 4px; padding: 10px 14px; max-width: 480px;
  }
  .discord-preview-embed .dpe-title { color: #f2f3f5; font-weight: 700; font-size: 0.95rem; margin-bottom: 6px; }
  .discord-preview-embed .dpe-desc { color: #dbdee1; font-size: 0.875rem; white-space: pre-wrap; line-height: 1.4; }
  .discord-preview-embed .dpe-field-name { color: #f2f3f5; font-weight: 700; font-size: 0.8rem; margin-top: 10px; }
  .discord-preview-embed .dpe-field-value { color: #dbdee1; font-size: 0.8rem; }
  .dp-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 4px; font-size: 0.85rem;
    font-weight: 500; color: #fff; margin: 3px 4px 3px 0; border: none; cursor: default;
  }
  .dp-select {
    background: #1e1f22; border: 1px solid #1e1f22; color: #dbdee1; border-radius: 4px; padding: 9px 12px;
    font-size: 0.85rem; max-width: 480px; display: flex; align-items: center; justify-content: space-between;
  }
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

  /* ── Editor de Embed estilo Sapphire (Edit/Preview + Visual/Raw/Variables) ── */
  .bot-badge { display:inline-flex; align-items:center; gap:4px; background:var(--accent); color:#fff; font-size:0.62rem; font-weight:800; letter-spacing:0.5px; padding:1px 6px; border-radius:4px; vertical-align:middle; }
  .bot-badge::before { content:'✓'; font-weight:900; }
  .sap-toppanel { display:flex; align-items:center; gap:2px; background:var(--bg3); border-bottom:1px solid var(--border); padding:0 8px; }
  .sap-toptab { flex:0 0 auto; padding:14px 22px; background:none; border:none; color:var(--text2); font-weight:700; font-size:0.9rem; cursor:pointer; border-bottom:2px solid transparent; transition:all .15s ease; }
  .sap-toptab:hover { color:var(--text); }
  .sap-toptab.active { color:var(--text); border-bottom-color:var(--accent); background:linear-gradient(180deg,transparent,rgba(88,101,242,.08)); }
  .sap-close { margin-left:auto; background:none; border:none; color:var(--text2); font-size:1.1rem; cursor:pointer; padding:8px 12px; border-radius:8px; transition:all .15s ease; }
  .sap-close:hover { color:var(--text); background:var(--bg4); }
  .sap-panel { flex:1; overflow:hidden; display:flex; flex-direction:column; }
  .sap-subtabs { display:flex; gap:4px; background:var(--bg2); padding:10px 22px 0; border-bottom:1px solid var(--border); }
  .sap-subtab { padding:9px 16px; background:var(--bg3); border:1px solid var(--border); border-bottom:none; border-radius:8px 8px 0 0; color:var(--text2); font-weight:600; font-size:0.82rem; cursor:pointer; transition:all .15s ease; margin-bottom:-1px; }
  .sap-subtab:hover { color:var(--text); }
  .sap-subtab.active { color:var(--accent); background:var(--bg2); border-color:var(--border); border-bottom:1px solid var(--bg2); }
  .sap-subpanel textarea#editar-embed-raw { width:100%; background:var(--bg3); border:1px solid var(--border); border-radius:9px; color:var(--text); padding:14px; outline:none; }
  .sap-footer { display:flex; justify-content:flex-end; gap:10px; padding:14px 22px; background:var(--bg3); border-top:1px solid var(--border); }
  .sap-editor .table code { background:var(--bg3); padding:2px 6px; border-radius:5px; color:var(--accent); }
  /* ── WYSIWYG estilo Sapphire: edição diretamente em cima do preview ── */
  .wys-editable { outline:none; cursor:text; border-radius:4px; padding:2px 4px; margin:-2px -4px; transition:background .12s ease; white-space:pre-wrap; word-break:break-word; }
  .wys-editable:hover { background:rgba(255,255,255,0.05); }
  .wys-editable:focus { background:rgba(88,101,242,0.12); box-shadow:0 0 0 1px var(--accent); }
  .wys-editable:empty:before { content:attr(data-placeholder); color:#72767d; }
  .wysiwyg-content { color:#dbdee1; font-size:0.95rem; margin-bottom:10px; min-height:22px; }
  .wysiwyg-embed { display:flex; background:#2b2d31; border-radius:6px; overflow:visible; position:relative; }
  .wysiwyg-embed-colorbar { width:5px; flex-shrink:0; border-radius:4px 0 0 4px; cursor:pointer; background:#5865F2; }
  .wysiwyg-embed-colorbar:hover { filter:brightness(1.2); }
  .wysiwyg-embed-body { padding:12px 16px; flex:1; min-width:0; }
  .wys-row { display:flex; align-items:center; gap:6px; margin-bottom:6px; }
  .wys-author { color:#f2f3f5; font-size:0.85rem; font-weight:600; }
  .wys-author-icon { width:20px; height:20px; border-radius:50%; object-fit:cover; cursor:pointer; }
  .wys-title { color:#f2f3f5; font-weight:700; font-size:1rem; }
  .wys-desc { color:#dbdee1; font-size:0.9rem; line-height:1.4; min-height:20px; }
  .wys-footer { color:#949ba4; font-size:0.75rem; margin-top:10px; min-height:16px; }
  .wys-icon-btn { flex-shrink:0; width:22px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:5px; cursor:pointer; font-size:0.8rem; color:var(--text2); background:var(--bg4); }
  .wys-icon-btn:hover { color:var(--text); background:var(--bg3); }
  .wys-image-wrap { position:relative; margin-top:10px; max-width:100%; }
  .wys-image-wrap img { max-width:100%; border-radius:6px; display:block; cursor:pointer; }
  .wys-image-placeholder { border:1.5px dashed var(--border); border-radius:6px; padding:22px; text-align:center; color:var(--text2); font-size:0.82rem; cursor:pointer; }
  .wys-image-placeholder:hover { border-color:var(--accent); color:var(--text); }
  .wys-remove-btn { position:absolute; top:6px; right:6px; background:rgba(0,0,0,0.65); color:#fff; border:none; border-radius:50%; width:22px; height:22px; cursor:pointer; font-size:0.75rem; line-height:1; }
  .wys-remove-btn:hover { background:rgba(237,66,69,0.9); }
  .wys-thumb-wrap { position:relative; flex-shrink:0; margin:12px 16px 12px 0; align-self:flex-start; }
  .wys-thumb-wrap img { width:80px; height:80px; border-radius:6px; object-fit:cover; display:block; cursor:pointer; }
  .wys-thumb-placeholder { width:80px; height:80px; border:1.5px dashed var(--border); border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text2); font-size:1.2rem; }
  .wys-thumb-placeholder:hover { border-color:var(--accent); color:var(--text); }
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

  async function criarCanaisDeLogs(guildId) {
    if (!confirm('Criar a categoria "Logs" com os canais 📜│logs e 📜│mod-logs, visíveis só para Administradores?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/logs-criar-canais', { method: 'POST' });
      const data = await res.json();
      toast(data.message || (data.ok ? 'Criado!' : 'Erro.'), data.ok ? 'success' : 'error');
      if (data.ok) refreshSection('logs');
    } catch(e) {
      toast('❌ Erro de ligação ao criar os canais.', 'error');
    }
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
      if (json.ok) { form.reset(); refreshSection('rr_tab'); }
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
      if (json.ok) refreshSection('rr_tab');
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

  // ── Canais onde o Anti-Links/Anti-Convites se aplica ──
  function toggleLinkChannelMode() {
    const modo = document.querySelector('input[name="link_channel_mode"]:checked')?.value;
    document.getElementById('link-channels-picker').style.display = modo === 'specific' ? 'block' : 'none';
  }

  function selecionarTodosCanaisLink(marcar) {
    document.querySelectorAll('#link-channels-list .link-channel-checkbox').forEach(cb => cb.checked = marcar);
  }

  async function saveLinkInviteChannels(guildId) {
    const modo = document.querySelector('input[name="link_channel_mode"]:checked')?.value || 'all';
    const channels = modo === 'all' ? [] : Array.from(document.querySelectorAll('#link-channels-list .link-channel-checkbox:checked')).map(cb => cb.value);
    try {
      const res = await fetch('/api/' + guildId + '/antispam-link-channels', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ mode: modo, channels })
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  function selecionarTodosCanaisLinkExcluidos(marcar) {
    document.querySelectorAll('#link-excluded-channels-list .link-excluded-channel-checkbox').forEach(cb => cb.checked = marcar);
  }

  async function saveLinkInviteExcludedChannels(guildId) {
    const channels = Array.from(document.querySelectorAll('#link-excluded-channels-list .link-excluded-channel-checkbox:checked')).map(cb => cb.value);
    try {
      const res = await fetch('/api/' + guildId + '/antispam-link-excluded-channels', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ channels })
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
      if (json.ok) refreshSection('cargos_tab');
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
      if (json.ok) refreshSection('cargos_tab');
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
      if (json.ok) refreshSection('stats_tab');
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
      if (json.ok) refreshSection('votacao_tab');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function removeVotacao(guildId) {
    if (!confirm('Remover a votação configurada?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/votacao-remove', { method: 'POST' });
      const json = await res.json();
      toast(json.ok ? json.message : '❌ Erro', json.ok ? 'success' : 'error');
      if (json.ok) refreshSection('votacao_tab');
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
      if (json.ok) { form.reset(); refreshSection('mod_tab'); }
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
      if (json.ok) refreshSection('mod_tab');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Tipos de Ticket ──
  async function addTicketType(guildId) {
    const form = document.getElementById('form-ticket-type');
    const data = new FormData(form);
    const body = new URLSearchParams(data).toString();
    const totalAtual = document.querySelectorAll('[id^="tt-row-"]').length;
    if (currentPanelMode === 'buttons' && totalAtual >= 10) {
      return toast('❌ No modo Botões Diretos só podes ter até 10 tipos de ticket. Remove um antes de adicionar outro.', 'error');
    }
    try {
      const res = await fetch('/api/' + guildId + '/ticket-types', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) { form.reset(); refreshSection('tickets'); }
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
      if (json.ok) refreshSection('tickets');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function toggleTicketForm(guildId, typeId) {
    try {
      const res = await fetch('/api/' + guildId + '/ticket-types/toggle-form', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + typeId
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) refreshSection('tickets');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  async function updateTicketTypeColor(guildId, typeId, color) {
    const row = document.getElementById('tt-row-' + typeId);
    const label = row?.dataset.label || '';
    const emoji = row?.dataset.emoji || '🎫';
    try {
      const body = new URLSearchParams({ id: typeId, label, emoji, color }).toString();
      const res = await fetch('/api/' + guildId + '/ticket-types/edit', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body
      });
      const json = await res.json();
      if (json.ok && row) {
        row.dataset.color = color;
        renderTicketPreview();
      } else {
        toast('❌ ' + (json.message || 'Erro ao guardar cor'), 'error');
      }
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Modo do painel (select vs botões) ──
  let currentPanelMode = document.getElementById('panel_mode_hidden')?.value || 'select';
  function setPanelMode(mode) {
    currentPanelMode = mode;
    document.getElementById('panel_mode_hidden').value = mode;
    document.getElementById('mode-card-select').classList.toggle('active', mode === 'select');
    document.getElementById('mode-card-buttons').classList.toggle('active', mode === 'buttons');

    const mostrarCor = mode === 'buttons';
    const colorGroup = document.getElementById('tt-color-group');
    if (colorGroup) colorGroup.style.display = mostrarCor ? 'block' : 'none';
    const colorTh = document.getElementById('tt-color-th');
    if (colorTh) colorTh.style.display = mostrarCor ? 'table-cell' : 'none';
    document.querySelectorAll('.tt-color-td').forEach(td => { td.style.display = mostrarCor ? 'table-cell' : 'none'; });

    renderTicketPreview();
  }

  function escapeHtmlPreview(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function collectTicketTypesFromDom() {
    return Array.from(document.querySelectorAll('[id^="tt-row-"]')).map(row => ({
      id: row.id.replace('tt-row-', ''),
      label: row.dataset.label,
      emoji: row.dataset.emoji || '🎫',
      color: row.dataset.color || '#5865F2',
    }));
  }

  function renderTicketPreview() {
    const titulo = document.getElementById('panel_titulo_input')?.value || '🎫 Suporte';
    const descricao = document.getElementById('panel_descricao_input')?.value || '';
    const cor = document.getElementById('panel_color_hidden')?.value || '#5865F2';

    const embedEl = document.getElementById('discord-preview-embed');
    if (embedEl) {
      embedEl.style.borderLeftColor = cor;
      embedEl.innerHTML =
        '<div class="dpe-title">' + escapeHtmlPreview(titulo) + '</div>' +
        '<div class="dpe-desc">' + escapeHtmlPreview(descricao) + '</div>';
    }

    let tipos = collectTicketTypesFromDom();
    // Inclui o tipo que está a ser preenchido no formulário "Adicionar Tipo", se tiver nome
    const novoLabel = document.getElementById('tt-label')?.value?.trim();
    if (novoLabel) {
      tipos = tipos.concat([{
        id: 'novo',
        label: novoLabel,
        emoji: document.getElementById('tt-emoji')?.value?.trim() || '🎫',
        color: document.getElementById('tt-color')?.value || '#5865F2',
      }]);
    }

    const compEl = document.getElementById('discord-preview-components');
    if (!compEl) return;

    if (tipos.length === 0) {
      compEl.innerHTML = '<button class="dp-btn" style="background:#5865F2">🎫 Abrir Ticket</button>';
      return;
    }

    if (currentPanelMode === 'buttons') {
      const limitados = tipos.slice(0, 10);
      compEl.innerHTML = limitados.map(t =>
        '<button class="dp-btn" style="background:' + (t.color || '#5865F2') + '">' + escapeHtmlPreview(t.emoji) + ' ' + escapeHtmlPreview(t.label) + '</button>'
      ).join('');
    } else {
      compEl.innerHTML = '<div class="dp-select"><span>Seleciona o tipo de ticket...</span><span>▾</span></div>';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('panel_mode_hidden')) setPanelMode(currentPanelMode);
    renderTicketPreview();
  });

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
    // Guarda o modo/cor do painel (definidos na Configuração de Tickets) antes de enviar
    try {
      const cfgForm = document.getElementById('form-tickets');
      const cfgData = new FormData(cfgForm);
      const cfgBody = new URLSearchParams(cfgData).toString();
      const cfgRes = await fetch('/api/' + guildId + '/ticket-config', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: cfgBody
      });
      const cfgJson = await cfgRes.json();
      if (!cfgJson.ok) return toast('❌ Erro ao guardar configuração antes de enviar', 'error');
    } catch(e) { return toast('❌ Erro de ligação ao guardar configuração', 'error'); }

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
      if (json.ok) refreshSection('embeds_tab');
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
      if (json.ok) refreshSection('embeds_tab');
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
      if (json.ok) refreshSection('embeds_tab');
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
      if (json.ok) refreshSection('embeds_tab');
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
      if (json.ok) refreshSection('embeds_tab');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }
  // ── Perguntas à comunidade ──
  async function recarregarPerguntasHistorico(guildId) {
    try {
      const res = await fetch('/api/' + guildId + '/perguntas');
      const json = await res.json();
      const el = document.getElementById('perguntas-historico');
      if (el && json.html !== undefined) el.innerHTML = json.html;
    } catch(e) {}
  }
  async function enviarPerguntaDashboard(guildId) {
    const form = document.getElementById('form-pergunta');
    const canal = form.querySelector('[name="channel_id"]').value;
    const pergunta = document.getElementById('pergunta-texto').value.trim();
    const mensagemExtra = document.getElementById('pergunta-mensagem-extra').value.trim();
    if (!canal) { toast('❌ Escolhe um canal.', 'error'); return; }
    if (!pergunta) { toast('❌ Escreve a pergunta.', 'error'); return; }
    try {
      const res = await fetch('/api/' + guildId + '/perguntas', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ channel_id: canal, pergunta, mensagem_extra: mensagemExtra })
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) {
        form.reset();
        await recarregarPerguntasHistorico(guildId);
      }
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
      if (json.ok) await recarregarPerguntasHistorico(guildId);
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
      if (json.ok) refreshSection('embeds_tab');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function configurarComandoEmbed(guildId, id) {
    const input = document.getElementById('embed-cmd-' + id);
    const comando = input ? input.value.trim() : '';
    if (!comando) { toast('❌ Escreve o nome do comando (ex: abrirservidor).', 'error'); return; }
    try {
      const res = await fetch('/api/' + guildId + '/embeds/comando', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'},
        body: 'id=' + id + '&comando=' + encodeURIComponent(comando)
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) refreshSection('embeds_tab');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  async function removerComandoEmbed(guildId, id) {
    if (!confirm('Remover o comando configurado para esta embed?')) return;
    try {
      const res = await fetch('/api/' + guildId + '/embeds/comando-remover', {
        method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: 'id=' + id
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) refreshSection('embeds_tab');
    } catch(e) { toast('❌ Erro de ligação', 'error'); }
  }

  // ── Editar embed guardada (editor genérico WYSIWYG estilo Sapphire) ──
  function abrirEditarEmbed(e) {
    document.getElementById('editar-embed-id').value = e.id;
    document.getElementById('editar-embed-nome').textContent = e.name || '';
    document.getElementById('editar-embed-cor').value = e.color || '#5865F2';
    document.getElementById('editar-embed-titulo').textContent = e.title || '';
    document.getElementById('editar-embed-url').value = e.url || '';
    document.getElementById('editar-embed-descricao').textContent = e.description || '';
    document.getElementById('editar-embed-imagem').value = e.image || '';
    document.getElementById('editar-embed-thumbnail').value = e.thumbnail || '';
    document.getElementById('editar-embed-footer').textContent = e.footer || '';
    document.getElementById('editar-embed-mensagem').textContent = e.content || '';
    document.getElementById('editar-embed-autor-nome').textContent = e.author_name || '';
    document.getElementById('editar-embed-autor-icon').value = e.author_icon || '';
    document.getElementById('editar-embed-image-pos').value = e.image_pos || 'bottom';
    document.getElementById('editar-embed-modal').style.display = 'flex';
    sapSwitchTop('edit');
    sapSwitchSub('visual');
    sincronizarVisualEstadoWys();
    atualizarPreviewEmbedGenerico();
  }

  // Clicar num ícone (🖼️ autor, 🔗 link do título, imagem, thumbnail) pede o URL e guarda no campo escondido correspondente
  function editarUrlCampo(hiddenFieldId, label) {
    const atual = document.getElementById(hiddenFieldId).value || '';
    const novo = prompt(label + ':', atual);
    if (novo === null) return; // cancelado
    document.getElementById(hiddenFieldId).value = novo.trim();
    sincronizarVisualEstadoWys();
    atualizarPreviewEmbedGenerico();
  }

  // Remove o valor de um campo de imagem/URL (botão ✕)
  function removerCampoEmbed(hiddenFieldId) {
    document.getElementById(hiddenFieldId).value = '';
    sincronizarVisualEstadoWys();
    atualizarPreviewEmbedGenerico();
  }

  // Atualiza os elementos visuais (imagens, thumb, cor da barra, botão de link) consoante o estado atual dos campos
  function sincronizarVisualEstadoWys() {
    const cor = document.getElementById('editar-embed-cor').value || '#5865F2';
    const bar = document.getElementById('wys-colorbar');
    if (bar) bar.style.background = cor;

    const url = document.getElementById('editar-embed-url').value;
    const linkBtn = document.getElementById('wys-link-btn');
    if (linkBtn) linkBtn.style.color = url ? 'var(--accent)' : '';
    const tituloEl = document.getElementById('editar-embed-titulo');
    if (tituloEl) tituloEl.style.color = url ? '#00a8fc' : '';

    const authorIcon = document.getElementById('editar-embed-autor-icon').value;
    const authorImg = document.getElementById('wys-author-icon-preview');
    if (authorImg) { authorImg.src = authorIcon || ''; authorImg.style.display = authorIcon ? 'block' : 'none'; }

    const imagem = document.getElementById('editar-embed-imagem').value;
    const imgPrev = document.getElementById('wys-image-preview');
    const imgPlaceholder = document.getElementById('wys-image-placeholder');
    const imgRemove = document.getElementById('wys-image-remove');
    if (imgPrev && imgPlaceholder && imgRemove) {
      if (imagem) {
        imgPrev.src = imagem; imgPrev.style.display = 'block';
        imgPlaceholder.style.display = 'none'; imgRemove.style.display = 'flex';
      } else {
        imgPrev.style.display = 'none'; imgPlaceholder.style.display = 'block'; imgRemove.style.display = 'none';
      }
    }

    const thumb = document.getElementById('editar-embed-thumbnail').value;
    const thumbPrev = document.getElementById('wys-thumb-preview');
    const thumbPlaceholder = document.getElementById('wys-thumb-placeholder');
    const thumbRemove = document.getElementById('wys-thumb-remove');
    if (thumbPrev && thumbPlaceholder && thumbRemove) {
      if (thumb) {
        thumbPrev.src = thumb; thumbPrev.style.display = 'block';
        thumbPlaceholder.style.display = 'none'; thumbRemove.style.display = 'flex';
      } else {
        thumbPrev.style.display = 'none'; thumbPlaceholder.style.display = 'flex'; thumbRemove.style.display = 'none';
      }
    }
  }

  function fecharEditarEmbed() {
    document.getElementById('editar-embed-modal').style.display = 'none';
  }

  // Alterna entre os separadores de topo "Edit" / "Preview" (estilo Sapphire)
  function sapSwitchTop(which) {
    document.getElementById('sap-toptab-edit').classList.toggle('active', which === 'edit');
    document.getElementById('sap-toptab-preview').classList.toggle('active', which === 'preview');
    document.getElementById('sap-panel-edit').style.display = which === 'edit' ? 'flex' : 'none';
    document.getElementById('sap-panel-preview').style.display = which === 'preview' ? 'block' : 'none';
    if (which === 'preview') atualizarPreviewEmbedGenerico();
  }

  // Alterna entre os sub-separadores "Visual" / "Raw" / "Variables"
  function sapSwitchSub(which, btn) {
    ['visual','raw','variables'].forEach(k => {
      document.getElementById('sap-sub-'+k).style.display = (k === which) ? 'block' : 'none';
    });
    document.querySelectorAll('.sap-subtab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else {
      const idx = { visual: 0, raw: 1, variables: 2 }[which];
      const all = document.querySelectorAll('.sap-subtab');
      if (all[idx]) all[idx].classList.add('active');
    }
    if (which === 'raw') sincronizarRawEmbed();
  }

  // Lê os campos do formulário Visual e devolve um objeto "estilo welcome" compatível
  // com renderizarPreviewEmbed(), reaproveitando a mesma função usada no preview de boas-vindas.
  function lerFormularioEmbedGenerico() {
    const txt = id => (document.getElementById(id).textContent || '').trim();
    const val = id => (document.getElementById(id).value || '').trim();
    return {
      welcome_content: txt('editar-embed-mensagem'),
      welcome_author_name: txt('editar-embed-autor-nome'),
      welcome_author_icon: val('editar-embed-autor-icon'),
      welcome_title: txt('editar-embed-titulo'),
      welcome_url: val('editar-embed-url'),
      welcome_msg: txt('editar-embed-descricao'),
      welcome_image: val('editar-embed-imagem'),
      welcome_thumbnail: val('editar-embed-thumbnail'),
      welcome_footer: txt('editar-embed-footer'),
      welcome_color: val('editar-embed-cor'),
      welcome_image_pos: val('editar-embed-image-pos'),
    };
  }

  function atualizarPreviewEmbedGenerico() {
    sincronizarVisualEstadoWys();
    const box = document.getElementById('editar-embed-preview-box');
    if (!box) return;
    const body = lerFormularioEmbedGenerico();
    box.innerHTML = renderizarPreviewEmbed(body, null, true);
  }

  function sincronizarRawEmbed() {
    const body = lerFormularioEmbedGenerico();
    const raw = {
      title: body.welcome_title || null,
      description: body.welcome_msg || null,
      color: body.welcome_color || null,
      url: body.welcome_url || null,
      author_name: body.welcome_author_name || null,
      author_icon: body.welcome_author_icon || null,
      image: body.welcome_image || null,
      thumbnail: body.welcome_thumbnail || null,
      footer: body.welcome_footer || null,
      content: body.welcome_content || null,
      image_pos: body.welcome_image_pos || 'bottom',
    };
    document.getElementById('editar-embed-raw').value = JSON.stringify(raw, null, 2);
  }

  function aplicarRawEmbed() {
    try {
      const raw = JSON.parse(document.getElementById('editar-embed-raw').value);
      document.getElementById('editar-embed-titulo').textContent = raw.title || '';
      document.getElementById('editar-embed-url').value = raw.url || '';
      document.getElementById('editar-embed-descricao').textContent = raw.description || '';
      document.getElementById('editar-embed-cor').value = raw.color || '#5865F2';
      document.getElementById('editar-embed-autor-nome').textContent = raw.author_name || '';
      document.getElementById('editar-embed-autor-icon').value = raw.author_icon || '';
      document.getElementById('editar-embed-imagem').value = raw.image || '';
      document.getElementById('editar-embed-thumbnail').value = raw.thumbnail || '';
      document.getElementById('editar-embed-footer').textContent = raw.footer || '';
      document.getElementById('editar-embed-mensagem').textContent = raw.content || '';
      document.getElementById('editar-embed-image-pos').value = raw.image_pos || 'bottom';
      toast('✅ JSON aplicado ao formulário', 'success');
      sapSwitchSub('visual');
      sincronizarVisualEstadoWys();
      atualizarPreviewEmbedGenerico();
    } catch (e) {
      toast('❌ JSON inválido: ' + e.message, 'error');
    }
  }

  async function guardarEdicaoEmbed(guildId) {
    const id = document.getElementById('editar-embed-id').value;
    const campos = lerFormularioEmbedGenerico();
    const body = {
      id,
      titulo: campos.welcome_title,
      descricao: campos.welcome_msg,
      cor: campos.welcome_color,
      url: campos.welcome_url,
      autor_nome: campos.welcome_author_name,
      autor_icon: campos.welcome_author_icon,
      imagem: campos.welcome_image,
      thumbnail: campos.welcome_thumbnail,
      footer: campos.welcome_footer,
      mensagem: campos.welcome_content,
      image_pos: campos.welcome_image_pos,
    };
    try {
      const res = await fetch('/api/' + guildId + '/embeds/editar', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      const json = await res.json();
      toast(json.ok ? json.message : ('❌ ' + json.message), json.ok ? 'success' : 'error');
      if (json.ok) { fecharEditarEmbed(); refreshSection('embeds_tab'); }
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
  <title>${CONFIG.BOT_NAME} — Dashboard</title>
  <style>
    ${dashboardCSS}
    .sap-home-nav { background: rgba(18,24,38,0.7); border-bottom: 1px solid var(--border); padding: 0 32px; height: 64px; display:flex; align-items:center; justify-content:space-between; backdrop-filter: blur(14px); }
    .sap-home-nav .logo { font-size: 1.15rem; font-weight: 700; display:flex; align-items:center; gap:10px; }
    .sap-home-nav .logo img { width: 30px; height: 30px; border-radius: 8px; box-shadow: 0 0 14px var(--accent-glow); }
    .sap-home-nav .links { display:flex; gap: 32px; }
    .sap-home-nav .links a { color: var(--text2); font-weight: 600; font-size: 0.92rem; }
    .sap-home-nav .links a.active { color: var(--text); border-bottom: 2px solid var(--accent); padding-bottom: 22px; }
    .sap-home-nav .cta { background: var(--accent); color:#fff; padding: 10px 22px; border-radius: 999px; font-weight: 700; font-size: 0.88rem; }
    .sap-home-nav .cta:hover { background: var(--accent2); }
    .login-page { min-height: calc(100vh - 64px); display: flex; align-items: center; padding: 0 8vw; position: relative; overflow: hidden; }
    .login-hero { max-width: 560px; position: relative; z-index: 2; }
    .login-hero .logo-big { width: 96px; height: 96px; border-radius: 22px; margin-bottom: 24px; box-shadow: 0 0 60px var(--accent-glow); }
    .login-hero h1 { font-size: 3.2rem; font-weight: 800; line-height: 1.1; margin-bottom: 18px; }
    .login-hero .tagline { color: var(--text2); font-size: 1.15rem; line-height: 1.7; margin-bottom: 36px; }
    .login-hero .tagline b { color: var(--text); font-weight: 700; }
    .login-actions { display:flex; gap: 14px; }
    .discord-btn { display: inline-flex; align-items: center; gap: 10px; background: var(--accent); color: #fff; padding: 14px 28px; border-radius: 999px; font-size: 0.95rem; font-weight: 700; text-decoration: none; transition: all 0.2s; }
    .discord-btn:hover { background: var(--accent2); transform: translateY(-2px); box-shadow: 0 8px 28px var(--accent-glow); }
    .discord-btn-outline { display:inline-flex; align-items:center; padding: 14px 26px; border-radius: 999px; font-weight:700; font-size:0.95rem; background: var(--bg3); border: 1px solid var(--border); color: var(--text); }
    .discord-btn-outline:hover { background: var(--bg4); }
    .hex-field { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
    .hex { position: absolute; border-radius: 22%; filter: blur(0px); opacity: 0.9; }
    .info-overlay { display:none; position:fixed; inset:0; z-index:50; background: rgba(6,10,20,0.82); backdrop-filter: blur(6px); align-items:center; justify-content:center; padding: 24px; }
    .info-overlay.open { display:flex; }
    .info-card { background: var(--bg3, #131a2b); border: 1px solid var(--border, #232b40); border-radius: 18px; max-width: 560px; width:100%; padding: 36px; position:relative; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
    .info-card h2 { font-size: 1.6rem; font-weight: 800; margin-bottom: 14px; }
    .info-card p { color: var(--text2, #9aa4bd); line-height:1.7; margin-bottom: 10px; }
    .info-card .close-btn { position:absolute; top:16px; right:18px; background:none; border:none; color: var(--text2,#9aa4bd); font-size:1.4rem; cursor:pointer; line-height:1; }
    .info-card .close-btn:hover { color: var(--text,#fff); }
    .status-row { display:flex; align-items:center; justify-content:space-between; padding: 10px 0; border-bottom: 1px solid var(--border, #232b40); }
    .status-row:last-child { border-bottom:none; }
    .status-dot { display:inline-flex; align-items:center; gap:8px; font-weight:600; }
    .status-dot::before { content:''; width:9px; height:9px; border-radius:50%; background:#57F287; box-shadow:0 0 8px #57F287; }
  </style>
</head>
<body>
  <nav class="sap-home-nav">
    <div class="logo"><img src="${CONFIG.BOT_AVATAR_URL}" alt="logo"> ${CONFIG.BOT_NAME}</div>
    <div class="links">
      <a href="#" class="active" onclick="return false;">Home</a>
      <a href="#" onclick="openInfoOverlay('about');return false;">About</a>
      <a href="#" onclick="openInfoOverlay('status');return false;">Status</a>
    </div>
    <a href="/auth/discord" class="cta">Open dashboard</a>
  </nav>
  <div class="login-page">
    <div class="hex-field">
      <div class="hex" style="width:70px;height:70px;top:14%;right:26%;background:linear-gradient(135deg,#2196f3,#0d8bf0);box-shadow:0 0 40px rgba(33,150,243,.5)"></div>
      <div class="hex" style="width:36px;height:36px;top:32%;right:44%;background:radial-gradient(circle,#3bc9f0,transparent 70%)"></div>
      <div class="hex" style="width:52px;height:52px;top:44%;right:16%;background:linear-gradient(135deg,#22d3ee,#0d8bf0);box-shadow:0 0 30px rgba(34,211,238,.4)"></div>
      <div class="hex" style="width:60px;height:60px;top:56%;right:32%;background:linear-gradient(135deg,#5b7cfa,#2196f3);box-shadow:0 0 30px rgba(33,150,243,.4)"></div>
      <div class="hex" style="width:44px;height:44px;top:70%;right:20%;background:radial-gradient(circle,#2196f3,transparent 70%)"></div>
      <div class="hex" style="width:34px;height:34px;top:76%;right:46%;background:linear-gradient(135deg,#2196f3,#0d8bf0)"></div>
    </div>
    <div class="login-hero">
      <img class="logo-big" src="${CONFIG.BOT_AVATAR_URL}" alt="${CONFIG.BOT_NAME}">
      <h1>${CONFIG.BOT_NAME}</h1>
      <p class="tagline"><b>Bot Discord Multi-funcional.</b><br>Totalmente personalizável.<br>Gratuito.</p>
      <div class="login-actions">
        <a href="/auth/discord" class="discord-btn">
          <svg width="20" height="20" viewBox="0 0 71 55" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a40.5 40.5 0 0 0-1.8 3.7 54.1 54.1 0 0 0-16.3 0A39.7 39.7 0 0 0 25.6.4 58.4 58.4 0 0 0 11 5C1.6 19 -.98 32.6.31 46c6.2 4.5 12.2 7.2 18.1 9a43.5 43.5 0 0 0 3.8-6.2 38.3 38.3 0 0 1-6-2.9c.5-.36 1-.73 1.5-1.1a41.9 41.9 0 0 0 35.6 0c.5.39 1 .76 1.5 1.1a38.2 38.2 0 0 1-6 2.9 43.6 43.6 0 0 0 3.8 6.2c5.9-1.9 11.9-4.6 18.1-9 1.5-15.6-2.5-29.1-10.6-41.1ZM23.7 37.9c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2c0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.2 6.4 7.2c0 4-2.8 7.2-6.4 7.2Z"/></svg>
          Add to Discord
        </a>
        <a href="/auth/discord" class="discord-btn-outline">Open dashboard</a>
      </div>
    </div>
  </div>

  <div class="info-overlay" id="overlay-about">
    <div class="info-card">
      <button class="close-btn" onclick="closeInfoOverlay('about')">&times;</button>
      <h2>Sobre o ${CONFIG.BOT_NAME}</h2>
      <p>O <b>${CONFIG.BOT_NAME}</b> é um bot Discord multi-funcional criado para ajudar a gerir o teu servidor de forma simples e completa.</p>
      <p>Inclui sistema de tickets, moderação, boas-vindas personalizáveis, painéis de informação, cargos automáticos e um dashboard web onde podes configurar tudo sem escrever código.</p>
      <p>É gratuito e está em desenvolvimento contínuo, com novas funcionalidades a serem adicionadas regularmente.</p>
    </div>
  </div>

  <div class="info-overlay" id="overlay-status">
    <div class="info-card">
      <button class="close-btn" onclick="closeInfoOverlay('status')">&times;</button>
      <h2>Estado do sistema</h2>
      <div class="status-row"><span>Bot Discord</span><span class="status-dot">Operacional</span></div>
      <div class="status-row"><span>Dashboard Web</span><span class="status-dot">Operacional</span></div>
      <div class="status-row"><span>Base de dados</span><span class="status-dot">Operacional</span></div>
      <p style="margin-top:16px;font-size:0.85rem">Todos os sistemas estão a funcionar normalmente. Caso encontres algum problema, contacta a equipa de suporte.</p>
    </div>
  </div>

  <script>
    function openInfoOverlay(name) {
      document.getElementById('overlay-' + name).classList.add('open');
    }
    function closeInfoOverlay(name) {
      document.getElementById('overlay-' + name).classList.remove('open');
    }
    document.querySelectorAll('.info-overlay').forEach(function(ov) {
      ov.addEventListener('click', function(e) {
        if (e.target === ov) ov.classList.remove('open');
      });
    });
  </script>
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
  <style>
    ${dashboardCSS}
    .sap-select-header { display:flex; flex-direction:column; align-items:center; gap:10px; padding: 40px 0 8px; }
    .sap-select-header .logo { font-size:1.4rem; font-weight:700; display:flex; align-items:center; gap:10px; }
    .sap-select-header .logo img { width: 34px; height:34px; border-radius:9px; box-shadow:0 0 16px var(--accent-glow); }
    .sap-guild-list { max-width: 560px; margin: 24px auto; }
    .sap-guild-item { display:flex; align-items:center; gap:14px; padding: 14px 20px; background: var(--bg2); border:1px solid var(--border); border-radius: 12px; margin-bottom: 10px; transition: all .18s ease; }
    .sap-guild-item:hover { border-color: var(--accent); background: var(--bg3); }
    .sap-guild-item img { width: 36px; height:36px; border-radius: 50%; object-fit:cover; }
    .sap-guild-item .name { flex:1; font-weight:700; font-size:0.98rem; }
    .sap-guild-item .arrow { color: var(--text2); }
  </style>
</head>
<body>
  <div class="sap-select-header">
    <div class="logo"><img src="${CONFIG.BOT_AVATAR_URL}" alt="logo"> ${CONFIG.BOT_NAME}</div>
  </div>
  <div class="container" style="max-width:640px;padding-top:8px">
    ${error ? `<div class="alert alert-error">${error}</div>` : ''}
    <div class="card" style="padding:0;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:18px 22px;border-bottom:1px solid var(--border);color:var(--text2);font-weight:600">
        Logged in as
        <img src="${user.avatar}" alt="avatar" style="width:26px;height:26px;border-radius:50%">
        <span style="color:var(--text)">${user.username}</span>
      </div>
      <div style="max-height:420px;overflow-y:auto">
        ${availableGuilds.length === 0 ? `<div class="alert alert-error" style="margin:16px">❌ Não tens servidores em comum com o bot. <a href="${inviteUrl}" target="_blank">Adiciona o bot aqui</a></div>` : availableGuilds.map(g => {
      const botGuild = botGuilds.find(bg => bg.id === g.id);
      const icon = g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
      return `<a href="/dashboard/${g.id}" style="text-decoration:none;color:inherit">
                <div class="sap-guild-item" style="border:none;border-radius:0;border-bottom:1px solid var(--border);margin-bottom:0">
                  <img src="${icon}" alt="${g.name}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                  <div class="name">${g.name}</div>
                  <div style="color:var(--text2);font-size:0.8rem;margin-right:6px">${botGuild?.memberCount || '?'} membros</div>
                  <div class="arrow">›</div>
                </div>
              </a>`;
    }).join('')}
      </div>
    </div>
    <div style="margin-top:24px;text-align:center;color:var(--text2);font-size:0.85rem">
      Bot não está no servidor? <a href="${inviteUrl}" target="_blank">Adiciona aqui</a>
    </div>
    <div style="margin-top:32px;text-align:center;color:var(--text2);font-size:0.78rem">
      © 2021–${new Date().getFullYear()} ${CONFIG.BOT_NAME} · <a href="#">Terms</a> · <a href="#">Privacy</a>
    </div>
  </div>
</body>
</html>`;
  }

  /** Renderiza o dashboard completo de um servidor */
  function renderGuildDashboard(user, guild, data) {
    const {
      ticketConfig,
      guildConfig,
      antispam,
      statsConfig,
      votacaoConfig,
      sugestaoConfig,
      reactionRoles,
      ticketTypes,
      savedEmbeds,
      perguntas,
      staffRanking,
      members,
      totalTickets,
      openTickets,
      totalWarns,
      totalSugs,
      channels,
      roles,
      categories,
      autoroleHumanos,
      autoroleBots,
      roleExclusivity,
      blacklist,
      immuneRoles
    } = data;
    const makeSelect = (name, options, current, placeholder = 'Seleciona...') => `<select name="${name}" id="${name}">
      <option value="">— ${placeholder} —</option>
      ${options.map(o => `<option value="${o.id}" ${o.id === current ? 'selected' : ''}>${o.name}</option>`).join('')}
    </select>`;
    const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
    const makeRolePickerList = (name, options, currentList = []) => {
      const lista = currentList.length ? currentList : [''];
      const optionsHtml = current => `<option value="">— Seleciona um cargo —</option>` + options.map(o => `<option value="${o.id}" ${o.id === current ? 'selected' : ''}>${o.name}</option>`).join('');
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
    const makeMemberSelect = (name, current) => `<select name="${name}" id="${name}">
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
      <img src="${CONFIG.BOT_AVATAR_URL}" alt="logo"> ${CONFIG.BOT_NAME}
      <a href="/dashboard" onclick="try{localStorage.removeItem('dashboard_section_${guild.id}')}catch(e){}" style="color:var(--text2);font-size:0.95rem;margin-left:8px">▾ <span style="color:var(--text)">${guild.name}</span></a>
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
    ${[['📊', 'Visão Geral', 'overview'], ['🎫', 'Tickets', 'tickets'], ['🔨', 'Moderação', 'mod_tab'], ['👋', 'Boas-vindas', 'welcome'], ['🛡️', 'AntiSpam', 'antispam'], ['📋', 'Logs', 'logs'], ['🎨', 'Embeds', 'embeds_tab'], ['⭐', 'Avaliações Staff', 'ratings'], ['💡', 'Sugestões', 'suggestions_tab'], ['❓', 'Perguntas', 'perguntas_tab'], ['🎭', 'Reaction Roles', 'rr_tab'], ['🎖️', 'Cargos', 'cargos_tab'], ['📈', 'Server Stats', 'stats_tab'], ['🗳️', 'Votação', 'votacao_tab'], ['🎉', 'Giveaways', 'giveaways_tab'], ['🪧', 'Painéis de Info', 'infopanels_tab']].map(([ico, lbl, id]) => `<button class="sidebar-item" onclick="showSection('${id}', event)">${ico} ${lbl}</button>`).join('')}
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
          <input type="hidden" name="panel_mode" id="panel_mode_hidden" value="${ticketConfig?.panel_mode === 'buttons' ? 'buttons' : 'select'}">
          <input type="hidden" name="panel_color" id="panel_color_hidden" value="${ticketConfig?.panel_color || '#5865F2'}">
          <button type="button" class="btn btn-primary" onclick="saveConfig('${guild.id}','ticket-config','form-tickets')">💾 Guardar Configuração</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🏷️ Tipos de Ticket</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">Cria diferentes tipos de ticket (ex: Suporte, Denúncia, Parceria). Se houver pelo menos 1 tipo, o painel de tickets mostra um menu de seleção ou botões (conforme o modo escolhido abaixo) em vez de um botão simples.</p>

        <div class="form-group">
          <label>Modo do Painel</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div id="mode-card-select" class="ticket-mode-card" onclick="setPanelMode('select')">
              <div style="font-size:1.4rem">📋</div>
              <div style="font-weight:700;margin-top:4px">Menu de Seleção</div>
              <div style="color:var(--text2);font-size:0.78rem;margin-top:2px">Dropdown com até 25 tipos</div>
            </div>
            <div id="mode-card-buttons" class="ticket-mode-card" onclick="setPanelMode('buttons')">
              <div style="font-size:1.4rem">🔘</div>
              <div style="font-weight:700;margin-top:4px">Botões Diretos</div>
              <div style="color:var(--text2);font-size:0.78rem;margin-top:2px">Até 10 botões, cor própria cada</div>
            </div>
          </div>
        </div>

        <form id="form-ticket-type">
          <div class="grid-2">
            <div class="form-group">
              <label>Nome do Tipo</label>
              <input type="text" name="label" id="tt-label" placeholder="Ex: Suporte Técnico" maxlength="80" oninput="renderTicketPreview()">
            </div>
            <div class="form-group">
              <label>Emoji</label>
              <input type="text" name="emoji" id="tt-emoji" placeholder="Ex: 🎫" maxlength="10" oninput="renderTicketPreview()">
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
            <label>Descrição (aparece no menu, modo dropdown)</label>
            <input type="text" name="description" placeholder="Ex: Para problemas técnicos com a tua conta" maxlength="100">
          </div>
          <div class="form-group" id="tt-color-group" style="display:${ticketConfig?.panel_mode === 'buttons' ? 'block' : 'none'}">
            <label>Cor do Botão</label>
            <input type="color" name="color" id="tt-color" value="#5865F2" style="height:42px;width:80px;padding:4px;cursor:pointer" oninput="renderTicketPreview()">
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
              <thead><tr><th id="tt-color-th" style="display:${ticketConfig?.panel_mode === 'buttons' ? 'table-cell' : 'none'}">Cor</th><th>Emoji</th><th>Nome</th><th>Descrição</th><th>Formulário</th><th></th></tr></thead>
              <tbody>
                ${ticketTypes.map(t => `
                  <tr id="tt-row-${t.id}" data-color="${t.color || '#5865F2'}" data-emoji="${escHtml(t.emoji || '🎫')}" data-label="${escHtml(t.label)}">
                    <td class="tt-color-td" style="display:${ticketConfig?.panel_mode === 'buttons' ? 'table-cell' : 'none'}"><input type="color" value="${t.color || '#5865F2'}" title="Cor do botão" style="width:32px;height:26px;padding:0;border:none;cursor:pointer;background:none" onchange="updateTicketTypeColor('${guild.id}', ${t.id}, this.value)"></td>
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
                    <td colspan="6">
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
          Publica a mensagem com o botão (ou menu/botões, se já tiveres tipos de ticket criados) para os membros abrirem tickets.
          Certifica-te de que já guardaste a "Configuração de Tickets" acima antes de enviar.
        </p>
        <form id="form-ticket-panel">
          <div class="form-group">
            <label>Canal onde publicar o painel</label>
            ${makeSelect('channel_id', channels, ticketConfig?.panel_channel_id, 'Canal')}
          </div>
          <div class="form-group">
            <label>Título</label>
            <input type="text" name="titulo" id="panel_titulo_input" value="🎫 Suporte" maxlength="256" oninput="renderTicketPreview()">
          </div>
          <div class="form-group">
            <label>Descrição</label>
            <textarea name="descricao" id="panel_descricao_input" rows="3" oninput="renderTicketPreview()">Clica no botão abaixo para abrir um ticket de suporte.
A nossa equipa irá responder o mais brevemente possível!</textarea>
          </div>

          <div class="form-group">
            <label>👁️ Pré-visualização (como vai aparecer no Discord)</label>
            <div class="discord-preview">
              <div class="discord-preview-msgrow">
                <div class="discord-preview-avatar">🤖</div>
                <div style="flex:1;min-width:0">
                  <div class="discord-preview-username">${(guild.name || 'Bot').replace(/[<>&]/g, '')} <span class="discord-preview-bottag">BOT</span></div>
                  <div id="discord-preview-embed" class="discord-preview-embed"></div>
                  <div id="discord-preview-components" style="margin-top:8px"></div>
                </div>
              </div>
            </div>
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
              <thead><tr><th>Nome</th><th>Título</th><th>Comando slash (só admins, só neste servidor)</th><th>Enviar uma vez</th><th>Envio automático (intervalo)</th><th>Envio diário (horas fixas)</th><th></th></tr></thead>
              <tbody>
                ${savedEmbeds.map(e => {
      let embedData = {};
      try {
        embedData = JSON.parse(e.data);
      } catch (_) {}
      const titulo = embedData.title || '—';
      const canalAtual = channels.find(c => c.id === e.schedule_channel);
      const statusAuto = e.schedule_active ? `<span style="color:var(--success, #3ba55c)">🟢 ${e.schedule_quantity || 1}x a cada ${e.schedule_interval_minutes} min em #${canalAtual ? canalAtual.name : '?'}</span>` : `<span style="color:var(--text2)">⚪ Desligado</span>`;
      const canalDiario = channels.find(c => c.id === e.schedule_daily_channel);
      const horariosAtuais = (e.schedule_daily_times || '').split(',').filter(Boolean);
      const statusDiario = e.schedule_daily_active ? `<span style="color:var(--success, #3ba55c)">🟢 ${horariosAtuais.join(', ')} em #${canalDiario ? canalDiario.name : '?'}</span>` : `<span style="color:var(--text2)">⚪ Desligado</span>`;
      return `
                  <tr>
                    <td>${e.name}</td>
                    <td>${titulo}</td>
                    <td>
                      ${e.trigger_command ? `<div style="margin-bottom:4px"><span style="color:var(--success, #3ba55c)">🟢 <code>/${e.trigger_command}</code></span></div>
                           <button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="removerComandoEmbed('${guild.id}', ${e.id})">🗑️ Remover comando</button>` : `<input type="text" id="embed-cmd-${e.id}" placeholder="ex: abrirservidor" style="width:110px;display:inline-block;padding:4px 8px;font-size:0.8rem">
                           <button type="button" class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem" onclick="configurarComandoEmbed('${guild.id}', ${e.id})" title="Cria um comando slash (/comando) visível só a Administradores, só neste servidor">💾</button>`}
                    </td>
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
                        ${[0, 1, 2, 3, 4].map(i => `<input type="time" id="embed-daily-time-${e.id}-${i}" value="${horariosAtuais[i] || ''}" style="padding:4px 6px;font-size:0.8rem;width:100px">`).join('')}
                      </div>
                      <span style="font-size:0.7rem;color:var(--text2)">Até 5 horários, enviado todos os dias</span><br>
                      <button type="button" class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem;margin-top:4px" onclick="agendarEmbedHorasFixas('${guild.id}', ${e.id})" title="Ativar envio diário a horas fixas">▶️</button>
                      ${e.schedule_daily_active ? `<button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="pararAgendamentoEmbedHorasFixas('${guild.id}', ${e.id})" title="Parar envio diário">⏹️</button>` : ''}
                    </td>
                    <td>
                      <button type="button" class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem" data-embed="${escHtml(JSON.stringify({
        id: e.id,
        name: e.name,
        image_pos: 'bottom',
        ...embedData
      }))}" onclick="abrirEditarEmbed(JSON.parse(this.getAttribute('data-embed')))" title="Editar esta embed">✏️</button>
                      <button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="removeEmbed('${guild.id}', ${e.id})">🗑️</button>
                    </td>
                  </tr>
                `;
    }).join('')}
              </tbody>
            </table>
          ` : `<p style="color:var(--text2)">Nenhum embed guardado ainda.</p>`}
        </div>
      </div>

      <!-- Modal de edição de embed guardada (estilo Sapphire: Edit/Preview + Visual/Raw/Variables) -->
      <div id="editar-embed-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;align-items:center;justify-content:center">
        <div class="card sap-editor" style="max-width:920px;width:94%;max-height:90vh;overflow:hidden;padding:0;display:flex;flex-direction:column">

          <!-- Cabeçalho: Edit / Preview -->
          <div class="sap-toppanel">
            <button type="button" class="sap-toptab active" id="sap-toptab-edit" onclick="sapSwitchTop('edit')">Edit</button>
            <button type="button" class="sap-toptab" id="sap-toptab-preview" onclick="sapSwitchTop('preview')">Preview</button>
            <button type="button" class="sap-close" onclick="fecharEditarEmbed()">✕</button>
          </div>

          <input type="hidden" id="editar-embed-id">

          <!-- Painel EDIT -->
          <div id="sap-panel-edit" class="sap-panel">
            <div class="sap-subtabs">
              <button type="button" class="sap-subtab active" onclick="sapSwitchSub('visual', this)">Visual</button>
              <button type="button" class="sap-subtab" onclick="sapSwitchSub('raw', this)">Raw</button>
              <button type="button" class="sap-subtab" onclick="sapSwitchSub('variables', this)">Variables</button>
            </div>

            <!-- VISUAL — WYSIWYG: clica diretamente em cima do texto/preview para editar (estilo Sapphire) -->
            <div id="sap-sub-visual" class="sap-subpanel" style="display:block">
              <div style="padding:18px 22px;overflow:auto;max-height:60vh">
                <h3 style="margin:0 0 12px;font-size:1rem">✏️ Editar Embed: <span id="editar-embed-nome" style="color:var(--accent)"></span></h3>

                <!-- Mensagem fora do embed -->
                <div id="editar-embed-mensagem" class="wys-editable wysiwyg-content" contenteditable="true"
                     data-placeholder="Mensagem fora da embed (opcional, ex: \${usermention} bem-vindo)" oninput="atualizarPreviewEmbedGenerico()"></div>

                <!-- Bloco do embed em si, editável diretamente -->
                <div class="wysiwyg-embed">
                  <div class="wysiwyg-embed-colorbar" id="wys-colorbar" onclick="document.getElementById('editar-embed-cor').click()" title="Clica para mudar a cor da embed"></div>
                  <input type="color" id="editar-embed-cor" value="#5865F2" style="position:absolute;width:0;height:0;opacity:0;pointer-events:none" oninput="atualizarPreviewEmbedGenerico()">

                  <div class="wysiwyg-embed-body">
                    <div class="wys-row">
                      <img id="wys-author-icon-preview" class="wys-author-icon" style="display:none" onclick="editarUrlCampo('editar-embed-autor-icon','Ícone do autor (URL da imagem)')">
                      <span class="wys-icon-btn" onclick="editarUrlCampo('editar-embed-autor-icon','Ícone do autor (URL da imagem)')" title="Ícone do autor">🖼️</span>
                      <div id="editar-embed-autor-nome" class="wys-editable wys-author" contenteditable="true" data-placeholder="Nome do autor (opcional)" oninput="atualizarPreviewEmbedGenerico()"></div>
                    </div>

                    <div class="wys-row">
                      <span class="wys-icon-btn" id="wys-link-btn" onclick="editarUrlCampo('editar-embed-url','Link do título (URL)')" title="Link do título">🔗</span>
                      <div id="editar-embed-titulo" class="wys-editable wys-title" contenteditable="true" maxlength="256" data-placeholder="Título" oninput="atualizarPreviewEmbedGenerico()"></div>
                    </div>

                    <div id="editar-embed-descricao" class="wys-editable wys-desc" contenteditable="true" data-placeholder="Descrição" oninput="atualizarPreviewEmbedGenerico()"></div>

                    <div class="wys-image-wrap" id="wys-image-wrap">
                      <img id="wys-image-preview" style="display:none" onclick="editarUrlCampo('editar-embed-imagem','URL da imagem')">
                      <div id="wys-image-placeholder" class="wys-image-placeholder" onclick="editarUrlCampo('editar-embed-imagem','URL da imagem')">🖼️ Clica para adicionar imagem (banner)</div>
                      <button type="button" class="wys-remove-btn" id="wys-image-remove" style="display:none" onclick="event.stopPropagation();removerCampoEmbed('editar-embed-imagem')" title="Remover imagem">✕</button>
                    </div>

                    <div id="editar-embed-footer" class="wys-editable wys-footer" contenteditable="true" data-placeholder="Rodapé (opcional)" oninput="atualizarPreviewEmbedGenerico()"></div>
                  </div>

                  <div class="wys-thumb-wrap" id="wys-thumb-wrap">
                    <img id="wys-thumb-preview" style="display:none" onclick="editarUrlCampo('editar-embed-thumbnail','URL da thumbnail')">
                    <div id="wys-thumb-placeholder" class="wys-thumb-placeholder" onclick="editarUrlCampo('editar-embed-thumbnail','URL da thumbnail')" title="Clica para adicionar thumbnail">🖼️</div>
                    <button type="button" class="wys-remove-btn" id="wys-thumb-remove" style="display:none" onclick="event.stopPropagation();removerCampoEmbed('editar-embed-thumbnail')" title="Remover thumbnail">✕</button>
                  </div>
                </div>

                <div class="form-group" style="margin-top:14px">
                  <label style="font-size:0.78rem">Posição da imagem principal</label>
                  <select id="editar-embed-image-pos" onchange="atualizarPreviewEmbedGenerico()" style="max-width:260px">
                    <option value="bottom">Banner em baixo</option>
                    <option value="thumbnail">Miniatura à direita</option>
                    <option value="none">Sem imagem</option>
                  </select>
                </div>

                <!-- Guardam os valores não-texto (URLs, definidos pelos ícones acima) -->
                <input type="hidden" id="editar-embed-url" value="">
                <input type="hidden" id="editar-embed-autor-icon" value="">
                <input type="hidden" id="editar-embed-imagem" value="">
                <input type="hidden" id="editar-embed-thumbnail" value="">
              </div>
            </div>

            <!-- RAW -->
            <div id="sap-sub-raw" class="sap-subpanel" style="display:none">
              <div style="padding:18px 22px">
                <p style="color:var(--text2);font-size:0.85rem;margin-bottom:10px">
                  JSON em bruto do embed. Edita e clica em "Aplicar JSON" para atualizar o formulário Visual.
                </p>
                <textarea id="editar-embed-raw" rows="16" style="font-family:'Cascadia Code',Consolas,monospace;font-size:0.82rem;white-space:pre"></textarea>
                <button type="button" class="btn btn-secondary" style="margin-top:10px" onclick="aplicarRawEmbed()">Aplicar JSON</button>
              </div>
            </div>

            <!-- VARIABLES -->
            <div id="sap-sub-variables" class="sap-subpanel" style="display:none">
              <div style="padding:18px 22px">
                <p style="color:var(--text2);font-size:0.85rem;margin-bottom:14px">
                  Variáveis que podes usar no título, descrição, rodapé e mensagem fora do embed:
                </p>
                <table class="table">
                  <thead><tr><th>Variável</th><th>Descrição</th></tr></thead>
                  <tbody>
                    <tr><td><code>\${usermention}</code></td><td>Menciona o utilizador (@utilizador)</td></tr>
                    <tr><td><code>\${username}</code></td><td>Nome de utilizador</td></tr>
                    <tr><td><code>\${guildname}</code></td><td>Nome do servidor</td></tr>
                    <tr><td><code>\${membercount}</code></td><td>Número de membros do servidor</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Painel PREVIEW -->
          <div id="sap-panel-preview" class="sap-panel" style="display:none">
            <div style="padding:18px 22px;overflow:auto;max-height:60vh">
              <label style="display:block;margin-bottom:10px;color:var(--text2);font-size:0.85rem;font-weight:600">👁️ PREVIEW AO VIVO</label>
              <div id="editar-embed-preview-box" style="background:#313338;border-radius:8px;padding:16px;min-height:120px;font-family:'gg sans',Whitney,Helvetica,Arial,sans-serif">
                <p style="color:#949ba4;font-size:0.85rem">A carregar preview...</p>
              </div>
            </div>
          </div>

          <div class="sap-footer">
            <button type="button" class="btn btn-danger" onclick="fecharEditarEmbed()">Cancelar</button>
            <button type="button" class="btn btn-primary" onclick="guardarEdicaoEmbed('${guild.id}')">💾 Guardar Alterações</button>
          </div>
        </div>
      </div>
    </div>

    <!-- BOAS-VINDAS -->
    <div id="welcome" class="section" style="display:none">
      <div class="section-title"><span>👋</span> Boas-vindas & AutoRole</div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <p style="color:var(--text2);font-size:0.85rem;margin:0">
            Cria quantas mensagens de boas-vindas quiseres. Só uma pode estar <b>ativa</b> de cada vez — é essa que é enviada quando alguém entra no servidor.
          </p>
          <button type="button" class="btn btn-primary" onclick="abrirModalWelcome('${guild.id}')" style="white-space:nowrap;margin-left:14px">➕ Criar nova</button>
        </div>
        <div id="welcome-messages-list">
          <p style="color:var(--text2);font-size:0.85rem">A carregar...</p>
        </div>
      </div>
    </div>

    <!-- MODAL: CRIAR/EDITAR MENSAGEM DE BOAS-VINDAS -->
    <div id="modal-welcome" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;align-items:center;justify-content:center">
      <div class="card" style="max-width:960px;width:95%;max-height:90vh;overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 id="modal-welcome-titulo" style="margin:0">➕ Nova Mensagem de Boas-vindas</h3>
          <button type="button" class="btn" onclick="fecharModalWelcome()" style="padding:4px 10px">✖</button>
        </div>

        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:14px">
          Variáveis disponíveis: <code>\${usermention}</code> <code>\${username}</code> <code>\${guildname}</code> <code>\${membercount}</code>
          &nbsp;(também aceita o formato antigo <code>{user}</code> <code>{server}</code> <code>{count}</code>)
        </p>

        <form id="form-welcome" oninput="atualizarPreviewWelcome('${guild.id}')" onchange="atualizarPreviewWelcome('${guild.id}')">
          <input type="hidden" name="id" id="welcome_id" value="">

          <div class="form-group">
            <label>Nome interno (só para te ajudar a identificar na lista)</label>
            <input type="text" name="name" id="welcome_name" placeholder="Ex: Boas-vindas Nova Lisboa RP" required>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>Canal de Boas-vindas</label>
              ${makeSelect('welcome_channel', channels, null, 'Canal')}
            </div>
            <div class="form-group">
              <label>AutoRole (Cargo automático)</label>
              ${makeSelect('autorole', roles, null, 'Nenhum')}
            </div>
          </div>

          <div class="form-group">
            <label class="toggle">
              <input type="checkbox" name="welcome_embed" id="welcome_embed" value="1" checked>
              <span>Usar Embed nas boas-vindas</span>
            </label>
          </div>

          <div class="form-group">
            <label>Mensagem fora da Embed (opcional — ex: menção a chamar atenção)</label>
            <input type="text" name="welcome_content" id="welcome_content" placeholder="Bem-Vindo \${usermention} à **\${guildname}**!">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:10px">
            <!-- COLUNA ESQUERDA: EDITOR -->
            <div>
              <div class="form-group">
                <label>Nome do Autor (linha pequena acima do título, opcional)</label>
                <input type="text" name="welcome_author_name" id="welcome_author_name" placeholder="Ex: ${CONFIG.BOT_NAME}">
              </div>
              <div class="form-group">
                <label>Ícone do Autor (URL, opcional)</label>
                <input type="text" name="welcome_author_icon" id="welcome_author_icon" placeholder="https://...">
              </div>
              <div class="form-group">
                <label>Título da Embed</label>
                <input type="text" name="welcome_title" id="welcome_title" placeholder="Ex: 🔥 Bem-vindo(a) a \${guildname}!">
              </div>
              <div class="form-group">
                <label>Link do Título (opcional)</label>
                <input type="text" name="welcome_url" id="welcome_url" placeholder="https://...">
              </div>
              <div class="form-group">
                <label>Descrição</label>
                <textarea name="welcome_msg" id="welcome_msg" rows="5">Bem-vindo(a) \${usermention} ao \${guildname}!</textarea>
              </div>
              <div class="form-group">
                <label>Cor da barra lateral</label>
                <input type="color" name="welcome_color" id="welcome_color" value="#5865F2" style="width:60px;height:38px;padding:2px;cursor:pointer">
              </div>
              <div class="form-group">
                <label>Imagem pequena (thumbnail, canto superior direito, opcional)</label>
                <input type="text" name="welcome_thumbnail" id="welcome_thumbnail" placeholder="https://exemplo.com/avatar.png">
              </div>
              <div class="form-group">
                <label>Imagem grande (banner, em baixo da embed, opcional)</label>
                <input type="text" name="welcome_image" id="welcome_image" placeholder="https://exemplo.com/imagem.png">
              </div>
              <div class="form-group">
                <label>Rodapé (footer, opcional)</label>
                <input type="text" name="welcome_footer" id="welcome_footer" placeholder="Ex: Membro nº \${membercount}">
              </div>
              <button type="button" class="btn btn-primary" onclick="guardarWelcomeMessage('${guild.id}')">💾 Guardar</button>
            </div>

            <!-- COLUNA DIREITA: PREVIEW AO VIVO -->
            <div>
              <label style="display:block;margin-bottom:8px;color:var(--text2);font-size:0.85rem;font-weight:600">👁️ PREVIEW</label>
              <div id="welcome-preview-box" style="background:#313338;border-radius:8px;padding:16px;min-height:120px;font-family:'gg sans',Whitney,Helvetica,Arial,sans-serif">
                <p style="color:#949ba4;font-size:0.85rem">A carregar preview...</p>
              </div>
            </div>
          </div>
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
                ${['mute', 'kick', 'ban'].map(a => `<option value="${a}" ${antispam?.action === a ? 'selected' : ''}>${a.charAt(0).toUpperCase() + a.slice(1)}</option>`).join('')}
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
            <label class="toggle"><input type="checkbox" name="anti_links" value="1" ${antispam?.anti_links ? 'checked' : ''}><span>Bloquear Links Externos</span></label>
            <label class="toggle"><input type="checkbox" name="anti_invites" value="1" ${antispam?.anti_invites ? 'checked' : ''}><span>Bloquear Convites Discord</span></label>
            <label class="toggle"><input type="checkbox" name="anti_raid" value="1" ${antispam?.anti_raid ? 'checked' : ''}><span>Proteção Anti-Raid</span></label>
            <label class="toggle"><input type="checkbox" name="anti_bot_add" value="1" ${antispam?.anti_bot_add ? 'checked' : ''}><span>Banir quem adicionar bots sem ser Admin</span></label>
          </div>
          <div class="form-group">
            <label>Canal-Armadilha (quem escrever aqui é banido automaticamente)</label>
            ${makeSelect('trap_channel', channels, antispam?.trap_channel, 'Canal')}
          </div>
          <button type="button" class="btn btn-primary" onclick="saveConfig('${guild.id}','antispam-config','form-antispam')">💾 Guardar</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>📌 Canais onde o Anti-Links/Anti-Convites se aplica</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Por defeito, "Bloquear Links Externos" e "Bloquear Convites Discord" aplicam-se a <strong>todos os canais</strong>. Aqui podes escolher aplicar só a canais específicos (podes escolher 1, vários, ou quase todos — o máximo que quiseres).
        </p>
        <div class="form-group" style="margin-bottom:12px">
          <label class="toggle">
            <input type="radio" name="link_channel_mode" value="all" ${!antispam?.link_invite_channels || JSON.parse(antispam?.link_invite_channels || '[]').length === 0 ? 'checked' : ''} onchange="toggleLinkChannelMode()">
            <span>Aplicar a <strong>todos os canais</strong></span>
          </label>
          <label class="toggle">
            <input type="radio" name="link_channel_mode" value="specific" ${antispam?.link_invite_channels && JSON.parse(antispam?.link_invite_channels || '[]').length > 0 ? 'checked' : ''} onchange="toggleLinkChannelMode()">
            <span>Aplicar apenas a <strong>canais específicos</strong></span>
          </label>
        </div>
        <div id="link-channels-picker" style="display:${antispam?.link_invite_channels && JSON.parse(antispam?.link_invite_channels || '[]').length > 0 ? 'block' : 'none'};margin-bottom:12px">
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button type="button" class="btn btn-secondary" style="padding:6px 12px" onclick="selecionarTodosCanaisLink(true)">☑️ Selecionar Todos</button>
            <button type="button" class="btn btn-secondary" style="padding:6px 12px" onclick="selecionarTodosCanaisLink(false)">⬜ Limpar Seleção</button>
          </div>
          <div id="link-channels-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;max-height:260px;overflow-y:auto;padding:10px;border:1px solid var(--border);border-radius:8px">
            ${(() => {
      try {
        return channels || [];
      } catch (_) {
        return [];
      }
    })().map(ch => {
      const selecionados = (() => {
        try {
          return JSON.parse(antispam?.link_invite_channels || '[]');
        } catch (_) {
          return [];
        }
      })();
      return `<label class="toggle" style="font-size:0.85rem">
                <input type="checkbox" class="link-channel-checkbox" value="${ch.id}" ${selecionados.includes(ch.id) ? 'checked' : ''}>
                <span>#${ch.name}</span>
              </label>`;
    }).join('')}
          </div>
        </div>
        <button type="button" class="btn btn-primary" onclick="saveLinkInviteChannels('${guild.id}')">💾 Guardar Canais</button>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🚫 Canais onde o Anti-Links/Anti-Convites NÃO deve funcionar</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Marca aqui os canais onde queres que links e convites do Discord sejam sempre permitidos — por exemplo um canal de divulgação ou parcerias. Estes canais ficam isentos mesmo que acima esteja escolhido "todos os canais".
        </p>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button type="button" class="btn btn-secondary" style="padding:6px 12px" onclick="selecionarTodosCanaisLinkExcluidos(true)">☑️ Selecionar Todos</button>
          <button type="button" class="btn btn-secondary" style="padding:6px 12px" onclick="selecionarTodosCanaisLinkExcluidos(false)">⬜ Limpar Seleção</button>
        </div>
        <div id="link-excluded-channels-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;max-height:260px;overflow-y:auto;padding:10px;border:1px solid var(--border);border-radius:8px">
          ${(() => {
      try {
        return channels || [];
      } catch (_) {
        return [];
      }
    })().map(ch => {
      const excluidos = (() => {
        try {
          return JSON.parse(antispam?.link_invite_excluded_channels || '[]');
        } catch (_) {
          return [];
        }
      })();
      return `<label class="toggle" style="font-size:0.85rem">
              <input type="checkbox" class="link-excluded-channel-checkbox" value="${ch.id}" ${excluidos.includes(ch.id) ? 'checked' : ''}>
              <span>#${ch.name}</span>
            </label>`;
    }).join('')}
        </div>
        <button type="button" class="btn btn-primary" style="margin-top:12px" onclick="saveLinkInviteExcludedChannels('${guild.id}')">💾 Guardar Exceções</button>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>🚫 Palavras Bloqueadas</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Define palavras ou expressões específicas que, ao aparecerem numa mensagem, fazem o bot apagá-la automaticamente.
        </p>
        <div id="blocked-words-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
          ${(() => {
      try {
        return JSON.parse(antispam?.blocked_words || '[]');
      } catch (_) {
        return [];
      }
    })().map(p => `
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" class="blocked-word-input" value="${p.replace(/"/g, '&quot;')}" style="flex:1">
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
          ${(() => {
      try {
        return JSON.parse(antispam?.blocked_links || '[]');
      } catch (_) {
        return [];
      }
    })().map(l => `
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" class="blocked-link-input" value="${l.replace(/"/g, '&quot;')}" style="flex:1">
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
      ${!guildConfig?.log_channel && !guildConfig?.mod_log ? `
        <div class="card" style="border:1px solid var(--accent);background:rgba(88,101,242,0.08)">
          <h2 style="margin-top:0">🪧 Ainda não tens nenhum canal de logs</h2>
          <p style="color:var(--text2);font-size:0.9rem;margin-bottom:16px">
            Posso criar automaticamente uma categoria chamada <strong>Logs</strong> com os canais <strong>📜│logs</strong> e <strong>📜│mod-logs</strong> — visíveis só para Administradores.
          </p>
          <button type="button" class="btn btn-primary" onclick="criarCanaisDeLogs('${guild.id}')">🪧 Criar categoria e canais de logs</button>
        </div>
      ` : ''}
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
            <strong>ℹ️ Escolhe abaixo o que cada canal deve receber.</strong> Por exemplo, no Mod Log podes escolher só "Moderação" (bans, kicks, warns, timeouts, blacklist), e nos Logs Gerais escolher o resto (entradas/saídas, mensagens, cargos, canais, voz).
          </div>
          ${(() => {
      const logTypesAtual = (() => {
        try {
          const p = JSON.parse(guildConfig?.log_types);
          return Array.isArray(p) ? p : null;
        } catch (_) {
          return null;
        }
      })();
      const modLogTypesAtual = (() => {
        try {
          const p = JSON.parse(guildConfig?.mod_log_types);
          return Array.isArray(p) ? p : null;
        } catch (_) {
          return null;
        }
      })();

      // Comportamento por omissão (nunca configurado): log geral = tudo exceto mensagens enviadas; mod log = tudo
      const logTypesDefault = LOG_TYPES_DEFAULT.filter(t => t !== 'message_sent');
      const modLogTypesDefault = LOG_TYPES_DEFAULT;
      const ativosLog = logTypesAtual !== null ? logTypesAtual : logTypesDefault;
      const ativosModLog = modLogTypesAtual !== null ? modLogTypesAtual : modLogTypesDefault;

      // Agrupa tipos por categoria, preservando ordem de definição
      const categorias = {};
      for (const [key, info] of Object.entries(LOG_TYPES)) {
        if (!categorias[info.categoria]) categorias[info.categoria] = [];
        categorias[info.categoria].push({
          key,
          label: info.label
        });
      }
      const renderColuna = (fieldName, ativos) => `
              <div style="flex:1;min-width:260px">
                ${Object.entries(categorias).map(([cat, itens]) => `
                  <div style="margin-bottom:14px">
                    <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text2);margin-bottom:6px">${cat}</div>
                    ${itens.map(it => `
                      <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.88rem;cursor:pointer">
                        <input type="checkbox" name="${fieldName}" value="${it.key}" ${ativos.includes(it.key) ? 'checked' : ''}>
                        ${it.label}
                      </label>
                    `).join('')}
                  </div>
                `).join('')}
              </div>
            `;
      return `
              <div style="margin-top:16px;display:flex;gap:24px;flex-wrap:wrap">
                <div style="flex:1;min-width:260px">
                  <div style="font-weight:600;margin-bottom:8px">📋 Logs Gerais — tipos a enviar</div>
                  ${renderColuna('log_types', ativosLog)}
                </div>
                <div style="flex:1;min-width:260px">
                  <div style="font-weight:600;margin-bottom:8px">🛡️ Mod Log — tipos a enviar</div>
                  ${renderColuna('mod_log_types', ativosModLog)}
                </div>
              </div>
            `;
    })()}
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
        <h2>➕ Criar Tipo de Sugestão</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Cada tipo de sugestão tem o <strong>seu próprio canal</strong> — não é um canal partilhado por todas.
          Por exemplo, podes criar um tipo "Sugestão" com canal #sugestoes e outro tipo "Sugestão de Construção" com canal #sugestoes-construcao, cada um publicado e registado separadamente.
          Quem usar <code>/sugerir</code> escolhe o tipo antes de escrever, e a sugestão vai parar ao canal desse tipo.
        </p>
        <form id="form-sugestao-tipo-criar">
          <div class="grid-2">
            <div class="form-group">
              <label>Nome do tipo</label>
              <input type="text" name="name" placeholder="Ex: Sugestão de Construção" required maxlength="80">
            </div>
            <div class="form-group">
              <label>Emoji (opcional)</label>
              <input type="text" name="emoji" placeholder="🏗️" maxlength="10">
            </div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Canal onde ESTE tipo é publicado</label>
              ${makeSelect('channel_id', channels, null, 'Canal')}
            </div>
            <div class="form-group">
              <label>Canal de Log deste tipo (opcional)</label>
              ${makeSelect('log_channel', channels, null, 'Canal')}
            </div>
          </div>
          <div class="form-group">
            <label>Cargo a Mencionar (opcional)</label>
            ${makeSelect('ping_role', roles, null, 'Nenhum')}
          </div>
          <button type="button" class="btn btn-primary" onclick="criarSugestaoTipo('${guild.id}')">➕ Criar Tipo</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>⚙️ Tipos Configurados</h2>
        <div id="sugestao-tipos-table"><p style="color:var(--text2)">A carregar...</p></div>
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
          <div class="form-group">
            <label>Mensagem fora da embed <span style="color:var(--text2);font-weight:normal">(opcional)</span></label>
            <input type="text" name="mensagem_extra" id="pergunta-mensagem-extra" maxlength="1000" placeholder="Ex: @everyone, avisa a comunidade, etc. — aparece por cima da embed">
          </div>
          <button type="button" class="btn btn-primary" onclick="enviarPerguntaDashboard('${guild.id}')">📤 Enviar Pergunta</button>
        </form>
      </div>

      <div class="card" style="margin-top:20px">
        <h2>📜 Histórico</h2>
        <div id="perguntas-historico">${renderPerguntasHistorico(perguntas, channels, guild.id)}</div>
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
                  <div style="font-size:0.75rem;color:var(--text2);margin-bottom:4px">Canal: ${channels.find(c => c.id === p.channel_id)?.name ? '#' + channels.find(c => c.id === p.channel_id).name : p.channel_id}</div>
                  <div style="white-space:pre-wrap;font-size:0.9rem;margin-bottom:8px">${(p.conteudo || '').replace(/</g, '&lt;')}</div>
                </div>
                <button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem;flex-shrink:0" onclick="removeReactionRole('${guild.id}', '${p.message_id}')">🗑️ Remover</button>
              </div>
              <table class="data-table" style="margin-top:6px">
                <thead><tr><th>Emoji</th><th>Cargo</th></tr></thead>
                <tbody>
                  ${(p.itens || []).map(rr => `
                    <tr>
                      <td>${rr.emoji}</td>
                      <td>${roles.find(r => r.id === rr.role_id)?.name || rr.role_id}</td>
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
                    <td>${roles.find(x => x.id === r.gain_role_id)?.name || r.gain_role_id}</td>
                    <td>${roles.find(x => x.id === r.lose_role_id)?.name || r.lose_role_id}</td>
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
              <option value="recorrente" ${!votacaoConfig || votacaoConfig.tipo === 'recorrente' ? 'selected' : ''}>Recorrente (todos os dias)</option>
              <option value="unica" ${votacaoConfig?.tipo === 'unica' ? 'selected' : ''}>Um dia único (começa agora ao guardar)</option>
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
          <div class="grid-2" id="votacao-campos-recorrente" style="${votacaoConfig?.tipo === 'unica' ? 'display:none' : ''}">
            <div class="form-group">
              <label>Hora de Início (diária, HH:MM)</label>
              <input type="text" name="hora_inicio" value="${votacaoConfig?.hora_inicio || ''}" placeholder="Ex: 12:00">
            </div>
            <div class="form-group">
              <label>Hora de Fim (diária, HH:MM)</label>
              <input type="text" name="hora_fim_rec" value="${votacaoConfig?.tipo !== 'unica' ? votacaoConfig?.hora_fim || '' : ''}" placeholder="Ex: 20:30">
            </div>
          </div>
          <div class="grid-2" id="votacao-campos-unica" style="${votacaoConfig?.tipo === 'unica' ? '' : 'display:none'}">
            <div class="form-group">
              <label>Data de Fim</label>
              <input type="date" name="data_fim" value="${votacaoConfig?.data_fim || ''}">
            </div>
            <div class="form-group">
              <label>Hora de Fim (HH:MM)</label>
              <input type="text" name="hora_fim_unica" value="${votacaoConfig?.tipo === 'unica' ? votacaoConfig?.hora_fim || '' : ''}" placeholder="Ex: 20:30">
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

    <!-- GIVEAWAYS -->
    <div id="giveaways_tab" class="section" style="display:none">
      <div class="section-title"><span>🎉</span> Giveaways</div>

      <div class="card">
        <h2>➕ Criar Sorteio</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Também podes usar o comando <code>/giveaway-criar</code> no Discord. A cor da embed muda automaticamente:
          🟢 verde enquanto está ativo, 🔴 vermelho quando termina.
        </p>
        <form id="form-giveaway-criar">
          <div class="form-group">
            <label>Canal onde publicar</label>
            ${makeSelect('canal_id', channels, null, 'Canal')}
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Título da embed (opcional)</label>
              <input type="text" name="titulo" placeholder="🎉 SORTEIO 🎉" maxlength="200">
            </div>
            <div class="form-group">
              <label>Prémio</label>
              <input type="text" name="premio" placeholder="Ex: Nitro 1 mês" required maxlength="200">
            </div>
          </div>
          <div class="form-group">
            <label>Descrição (opcional)</label>
            <textarea name="descricao" rows="3" placeholder="Texto extra a mostrar na embed"></textarea>
          </div>
          <div class="form-group">
            <label>URL da Imagem (opcional)</label>
            <input type="text" name="imagem_url" placeholder="https://exemplo.com/imagem.png">
          </div>
          <div class="form-group">
            <label>Mensagem fora da embed (opcional)</label>
            <input type="text" name="mensagem_extra" placeholder="Ex: @everyone ou @nome-do-cargo">
            <small style="color:var(--text2)">Enviada como texto normal acima da embed, para poder marcar pessoas/cargos.</small>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Duração</label>
              <input type="text" name="duracao" placeholder="Ex: 1m, 10m, 2h, 1d" required>
            </div>
            <div class="form-group">
              <label>Número de Vencedores</label>
              <input type="number" name="vencedores" value="1" min="1" max="20">
            </div>
          </div>
          <button type="button" class="btn btn-primary" onclick="criarGiveaway('${guild.id}')">🎉 Criar Sorteio</button>
        </form>
      </div>

      <div class="card">
        <h2>📋 Sorteios</h2>
        <div id="giveaways-table"><p style="color:var(--text2)">A carregar...</p></div>
      </div>
    </div>

    <!-- PAINÉIS DE INFORMAÇÃO -->
    <div id="infopanels_tab" class="section" style="display:none">
      <div class="section-title"><span>🪧</span> Painéis de Informação</div>

      <div class="card">
        <h2>➕ Criar Painel</h2>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Cria um embed de informação (ex: "Bem-vindo ao Servidor") com título, imagens, dono, tempo de fundação, etc.
          O painel fica em <strong>rascunho</strong> — só é enviado para o Discord quando clicares em <strong>🚀 Publicar</strong> na tabela abaixo, depois de teres adicionado todos os botões. Assim a mensagem já nasce completa, sem aparecer "(editado)".
        </p>
        <form id="form-infopanel-criar">
          <div class="grid-2">
            <div class="form-group">
              <label>Nome interno (identificador, não aparece no Discord)</label>
              <input type="text" name="name" placeholder="Ex: bem-vindo" required maxlength="60">
            </div>
            <div class="form-group">
              <label>Canal onde publicar</label>
              ${makeSelect('channel_id', channels, null, 'Canal')}
            </div>
          </div>
          <div class="form-group">
            <label>Título</label>
            <input type="text" name="title" placeholder="🎉 Seja bem-vindo ao Nosso Servidor!" maxlength="256">
          </div>
          <div class="form-group">
            <label>Descrição</label>
            <textarea name="description" rows="4" placeholder="Texto principal do painel..."></textarea>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>URL do Banner (imagem grande)</label>
              <input type="text" name="banner_url" placeholder="https://exemplo.com/banner.png">
            </div>
            <div class="form-group">
              <label>URL da Thumbnail (imagem pequena)</label>
              <input type="text" name="thumbnail_url" placeholder="https://exemplo.com/icon.png">
            </div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Dono</label>
              <input type="text" name="owner_text" placeholder="@Léo">
            </div>
            <div class="form-group">
              <label>Fundado</label>
              <input type="text" name="founded_text" placeholder="há 7 anos">
            </div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Cor (hex)</label>
              <input type="color" name="color" value="#5865F2" style="height:42px">
            </div>
            <div class="form-group">
              <label>Rodapé (footer)</label>
              <input type="text" name="footer_text" placeholder="Texto opcional no rodapé">
            </div>
          </div>
          <button type="button" class="btn btn-primary" onclick="criarInfoPanel('${guild.id}')">🪧 Criar Painel</button>
        </form>
      </div>

      <div class="card">
        <h2>📋 Painéis Configurados</h2>
        <div id="infopanels-table"><p style="color:var(--text2)">A carregar...</p></div>
      </div>

      <div class="card" id="infopanel-buttons-card" style="display:none">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0">🔘 Botões do painel: <span id="infopanel-buttons-panel-name"></span></h2>
          <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:0.85rem" onclick="fecharBotoesInfoPanel()" title="Fechar">✕</button>
        </div>
        <p style="color:var(--text2);font-size:0.85rem;margin:12px 0 16px">
          Cada botão que adicionares fica guardado aqui. Quando alguém clicar no botão já publicado no Discord, só essa pessoa vê a "Resposta" (mensagem ephemeral).
          Não te esqueças de clicar em <strong>🚀 Publicar</strong> (ou 🔁 Republicar) na tabela de painéis depois de acabares de configurar os botões.
        </p>
        <div id="infopanel-buttons-list" style="margin-bottom:20px"></div>
        <form id="form-infopanel-botao-add">
          <input type="hidden" name="panel_id" id="infopanel-buttons-panel-id">
          <div class="grid-2">
            <div class="form-group">
              <label>Texto do botão</label>
              <input type="text" name="label" placeholder="Regras" required maxlength="80">
            </div>
            <div class="form-group">
              <label>Emoji (opcional)</label>
              <input type="text" name="emoji" placeholder="📜" maxlength="10">
            </div>
          </div>
          <div class="form-group">
            <label>Estilo do botão</label>
            <select name="style">
              <option value="Primary">🔵 Azul</option>
              <option value="Secondary">⚪ Cinza</option>
              <option value="Success">🟢 Verde</option>
              <option value="Danger">🔴 Vermelho</option>
            </select>
          </div>
          <div class="form-group">
            <label>Resposta (mostrada só a quem clicar)</label>
            <textarea name="response_text" rows="4" placeholder="Texto que aparece de forma privada para a pessoa..." required></textarea>
          </div>
          <p style="color:var(--text2);font-size:0.8rem;margin:4px 0 12px">Campos opcionais abaixo — se preencheres algum, a resposta aparece como um mini-embed (com título/imagem) em vez de só texto.</p>
          <div class="grid-2">
            <div class="form-group">
              <label>Título da resposta (opcional)</label>
              <input type="text" name="response_title" placeholder="Ex: 📜 Regras do Servidor" maxlength="256">
            </div>
            <div class="form-group">
              <label>Cor da resposta (opcional, hex)</label>
              <input type="text" name="response_color" placeholder="#5865F2" maxlength="7">
            </div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>URL de imagem grande na resposta (opcional)</label>
              <input type="text" name="response_image" placeholder="https://exemplo.com/imagem.png">
            </div>
            <div class="form-group">
              <label>URL de imagem pequena na resposta (opcional)</label>
              <input type="text" name="response_thumbnail" placeholder="https://exemplo.com/icon.png">
            </div>
          </div>
          <button type="button" class="btn btn-primary" onclick="addInfoPanelBotao('${guild.id}')">➕ Adicionar Botão</button>
        </form>
      </div>
    </div>

  </div><!-- /main-content -->

  <div class="toast" id="toast"></div>

  <script>
    const GUILD_ID = '${guild.id}';
    const ALL_ROLES = ${JSON.stringify(roles.map(r => ({
      id: r.id,
      name: r.name
    })))};
    window.BOT_NAME = ${JSON.stringify(client.user?.username || CONFIG.BOT_NAME || 'Bot')};
    window.BOT_AVATAR_URL = ${JSON.stringify(client.user?.displayAvatarURL?.() || CONFIG.BOT_AVATAR_URL || '')};
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
      if(id==='suggestions_tab') { loadSuggestions(); loadSugestaoTipos(); }
      if(id==='giveaways_tab') loadGiveaways();
      if(id==='infopanels_tab') loadInfoPanels();
    }

    // Atualiza uma secção do dashboard com dados frescos do servidor, sem
    // recarregar a página inteira: busca o HTML já renderizado no servidor
    // (mesma lógica que gera a página completa) e troca só o conteúdo
    // interno dessa <div class="section">. Preserva scroll e secção ativa.
    async function refreshSection(sectionId) {
      try {
        const res = await fetch('/api/' + GUILD_ID + '/section-html/' + sectionId);
        const json = await res.json();
        if (!json.ok) return false;
        const el = document.getElementById(sectionId);
        if (!el) return false;
        el.innerHTML = json.html;
        // Religa listeners de sub-abas (.tab), já que o HTML de dentro da
        // secção foi todo substituído e perdeu os event listeners antigos.
        if (typeof initTabs === 'function') initTabs();
        // Ressincroniza variáveis de estado em memória que dependem do HTML
        // que acabou de ser substituído (ex: currentPanelMode nos Tickets,
        // que só era lido do DOM uma vez, no carregamento inicial).
        if (sectionId === 'tickets' && document.getElementById('panel_mode_hidden')) {
          currentPanelMode = document.getElementById('panel_mode_hidden').value || 'select';
        }
        return true;
      } catch (e) {
        return false;
      }
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
        if (data.ok) refreshSection('overview');
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
        const html = sugs.length ? '<table class="table"><thead><tr><th>#</th><th>Tipo</th><th>Conteúdo</th><th>Utilizador</th><th>Estado</th><th>Votos</th></tr></thead><tbody>' +
          sugs.slice(0,15).map(s => '<tr><td>'+(s.guild_seq ?? s.id)+'</td><td>'+(s.type_emoji||'')+' '+(s.type_name||'<span style="color:var(--text2)">—</span>')+'</td><td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.content+'</td><td>'+s.user_id+'</td><td>'+statusMap[s.status]+'</td><td>👍 '+s.votes_up+' / 👎 '+s.votes_down+'</td></tr>').join('') +
          '</tbody></table>' : '<p style="color:var(--text2)">Sem sugestões ainda.</p>';
        document.getElementById('sugs-table').innerHTML = html;
      } catch(e) {}
    }

    async function loadSugestaoTipos() {
      try {
        const r = await fetch('/api/'+GUILD_ID+'/sugestao-tipos');
        const tipos = await r.json();
        const html = tipos.length ? '<table class="table"><thead><tr><th>Tipo</th><th>Canal</th><th>Log</th><th>Ping</th><th>Estado</th><th>Ações</th></tr></thead><tbody>' +
          tipos.map(t => '<tr>' +
            '<td>'+(t.emoji||'💡')+' '+t.name+'</td>' +
            '<td>'+(t.channel_name ? '#'+t.channel_name : '<span style="color:var(--text2)">—</span>')+'</td>' +
            '<td>'+(t.log_channel_name ? '#'+t.log_channel_name : '<span style="color:var(--text2)">—</span>')+'</td>' +
            '<td>'+(t.role_name ? '@'+t.role_name : '<span style="color:var(--text2)">—</span>')+'</td>' +
            '<td><span class="badge badge-'+(t.enabled?'green':'red')+'">'+(t.enabled?'Ativo':'Desativado')+'</span></td>' +
            '<td>' +
              '<button class="btn btn-secondary" style="padding:4px 10px;font-size:0.8rem" onclick="toggleSugestaoTipo(\\''+GUILD_ID+'\\','+t.id+')">🔁 '+(t.enabled?'Desativar':'Ativar')+'</button> ' +
              '<button class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="apagarSugestaoTipo(\\''+GUILD_ID+'\\','+t.id+')">🗑️</button>' +
            '</td>' +
          '</tr>').join('') +
          '</tbody></table>' : '<p style="color:var(--text2)">Nenhum tipo de sugestão criado ainda.</p>';
        document.getElementById('sugestao-tipos-table').innerHTML = html;
      } catch(e) {
        document.getElementById('sugestao-tipos-table').innerHTML = '<p style="color:var(--danger)">Erro ao carregar tipos</p>';
      }
    }

    async function criarSugestaoTipo(guildId) {
      const form = document.getElementById('form-sugestao-tipo-criar');
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      try {
        const r = await fetch('/api/'+guildId+'/sugestao-tipos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Criado!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) { form.reset(); loadSugestaoTipos(); }
      } catch (e) {
        toast('❌ Erro de ligação ao criar o tipo.', 'error');
      }
    }

    async function toggleSugestaoTipo(guildId, id) {
      try {
        const r = await fetch('/api/'+guildId+'/sugestao-tipos/'+id+'/toggle', { method: 'POST' });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Feito!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) loadSugestaoTipos();
      } catch(e) {
        toast('❌ Erro de ligação.', 'error');
      }
    }

    async function apagarSugestaoTipo(guildId, id) {
      if (!confirm('Apagar este tipo de sugestão? As sugestões já submetidas não são apagadas.')) return;
      try {
        const r = await fetch('/api/'+guildId+'/sugestao-tipos/'+id, { method: 'DELETE' });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Apagado!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) loadSugestaoTipos();
      } catch(e) {
        toast('❌ Erro de ligação.', 'error');
      }
    }

    async function loadGiveaways() {
      try {
        const r = await fetch('/api/'+GUILD_ID+'/giveaways');
        const gws = await r.json();
        const html = gws.length ? '<table class="table"><thead><tr><th>#</th><th>Prémio</th><th>Estado</th><th>Vencedores</th><th>Participantes</th><th>Ações</th></tr></thead><tbody>' +
          gws.map(g => {
            const estado = g.ended ? '🔴 Terminado' : '🟢 Ativo';
            const acoes = g.ended
              ? '<button class="btn btn-secondary" style="padding:4px 10px;font-size:0.8rem" onclick="giveawayAction(\\''+GUILD_ID+'\\','+g.id+',\\'reroll\\')">🔁 Reroll</button>'
              : '<button class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem" onclick="giveawayAction(\\''+GUILD_ID+'\\','+g.id+',\\'terminar\\')">🏁 Terminar</button> '+
                '<button class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="giveawayAction(\\''+GUILD_ID+'\\','+g.id+',\\'cancelar\\')">🗑️ Cancelar</button>';
            return '<tr><td>#'+g.id+'</td><td>'+g.premio+'</td><td>'+estado+'</td><td>'+g.vencedores+'</td><td>'+g.total_entradas+'</td><td>'+acoes+'</td></tr>';
          }).join('') +
          '</tbody></table>' : '<p style="color:var(--text2)">Nenhum sorteio ainda. Usa <code>/giveaway-criar</code> no Discord.</p>';
        document.getElementById('giveaways-table').innerHTML = html;
      } catch(e) {
        document.getElementById('giveaways-table').innerHTML = '<p style="color:var(--danger)">Erro ao carregar giveaways</p>';
      }
    }

    async function criarGiveaway(guildId) {
      const form = document.getElementById('form-giveaway-criar');
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      try {
        const r = await fetch('/api/'+guildId+'/giveaways', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Criado!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) { form.reset(); loadGiveaways(); }
      } catch (e) {
        toast('❌ Erro de ligação ao criar o sorteio.', 'error');
      }
    }

    async function giveawayAction(guildId, id, action) {
      const confirmMsgs = { terminar: 'Terminar este sorteio já e sortear vencedores?', reroll: 'Sortear novo(s) vencedor(es)?', cancelar: 'Cancelar este sorteio sem sortear vencedores?' };
      if (!confirm(confirmMsgs[action] || 'Confirmar ação?')) return;
      try {
        const r = await fetch('/api/'+guildId+'/giveaways/'+id+'/'+action, { method: 'POST' });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Feito!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) loadGiveaways();
      } catch(e) {
        toast('❌ Erro de ligação.', 'error');
      }
    }

    // ============================
    // PAINÉIS DE INFORMAÇÃO
    // ============================
    let currentInfoPanelId = null;

    async function loadInfoPanels() {
      try {
        const r = await fetch('/api/'+GUILD_ID+'/infopanels');
        const paineis = await r.json();
        const html = paineis.length ? '<table class="table"><thead><tr><th>Nome</th><th>Título</th><th>Canal</th><th>Estado</th><th>Botões</th><th>Ações</th></tr></thead><tbody>' +
          paineis.map(p => {
            const estadoBadge = p.published
              ? '<span class="badge badge-green">🟢 Publicado</span>'
              : '<span class="badge badge-yellow">🟡 Rascunho</span>';
            const nomeEscapado = p.name.replace(/'/g, "\\'");
            return '<tr>' +
              '<td>'+p.name+'</td>' +
              '<td>'+(p.title || '<span style="color:var(--text2)">—</span>')+'</td>' +
              '<td>'+(p.channel_id ? '#'+(p.channel_name||p.channel_id) : '<span style="color:var(--text2)">—</span>')+'</td>' +
              '<td>'+estadoBadge+'</td>' +
              '<td>'+p.button_count+'</td>' +
              '<td>' +
                '<button class="btn btn-secondary" style="padding:4px 10px;font-size:0.8rem" onclick="abrirBotoesInfoPanel('+p.id+',\\''+nomeEscapado+'\\')">🔘 Botões</button> ' +
                '<button class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem" onclick="publicarInfoPanel(\\''+GUILD_ID+'\\','+p.id+',\\''+nomeEscapado+'\\')" title="'+(p.published ? 'Republica com as alterações atuais' : 'Publica o painel no Discord')+'">'+(p.published ? '🔁 Republicar' : '🚀 Publicar')+'</button> ' +
                '<button class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="apagarInfoPanel(\\''+GUILD_ID+'\\','+p.id+')">🗑️ Apagar</button>' +
              '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>' : '<p style="color:var(--text2)">Nenhum painel criado ainda.</p>';
        document.getElementById('infopanels-table').innerHTML = html;
      } catch(e) {
        document.getElementById('infopanels-table').innerHTML = '<p style="color:var(--danger)">Erro ao carregar painéis</p>';
      }
    }

    async function publicarInfoPanel(guildId, id, panelName) {
      const msg = 'Publicar o painel "'+panelName+'" no Discord? Isto envia a mensagem já com todos os botões configurados (sem aparecer como editada).';
      if (!confirm(msg)) return;
      try {
        const r = await fetch('/api/'+guildId+'/infopanels/'+id+'/publish', { method: 'POST' });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Publicado!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) loadInfoPanels();
      } catch(e) {
        toast('❌ Erro de ligação ao publicar o painel.', 'error');
      }
    }

    async function criarInfoPanel(guildId) {
      const form = document.getElementById('form-infopanel-criar');
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      try {
        const r = await fetch('/api/'+guildId+'/infopanels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Criado!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) { form.reset(); loadInfoPanels(); }
      } catch (e) {
        toast('❌ Erro de ligação ao criar o painel.', 'error');
      }
    }

    async function apagarInfoPanel(guildId, id) {
      if (!confirm('Apagar este painel? A mensagem no Discord também será apagada.')) return;
      try {
        const r = await fetch('/api/'+guildId+'/infopanels/'+id, { method: 'DELETE' });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Apagado!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) { document.getElementById('infopanel-buttons-card').style.display='none'; loadInfoPanels(); }
      } catch(e) {
        toast('❌ Erro de ligação.', 'error');
      }
    }

    async function abrirBotoesInfoPanel(panelId, panelName) {
      const card = document.getElementById('infopanel-buttons-card');
      const jaAberta = card.style.display !== 'none';

      // Clicar em "Botões" no mesmo painel que já está aberto fecha a secção
      // (igual ao comportamento de "Perguntas" nos tipos de ticket).
      if (jaAberta && currentInfoPanelId === panelId) {
        card.style.display = 'none';
        currentInfoPanelId = null;
        return;
      }

      currentInfoPanelId = panelId;
      document.getElementById('infopanel-buttons-panel-id').value = panelId;
      document.getElementById('infopanel-buttons-panel-name').textContent = panelName;
      card.style.display = 'block';
      card.scrollIntoView({ behavior: 'smooth' });
      await loadInfoPanelBotoes(panelId);
    }

    function fecharBotoesInfoPanel() {
      document.getElementById('infopanel-buttons-card').style.display = 'none';
      currentInfoPanelId = null;
    }

    async function loadInfoPanelBotoes(panelId) {
      try {
        const r = await fetch('/api/'+GUILD_ID+'/infopanels/'+panelId+'/buttons');
        const botoes = await r.json();
        const html = botoes.length ? botoes.map(b =>
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">' +
            '<div><strong>'+(b.emoji||'')+' '+b.label+'</strong>'+(b.response_title || b.response_image || b.response_thumbnail ? ' <span class="badge badge-blue" style="font-size:0.7rem">embed</span>' : '')+'<br><span style="color:var(--text2);font-size:0.85rem">'+b.response_text.substring(0,80)+(b.response_text.length>80?'…':'')+'</span></div>' +
            '<button class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="apagarInfoPanelBotao(\\''+GUILD_ID+'\\','+panelId+','+b.id+')">🗑️</button>' +
          '</div>'
        ).join('') : '<p style="color:var(--text2)">Nenhum botão ainda.</p>';
        document.getElementById('infopanel-buttons-list').innerHTML = html;
      } catch(e) {}
    }

    async function addInfoPanelBotao(guildId) {
      const form = document.getElementById('form-infopanel-botao-add');
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      try {
        const r = await fetch('/api/'+guildId+'/infopanels/'+currentInfoPanelId+'/buttons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Adicionado!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) {
          form.reset();
          document.getElementById('infopanel-buttons-panel-id').value = currentInfoPanelId;
          loadInfoPanelBotoes(currentInfoPanelId);
          loadInfoPanels();
        }
      } catch(e) {
        toast('❌ Erro de ligação ao adicionar o botão.', 'error');
      }
    }

    async function apagarInfoPanelBotao(guildId, panelId, buttonId) {
      if (!confirm('Apagar este botão?')) return;
      try {
        const r = await fetch('/api/'+guildId+'/infopanels/'+panelId+'/buttons/'+buttonId, { method: 'DELETE' });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Apagado!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) { loadInfoPanelBotoes(panelId); loadInfoPanels(); }
      } catch(e) {
        toast('❌ Erro de ligação.', 'error');
      }
    }

    // ============================
    // PREVIEW AO VIVO DA EMBED DE BOAS-VINDAS (estilo Sapphire)
    // ============================
    let welcomePreviewTimer = null;
    function atualizarPreviewWelcome(guildId) {
      clearTimeout(welcomePreviewTimer);
      welcomePreviewTimer = setTimeout(() => enviarPreviewWelcome(guildId), 250);
    }

    async function enviarPreviewWelcome(guildId) {
      const form = document.getElementById('form-welcome');
      const box = document.getElementById('welcome-preview-box');
      if (!form || !box) return;
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      body.welcome_embed = document.getElementById('welcome_embed').checked ? '1' : '0';

      try {
        const r = await fetch('/api/'+guildId+'/welcome-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await r.json();
        if (!data.ok) { box.innerHTML = '<p style="color:#f23f42">'+ (data.message||'Erro ao gerar preview') +'</p>'; return; }
        box.innerHTML = renderizarPreviewEmbed(body, data.embed, body.welcome_embed === '1');
      } catch (e) {
        box.innerHTML = '<p style="color:#f23f42">Erro de ligação ao gerar preview.</p>';
      }
    }

    function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function renderizarPreviewEmbed(body, embed, usarEmbed) {
      // Cabeçalho estilo Discord: avatar + nome do bot + tag BOT, tal como no editor do Sapphire.
      const botAvatar = (window.BOT_AVATAR_URL || '');
      const botName = (window.BOT_NAME || 'Bot');
      let html = '<div style="display:flex;gap:12px;align-items:flex-start">';
      html += botAvatar
        ? '<img src="'+esc(botAvatar)+'" style="width:40px;height:40px;border-radius:50%;flex-shrink:0" onerror="this.style.display=\\'none\\'">'
        : '<div style="width:40px;height:40px;border-radius:50%;background:#5865F2;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.1rem">🤖</div>';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="margin-bottom:4px"><span style="color:#f2f3f5;font-weight:600;font-size:0.95rem">'+esc(botName)+'</span> <span style="background:#5865F2;color:#fff;font-size:0.6rem;font-weight:700;padding:1px 4px;border-radius:3px;vertical-align:middle;margin-left:2px">BOT</span></div>';

      // Mensagem fora da embed (aparece por cima, como uma mensagem normal do bot)
      if (body.welcome_content) {
        html += '<div style="color:#dbdee1;margin-bottom:6px;white-space:pre-wrap;font-size:0.95rem">'+esc(body.welcome_content)+'</div>';
      }

      if (!usarEmbed) {
        html += '<div style="color:#dbdee1;white-space:pre-wrap;font-size:0.95rem">'+esc(body.welcome_msg||'')+'</div>';
        html += '</div></div>';
        return html;
      }

      const cor = body.welcome_color || '#5865F2';

      html += '<div style="display:flex;border-left:4px solid '+cor+';border-radius:4px;background:#2b2d31;overflow:hidden;margin-top:2px">';
      html += '<div style="padding:12px 16px;flex:1;min-width:0">';

      // Author: nome pequeno acima do título, com ícone — usa o nome/ícone escolhido
      // ou, se vazio, o próprio bot (tal como no envio real)
      const autorNome = body.welcome_author_name || botName;
      const autorIcon = body.welcome_author_icon || botAvatar;
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;color:#f2f3f5;font-size:0.85rem;font-weight:600">';
      if (autorIcon) html += '<img src="'+esc(autorIcon)+'" style="width:20px;height:20px;border-radius:50%;object-fit:cover" onerror="this.style.display=\\'none\\'">';
      html += esc(autorNome) + '</div>';

      if (body.welcome_title) {
        html += '<div style="color:'+ (body.welcome_url ? '#00a8fc' : '#f2f3f5') +';font-weight:700;margin-bottom:6px">'+esc(body.welcome_title)+'</div>';
      }
      if (body.welcome_msg) {
        html += '<div style="color:#dbdee1;font-size:0.9rem;white-space:pre-wrap;line-height:1.4">'+esc(body.welcome_msg)+'</div>';
      }
      if (body.welcome_image) {
        html += '<img src="'+esc(body.welcome_image)+'" style="max-width:100%;border-radius:6px;margin-top:10px;display:block" onerror="this.style.display=\\'none\\'">';
      }
      if (body.welcome_footer) {
        html += '<div style="display:flex;align-items:center;gap:6px;color:#949ba4;font-size:0.75rem;margin-top:10px">';
        if (botAvatar) html += '<img src="'+esc(botAvatar)+'" style="width:16px;height:16px;border-radius:50%;object-fit:cover" onerror="this.style.display=\\'none\\'">';
        html += esc(body.welcome_footer) + '</div>';
      }
      html += '</div>';

      // Thumbnail: imagem pequena, sempre no canto superior direito da embed
      if (body.welcome_thumbnail) {
        html += '<div style="padding:12px 16px 12px 0;flex-shrink:0"><img src="'+esc(body.welcome_thumbnail)+'" style="width:80px;height:80px;border-radius:6px;object-fit:cover" onerror="this.style.display=\\'none\\'"></div>';
      }
      html += '</div>';
      html += '</div></div>';
      return html;
    }

    // ============================
    // LISTA + MODAL DE MENSAGENS DE BOAS-VINDAS (multi, nomeadas — estilo Sapphire)
    // ============================
    async function loadWelcomeMessages(guildId) {
      const box = document.getElementById('welcome-messages-list');
      if (!box) return;
      try {
        const r = await fetch('/api/'+guildId+'/welcome-messages');
        const lista = await r.json();
        if (!Array.isArray(lista) || !lista.length) {
          box.innerHTML = '<p style="color:var(--text2)">Nenhuma mensagem de boas-vindas criada ainda. Clica em "➕ Criar nova" para começar.</p>';
          return;
        }
        box.innerHTML = lista.map(w => \`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;background:var(--bg2)">
            <div>
              <div style="font-weight:600;display:flex;align-items:center;gap:8px">
                \${esc(w.name)}
                \${w.is_active ? '<span style="background:#57F287;color:#0a0a0a;font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:10px">ATIVA</span>' : ''}
              </div>
              <div style="color:var(--text2);font-size:0.8rem;margin-top:2px">
                \${w.channel_name ? '#'+esc(w.channel_name) : 'Sem canal definido'}
              </div>
            </div>
            <div style="display:flex;gap:6px">
              \${!w.is_active ? \`<button type="button" class="btn btn-primary" style="padding:4px 10px;font-size:0.8rem" onclick="ativarWelcomeMessage('\${guildId}', \${w.id})" title="Tornar ativa">✅ Ativar</button>\` : ''}
              <button type="button" class="btn" style="padding:4px 10px;font-size:0.8rem" onclick="abrirModalWelcome('\${guildId}', \${w.id})">✏️ Editar</button>
              <button type="button" class="btn btn-danger" style="padding:4px 10px;font-size:0.8rem" onclick="apagarWelcomeMessage('\${guildId}', \${w.id})">🗑️</button>
            </div>
          </div>
        \`).join('');
      } catch (e) {
        box.innerHTML = '<p style="color:#f23f42">Erro de ligação ao carregar as mensagens de boas-vindas.</p>';
      }
    }

    function limparFormWelcome() {
      const form = document.getElementById('form-welcome');
      if (form) form.reset();
      document.getElementById('welcome_id').value = '';
      document.getElementById('welcome_embed').checked = true;
      document.getElementById('welcome_color').value = '#5865F2';
      document.getElementById('welcome_msg').value = 'Bem-vindo(a) \${usermention} ao \${guildname}!';
    }

    async function abrirModalWelcome(guildId, id) {
      limparFormWelcome();
      const modal = document.getElementById('modal-welcome');
      const titulo = document.getElementById('modal-welcome-titulo');

      if (id) {
        titulo.textContent = '✏️ Editar Mensagem de Boas-vindas';
        try {
          const r = await fetch('/api/'+guildId+'/welcome-messages/'+id);
          const w = await r.json();
          if (w && w.id) {
            document.getElementById('welcome_id').value = w.id;
            document.getElementById('welcome_name').value = w.name || '';
            document.getElementById('welcome_content').value = w.welcome_content || '';
            document.getElementById('welcome_author_name').value = w.welcome_author_name || '';
            document.getElementById('welcome_author_icon').value = w.welcome_author_icon || '';
            document.getElementById('welcome_title').value = w.welcome_title || '';
            document.getElementById('welcome_url').value = w.welcome_url || '';
            document.getElementById('welcome_msg').value = w.welcome_msg || '';
            document.getElementById('welcome_color').value = w.welcome_color || '#5865F2';
            document.getElementById('welcome_image').value = w.welcome_image || '';
            document.getElementById('welcome_thumbnail').value = w.welcome_thumbnail || '';
            document.getElementById('welcome_footer').value = w.welcome_footer || '';
            document.getElementById('welcome_embed').checked = !!w.welcome_embed;
            const selCanal = document.querySelector('#form-welcome [name="welcome_channel"]');
            if (selCanal) selCanal.value = w.welcome_channel || '';
            const selRole = document.querySelector('#form-welcome [name="autorole"]');
            if (selRole) selRole.value = w.autorole || '';
          }
        } catch (e) {
          toast('❌ Erro ao carregar a mensagem de boas-vindas.', 'error');
        }
      } else {
        titulo.textContent = '➕ Nova Mensagem de Boas-vindas';
      }

      modal.style.display = 'flex';
      setTimeout(() => enviarPreviewWelcome(guildId), 50);
    }

    function fecharModalWelcome() {
      document.getElementById('modal-welcome').style.display = 'none';
    }

    async function guardarWelcomeMessage(guildId) {
      const form = document.getElementById('form-welcome');
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      body.welcome_embed = document.getElementById('welcome_embed').checked ? '1' : '0';

      const id = body.id;
      const url = id ? '/api/'+guildId+'/welcome-messages/'+id : '/api/'+guildId+'/welcome-messages';
      const method = id ? 'PUT' : 'POST';

      try {
        const r = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Guardado!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) {
          fecharModalWelcome();
          loadWelcomeMessages(guildId);
        }
      } catch (e) {
        toast('❌ Erro de ligação ao guardar.', 'error');
      }
    }

    async function ativarWelcomeMessage(guildId, id) {
      try {
        const r = await fetch('/api/'+guildId+'/welcome-messages/'+id+'/activate', { method: 'POST' });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Ativada!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) loadWelcomeMessages(guildId);
      } catch (e) {
        toast('❌ Erro de ligação.', 'error');
      }
    }

    async function apagarWelcomeMessage(guildId, id) {
      if (!confirm('Apagar esta mensagem de boas-vindas?')) return;
      try {
        const r = await fetch('/api/'+guildId+'/welcome-messages/'+id, { method: 'DELETE' });
        const data = await r.json();
        toast(data.message || (data.ok ? 'Apagada!' : 'Erro.'), data.ok ? 'success' : 'error');
        if (data.ok) loadWelcomeMessages(guildId);
      } catch (e) {
        toast('❌ Erro de ligação.', 'error');
      }
    }

    // Carrega a lista assim que a secção de boas-vindas é aberta
    const origShowSection = window.showSection;
    if (typeof origShowSection === 'function') {
      window.showSection = function(name) {
        origShowSection(name);
        if (name === 'welcome') loadWelcomeMessages(GUILD_ID);
      };
    }

    // Carrega dados iniciais, restaurando a ultima seccao visitada (se houver)
    restoreSection();
    if (document.getElementById('welcome') && document.getElementById('welcome').style.display !== 'none') {
      loadWelcomeMessages(GUILD_ID);
    }
  </script>
</body>
</html>`;
  }

  // ============================
  // INICIA O SERVIDOR WEB
  // ============================
  dbReadyPromise.then(() => {
    app.listen(CONFIG.DASHBOARD_PORT, () => {
      console.log(`\n🌐 Dashboard disponível em: http://localhost:${CONFIG.DASHBOARD_PORT}`);
    });
  });
} else {
  console.log('🌐 Dashboard web desativado (DASHBOARD_ATIVO=false) — a poupar RAM.');
}

// ============================
// INICIA O BOT DISCORD
// (só depois da base de dados Turso estar pronta)
// ============================
dbReadyPromise.then(() => client.login(CONFIG.TOKEN)).catch(err => {
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