'use strict';
// ============================================================
// Camada de ligação à base de dados — Turso (libSQL)
// ============================================================
// EMBEDDED REPLICA: em vez de fazer um pedido de rede a cada query (ida e
// volta até à região onde a base primária está — Ohio, EUA), mantemos uma
// cópia local (ficheiro SQLite no disco do Render) que sincroniza com a
// Turso remota a cada poucos segundos. Isto torna as LEITURAS (SELECT)
// praticamente instantâneas (ficheiro local, sem latência de rede),
// enquanto as ESCRITAS (INSERT/UPDATE/DELETE) continuam a ir para a base
// primária e depois replicam de volta para a cópia local.
//
// Isto funciona no plano Free da Turso (ao contrário de réplicas
// geográficas geridas pelo servidor, que exigem plano pago) porque a
// sincronização acontece do lado da aplicação, não do lado da Turso.
//
// Nota sobre consistência: como a sincronização não é instantânea (ver
// EMBEDDED_REPLICA_SYNC_INTERVAL_SEGUNDOS abaixo), há uma janela muito
// curta em que uma escrita feita agora pode não aparecer ainda numa
// leitura imediatamente a seguir. Para o dashboard/bot isto raramente é
// um problema, mas fica documentado.
// ============================================================
const { createClient } = require('@libsql/client');
const path = require('path');

const url       = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('❌ Faltam TURSO_DATABASE_URL e/ou TURSO_AUTH_TOKEN nas variáveis de ambiente.');
  process.exit(1);
}

// Intervalo de sincronização da réplica local com a base primária remota.
// Pode ser ajustado via variável de ambiente sem precisar de alterar código.
const EMBEDDED_REPLICA_SYNC_INTERVAL_SEGUNDOS = Number(process.env.TURSO_SYNC_INTERVAL_SECONDS || 5);

// Caminho do ficheiro SQLite local (a réplica embutida). No Render, o disco
// é efémero entre deploys — isto é esperado: a réplica é reconstruída a
// partir da base primária no arranque, não é a "fonte da verdade".
const localReplicaPath = path.join(__dirname, 'local-replica.db');

const client = createClient({
  url: `file:${localReplicaPath}`,
  syncUrl: url,
  authToken,
  syncInterval: EMBEDDED_REPLICA_SYNC_INTERVAL_SEGUNDOS
});

// Promessa resolvida assim que a primeira sincronização completa (garante
// que a réplica local já tem os dados da base primária antes de o resto
// da aplicação começar a fazer queries).
const primeiraSincronizacaoPromise = client.sync()
  .then(() => console.log(`📦 Réplica local da base de dados sincronizada (embedded replica, intervalo: ${EMBEDDED_REPLICA_SYNC_INTERVAL_SEGUNDOS}s).`))
  .catch(err => {
    console.error('❌ Erro na sincronização inicial da réplica local:', err.message);
    throw err;
  });

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
      // Escritas: força uma sincronização imediata a seguir, para que a
      // réplica local fique atualizada sem ter de esperar pelo próximo
      // ciclo automático de "syncInterval" segundos. Isto reduz a janela
      // de inconsistência mencionada acima. Corre em segundo plano — não
      // atrasa a resposta ao chamador.
      client.sync().catch(err => console.error('⚠️ Erro ao sincronizar réplica após escrita:', err.message));
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
  await client.sync().catch(err => console.error('⚠️ Erro ao sincronizar réplica após exec:', err.message));
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

module.exports = { client, prepare, exec, pragma, transaction, pronto: primeiraSincronizacaoPromise };
