const Redis = require('ioredis');
require('dotenv').config();

/**
 * Configuração do cliente Redis
 * Utilizado para cache e como broker para filas
 */
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Event listeners para monitoramento
redis.on('connect', () => {
  console.log('🔗 Conectado ao Redis');
});

redis.on('error', (err) => {
  console.error('❌ Erro na conexão Redis:', err);
});

redis.on('ready', () => {
  console.log('✅ Redis pronto para uso');
});

module.exports = redis;
