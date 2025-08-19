const { Pool } = require('pg');
require('dotenv').config();

/**
 * Configuração da conexão com PostgreSQL
 * Pool de conexões para melhor performance
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://cacheuser:cachepass@localhost:5432/cachedb',
  max: 20, // máximo de 20 conexões no pool
  idleTimeoutMillis: 30000, // fecha conexões inativas após 30s
  connectionTimeoutMillis: 2000, // timeout para conectar em 2s
});

// Event listeners para monitoramento
pool.on('connect', () => {
  console.log('🔗 Nova conexão PostgreSQL estabelecida');
});

pool.on('error', (err) => {
  console.error('❌ Erro na conexão PostgreSQL:', err);
});

module.exports = pool;
