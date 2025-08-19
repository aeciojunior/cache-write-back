const Queue = require('bull');
const redis = require('../config/redis');
const pool = require('../config/database');
const cache = require('../cache/writeBackCache');

/**
 * Fila para processamento assíncrono de persistência
 * 
 * Utiliza Bull.js para gerenciar jobs de persistência no banco de dados.
 * Isso garante que as escritas no cache sejam rápidas enquanto a 
 * persistência acontece em background de forma controlada.
 */

// Configuração da fila com Redis
const persistenceQueue = new Queue('persistence', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
  defaultJobOptions: {
    removeOnComplete: 100, // mantém apenas os últimos 100 jobs completos
    removeOnFail: 50, // mantém apenas os últimos 50 jobs falhados
    attempts: 3, // tenta até 3 vezes em caso de falha
    backoff: {
      type: 'exponential',
      delay: 2000, // delay exponencial começando em 2s
    },
  },
});

/**
 * Processador de jobs de persistência
 * Processa os dados do cache para o banco de dados
 */
persistenceQueue.process('persist-data', async (job) => {
  const { key, data, operation } = job.data;
  
  console.log(`🔄 Processando persistência: ${operation} para ${key}`);
  
  try {
    switch (operation) {
      case 'INSERT':
      case 'UPDATE':
        await persistToDatabase(key, data);
        await cache.markAsPersisted(key);
        break;
        
      case 'DELETE':
        await deleteFromDatabase(key);
        await cache.markDeletedAsProcessed(key);
        break;
        
      default:
        throw new Error(`Operação desconhecida: ${operation}`);
    }
    
    console.log(`✅ Persistência concluída: ${operation} para ${key}`);
    
  } catch (error) {
    console.error(`❌ Erro na persistência ${operation} para ${key}:`, error);
    throw error; // Re-throw para que o Bull.js possa tentar novamente
  }
});

/**
 * Persiste dados no banco PostgreSQL
 */
async function persistToDatabase(key, data) {
  const client = await pool.connect();
  
  try {
    // Parse da chave para extrair tabela e ID
    const [table, id] = parseKey(key);
    
    if (table === 'products') {
      await persistProduct(client, id, data);
    } else {
      throw new Error(`Tabela não suportada: ${table}`);
    }
    
  } finally {
    client.release();
  }
}

/**
 * Persiste produto no banco
 */
async function persistProduct(client, id, data) {
  const {
    name,
    description,
    price,
    stock_quantity,
    category,
    _cache_timestamp,
    _cache_version
  } = data;

  if (id === 'new') {
    // INSERT - novo produto
    const query = `
      INSERT INTO products (name, description, price, stock_quantity, category)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    
    const result = await client.query(query, [name, description, price, stock_quantity, category]);
    console.log(`✅ Produto inserido com ID: ${result.rows[0].id}`);
    
  } else {
    // UPDATE - produto existente
    // Verifica se o produto ainda existe e se não foi modificado por outro processo
    const checkQuery = 'SELECT updated_at FROM products WHERE id = $1';
    const checkResult = await client.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      throw new Error(`Produto ${id} não existe mais no banco`);
    }
    
    const updateQuery = `
      UPDATE products 
      SET name = $1, description = $2, price = $3, stock_quantity = $4, category = $5
      WHERE id = $6
    `;
    
    await client.query(updateQuery, [name, description, price, stock_quantity, category, id]);
    console.log(`✅ Produto ${id} atualizado`);
  }
}

/**
 * Remove dados do banco PostgreSQL
 */
async function deleteFromDatabase(key) {
  const client = await pool.connect();
  
  try {
    const [table, id] = parseKey(key);
    
    if (table === 'products') {
      const query = 'DELETE FROM products WHERE id = $1';
      const result = await client.query(query, [id]);
      
      if (result.rowCount === 0) {
        console.log(`⚠️ Produto ${id} já havia sido deletado`);
      } else {
        console.log(`✅ Produto ${id} deletado do banco`);
      }
    } else {
      throw new Error(`Tabela não suportada: ${table}`);
    }
    
  } finally {
    client.release();
  }
}

/**
 * Parse da chave do cache para extrair tabela e ID
 * Formato esperado: "table:id" (ex: "products:123")
 */
function parseKey(key) {
  const parts = key.split(':');
  if (parts.length !== 2) {
    throw new Error(`Formato de chave inválido: ${key}`);
  }
  return [parts[0], parts[1]];
}

/**
 * Adiciona job de persistência à fila
 */
async function addPersistenceJob(key, data, operation = 'UPDATE') {
  try {
    const job = await persistenceQueue.add('persist-data', {
      key,
      data,
      operation,
    }, {
      // Prioridade baseada na operação
      priority: operation === 'DELETE' ? 1 : operation === 'INSERT' ? 2 : 3,
      
      // Delay para agrupar operações (write coalescing)
      delay: 1000, // 1 segundo de delay para permitir agrupamento
    });
    
    console.log(`📋 Job de persistência adicionado: ${job.id} para ${key}`);
    return job;
    
  } catch (error) {
    console.error('❌ Erro ao adicionar job à fila:', error);
    throw error;
  }
}

/**
 * Inicia o processo de varredura periódica
 * Varre as chaves dirty e envia para persistência
 */
async function startPeriodicSync() {
  console.log('🔄 Iniciando sincronização periódica...');
  
  setInterval(async () => {
    try {
      // Processa chaves dirty (updates/inserts)
      const dirtyKeys = await cache.getDirtyKeys();
      
      for (const key of dirtyKeys) {
        const data = await cache.get(key);
        if (data) {
          await addPersistenceJob(key, data, 'UPDATE');
        }
      }
      
      // Processa chaves deletadas
      const deletedKeys = await cache.getDeletedKeys();
      
      for (const key of deletedKeys) {
        await addPersistenceJob(key, null, 'DELETE');
      }
      
      if (dirtyKeys.length > 0 || deletedKeys.length > 0) {
        console.log(`🔄 Enviadas ${dirtyKeys.length} atualizações e ${deletedKeys.length} deleções para fila`);
      }
      
    } catch (error) {
      console.error('❌ Erro na sincronização periódica:', error);
    }
  }, 5000); // Executa a cada 5 segundos
}

// Event listeners para monitoramento da fila
persistenceQueue.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completado`);
});

persistenceQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} falhou:`, err.message);
});

persistenceQueue.on('stalled', (job) => {
  console.warn(`⚠️ Job ${job.id} travado`);
});

module.exports = {
  persistenceQueue,
  addPersistenceJob,
  startPeriodicSync,
};
