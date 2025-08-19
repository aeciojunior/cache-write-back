const express = require('express');
const productService = require('../services/productService');
const cache = require('../cache/writeBackCache');

const router = express.Router();

/**
 * Rotas administrativas para monitoramento do sistema de cache
 */

/**
 * GET /admin/cache/stats
 * Estatísticas do cache
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = await cache.getStats();
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas do cache:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

/**
 * GET /admin/cache/dirty-keys
 * Lista chaves que precisam ser persistidas
 */
router.get('/cache/dirty-keys', async (req, res) => {
  try {
    const dirtyKeys = await cache.getDirtyKeys();
    const deletedKeys = await cache.getDeletedKeys();
    
    res.json({
      success: true,
      data: {
        dirty_keys: dirtyKeys,
        deleted_keys: deletedKeys,
        total_pending: dirtyKeys.length + deletedKeys.length
      },
      timestamp: new Date().toISOString(),
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error('❌ Erro ao obter chaves dirty:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

/**
 * POST /admin/cache/force-sync
 * Força sincronização imediata de todas as chaves dirty
 */
router.post('/cache/force-sync', async (req, res) => {
  try {
    const { addPersistenceJob } = require('../queue/persistenceQueue');
    
    // Processa chaves dirty
    const dirtyKeys = await cache.getDirtyKeys();
    const syncResults = [];
    
    for (const key of dirtyKeys) {
      try {
        const data = await cache.get(key);
        if (data) {
          await addPersistenceJob(key, data, 'UPDATE');
          syncResults.push({ key, status: 'queued', operation: 'UPDATE' });
        }
      } catch (error) {
        syncResults.push({ key, status: 'error', error: error.message });
      }
    }
    
    // Processa chaves deletadas
    const deletedKeys = await cache.getDeletedKeys();
    
    for (const key of deletedKeys) {
      try {
        await addPersistenceJob(key, null, 'DELETE');
        syncResults.push({ key, status: 'queued', operation: 'DELETE' });
      } catch (error) {
        syncResults.push({ key, status: 'error', error: error.message });
      }
    }
    
    res.json({
      success: true,
      data: {
        total_processed: syncResults.length,
        dirty_keys_processed: dirtyKeys.length,
        deleted_keys_processed: deletedKeys.length,
        results: syncResults
      },
      message: 'Sincronização forçada iniciada',
      timestamp: new Date().toISOString(),
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error('❌ Erro ao forçar sincronização:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

/**
 * DELETE /admin/cache/clear
 * Limpa todo o cache (cuidado!)
 */
router.delete('/cache/clear', async (req, res) => {
  try {
    const redis = require('../config/redis');
    
    // Limpa todas as chaves do banco atual
    await redis.flushdb();
    
    res.json({
      success: true,
      message: 'Cache completamente limpo',
      warning: 'Todos os dados não persistidos foram perdidos!',
      timestamp: new Date().toISOString(),
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error('❌ Erro ao limpar cache:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

/**
 * GET /admin/cache/key/:key
 * Inspeciona uma chave específica do cache
 */
router.get('/cache/key/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const redis = require('../config/redis');
    
    // Busca a chave no cache
    const value = await redis.get(key);
    const ttl = await redis.ttl(key);
    const isDirty = await redis.sismember('dirty_keys', key);
    const isDeleted = await redis.sismember('deleted_keys', key);
    
    if (value === null) {
      return res.status(404).json({
        error: 'Chave não encontrada no cache'
      });
    }
    
    res.json({
      success: true,
      data: {
        key,
        value: JSON.parse(value),
        ttl: ttl > 0 ? ttl : 'sem expiração',
        is_dirty: isDirty === 1,
        is_deleted: isDeleted === 1,
        size_bytes: Buffer.byteLength(value, 'utf8')
      },
      timestamp: new Date().toISOString(),
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error(`❌ Erro ao inspecionar chave ${req.params.key}:`, error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

/**
 * GET /admin/health
 * Verifica saúde do sistema
 */
router.get('/health', async (req, res) => {
  try {
    const redis = require('../config/redis');
    const pool = require('../config/database');
    
    // Testa conexão Redis
    const redisStatus = await redis.ping();
    
    // Testa conexão PostgreSQL
    const client = await pool.connect();
    const pgResult = await client.query('SELECT NOW()');
    client.release();
    
    // Estatísticas do cache
    const cacheStats = await cache.getStats();
    
    res.json({
      success: true,
      data: {
        redis: {
          status: redisStatus === 'PONG' ? 'healthy' : 'unhealthy',
          response: redisStatus
        },
        postgresql: {
          status: 'healthy',
          timestamp: pgResult.rows[0].now
        },
        cache: cacheStats,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          node_version: process.version
        }
      },
      timestamp: new Date().toISOString(),
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error('❌ Erro no health check:', error);
    res.status(500).json({
      success: false,
      error: 'Sistema não saudável',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
