const redis = require('../config/redis');
const { Mutex } = require('async-mutex');

/**
 * Sistema de Cache Write-Back
 * 
 * O cache write-back armazena os dados no cache e posterga a escrita
 * para o banco de dados. Isso proporciona latência mínima para escritas,
 * mas requer cuidados especiais com consistência de dados.
 */
class WriteBackCache {
  constructor() {
    this.mutexes = new Map(); // Mutexes por chave para evitar condições de corrida
    this.defaultTTL = 3600; // TTL padrão de 1 hora
    this.dirtySet = 'dirty_keys'; // Set com chaves que precisam ser persistidas
  }

  /**
   * Obtém ou cria um mutex para uma chave específica
   * Previne condições de corrida durante operações na mesma chave
   */
  getMutex(key) {
    if (!this.mutexes.has(key)) {
      this.mutexes.set(key, new Mutex());
    }
    return this.mutexes.get(key);
  }

  /**
   * Leitura de dados (Read)
   * Primeiro tenta o cache, se não encontrar vai para o banco
   */
  async get(key, fallbackFunction = null) {
    try {
      console.log(`📖 Lendo chave: ${key}`);
      
      // Tenta buscar no cache primeiro
      const cachedData = await redis.get(key);
      
      if (cachedData) {
        console.log(`✅ Cache HIT para ${key}`);
        return JSON.parse(cachedData);
      }

      console.log(`❌ Cache MISS para ${key}`);
      
      // Se não está no cache e temos uma função fallback, executa
      if (fallbackFunction) {
        const data = await fallbackFunction();
        if (data) {
          // Coloca no cache para próximas leituras
          await this.set(key, data, false); // false = não marca como dirty
        }
        return data;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Erro ao ler ${key}:`, error);
      throw error;
    }
  }

  /**
   * Escrita de dados (Write-Back)
   * Escreve imediatamente no cache e marca para persistência posterior
   */
  async set(key, value, markDirty = true) {
    const mutex = this.getMutex(key);
    
    return await mutex.runExclusive(async () => {
      try {
        console.log(`✍️ Escrevendo no cache: ${key}`);
        
        // Adiciona timestamp para controle de versão
        const dataWithTimestamp = {
          ...value,
          _cache_timestamp: Date.now(),
          _cache_version: await this.getNextVersion(key)
        };

        // Escreve no cache
        await redis.setex(key, this.defaultTTL, JSON.stringify(dataWithTimestamp));
        
        // Marca como dirty se necessário (para persistência posterior)
        if (markDirty) {
          await redis.sadd(this.dirtySet, key);
          console.log(`🔄 Chave ${key} marcada para persistência`);
        }
        
        return dataWithTimestamp;
      } catch (error) {
        console.error(`❌ Erro ao escrever ${key}:`, error);
        throw error;
      }
    });
  }

  /**
   * Obtém a próxima versão para uma chave
   * Usado para controle de concorrência
   */
  async getNextVersion(key) {
    const versionKey = `${key}:version`;
    return await redis.incr(versionKey);
  }

  /**
   * Deleta uma chave do cache
   */
  async delete(key) {
    const mutex = this.getMutex(key);
    
    return await mutex.runExclusive(async () => {
      try {
        console.log(`🗑️ Deletando do cache: ${key}`);
        
        // Remove do cache
        await redis.del(key);
        
        // Remove da lista de dirty
        await redis.srem(this.dirtySet, key);
        
        // Marca como deletado para persistência
        await redis.sadd('deleted_keys', key);
        
        return true;
      } catch (error) {
        console.error(`❌ Erro ao deletar ${key}:`, error);
        throw error;
      }
    });
  }

  /**
   * Obtém todas as chaves que precisam ser persistidas
   */
  async getDirtyKeys() {
    try {
      return await redis.smembers(this.dirtySet);
    } catch (error) {
      console.error('❌ Erro ao obter chaves dirty:', error);
      return [];
    }
  }

  /**
   * Obtém todas as chaves deletadas que precisam ser removidas do banco
   */
  async getDeletedKeys() {
    try {
      return await redis.smembers('deleted_keys');
    } catch (error) {
      console.error('❌ Erro ao obter chaves deletadas:', error);
      return [];
    }
  }

  /**
   * Marca uma chave como persistida (remove da lista dirty)
   */
  async markAsPersisted(key) {
    try {
      await redis.srem(this.dirtySet, key);
      console.log(`✅ Chave ${key} marcada como persistida`);
    } catch (error) {
      console.error(`❌ Erro ao marcar ${key} como persistida:`, error);
    }
  }

  /**
   * Marca uma chave deletada como processada
   */
  async markDeletedAsProcessed(key) {
    try {
      await redis.srem('deleted_keys', key);
      console.log(`✅ Chave deletada ${key} processada`);
    } catch (error) {
      console.error(`❌ Erro ao processar chave deletada ${key}:`, error);
    }
  }

  /**
   * Limpa o mutex de uma chave (otimização de memória)
   */
  cleanupMutex(key) {
    if (this.mutexes.has(key)) {
      this.mutexes.delete(key);
    }
  }

  /**
   * Estatísticas do cache
   */
  async getStats() {
    try {
      const dirtyCount = await redis.scard(this.dirtySet);
      const deletedCount = await redis.scard('deleted_keys');
      const totalKeys = await redis.dbsize();
      
      return {
        totalKeys,
        dirtyKeys: dirtyCount,
        deletedKeys: deletedCount,
        mutexCount: this.mutexes.size
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      return null;
    }
  }
}

module.exports = new WriteBackCache();
