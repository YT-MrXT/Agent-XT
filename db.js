'use strict';
// ============================================================
// Camada de ligação à base de dados — Turso (libSQL)
// Substitui o antigo better-sqlite3 (síncrono) por um cliente
// remoto assíncrono. Todas as queries passam a precisar de
// "await" nos pontos onde eram chamadas de forma síncrona.
//
// NOTA: já tentámos usar "embedded replicas" (cópia local que
// sincroniza com a Turso) para acelerar leituras, mas a Turso
// descontinuou esse protocolo de sync do lado do servidor —
// causava crash no arranque ("deprecated version of sync, that
// is not supported in this platform"). Revertido para ligação
// remota direta, que é estável. Se no futuro quiseres retomar
// a ideia de reduzir latência, o caminho correto agora é o
// pacote @tursodatabase/sync (substituto oficial), não o
// syncUrl do @libsql/client.
// ============================================================
const { createClient } = require('@libsql/client');

const url       = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('❌ Faltam TURSO_DATABASE_URL e/ou TURSO_AUTH_TOKEN nas variáveis de ambiente.');
  process.exit(1);
}

const client = createClient({ url, authToken });

/**
 * O Turso/libSQL pode devolver valores INTEGER (incluindo lastInsertRowid)
 * como BigInt em JavaScript. O JSON.stringify nativo do Node não sabe
 * serializar BigInt (rebenta com "Do not know how to serialize a BigInt"),
 * o que causava erro 500 no dashboard mesmo depois da gravação na BD ter
 * sido bem-sucedida. Esta função converte BigInt -> Number em qualquer
 * linha/resultado antes de chegar ao resto do código.
 */
function converterBigInt(valor) {
  if (typeof valor === 'bigint') {
    // Números de linha (rowid) nunca ultrapassam Number.MAX_SAFE_INTEGER
    // na prática, por isso a conversão é segura.
    return Number(valor);
  }
  if (Array.isArray(valor)) return valor.map(converterBigInt);
  if (valor && typeof valor === 'object') {
    const novo = {};
    for (const chave of Object.keys(valor)) novo[chave] = converterBigInt(valor[chave]);
    return novo;
  }
  return valor;
}

/**
 * Wrapper que imita a API do better-sqlite3 (prepare().get/.all/.run)
 * mas de forma assíncrona. Os "?" continuam a funcionar como placeholders.
 *
 * ANTES (better-sqlite3, síncrono):
 *   const row = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(id);
 *
 * DEPOIS (Turso, assíncrono):
 *   const row = await db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(id);
 */
function prepare(sql) {
  return {
    async get(...args) {
      const res = await client.execute({ sql, args });
      return converterBigInt(res.rows[0]) || undefined;
    },
    async all(...args) {
      const res = await client.execute({ sql, args });
      return converterBigInt(res.rows);
    },
    async run(...args) {
      const res = await client.execute({ sql, args });
      return { changes: Number(res.rowsAffected), lastInsertRowid: Number(res.lastInsertRowid) };
    }
  };
}

async function exec(sql) {
  // exec() do better-sqlite3 aceita múltiplas instruções separadas por ';'
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
}

function pragma() {
  // WAL / foreign_keys não se aplicam a uma BD remota — ignorado propositadamente.
}

/**
 * Substitui o db.transaction(fn) do better-sqlite3.
 * Não é uma transação atómica real (o Turso via HTTP não expõe isso da
 * mesma forma), mas garante que os passos correm em sequência e que
 * qualquer erro é propagado. Uso: const tx = db.transaction(fn); await tx(args);
 */
function transaction(fn) {
  return async (...args) => {
    return await fn(...args);
  };
}

module.exports = { client, prepare, exec, pragma, transaction };
