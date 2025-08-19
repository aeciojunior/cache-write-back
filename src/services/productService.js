const pool = require('../config/database');
const cache = require('../cache/writeBackCache');
const { addPersistenceJob } = require('../queue/persistenceQueue');

/**
 * Serviço de Produtos
 * 
 * Implementa operações CRUD utilizando a estratégia write-back cache.
 * Todas as escritas são feitas primeiro no cache e depois persistidas
 * assincronamente no banco de dados.
 */
class ProductService {

  /**
   * Busca produto por ID
   * Primeiro verifica o cache, depois o banco se necessário
   */
  async getById(id) {
    const cacheKey = `products:${id}`;
    
    return await cache.get(cacheKey, async () => {
      // Fallback: buscar no banco se não estiver no cache
      console.log(`🔍 Buscando produto ${id} no banco de dados`);
      
      const client = await pool.connect();
      try {
        const query = 'SELECT * FROM products WHERE id = $1';
        const result = await client.query(query, [id]);
        
        return result.rows.length > 0 ? result.rows[0] : null;
      } finally {
        client.release();
      }
    });
  }

  /**
   * Lista todos os produtos com paginação
   * Utiliza cache para listas frequentemente acessadas
   */
  async getAll(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const cacheKey = `products:list:${page}:${limit}`;
    
    return await cache.get(cacheKey, async () => {
      console.log(`🔍 Buscando lista de produtos no banco (página ${page})`);
      
      const client = await pool.connect();
      try {
        const query = `
          SELECT * FROM products 
          ORDER BY created_at DESC 
          LIMIT $1 OFFSET $2
        `;
        const countQuery = 'SELECT COUNT(*) as total FROM products';
        
        const [dataResult, countResult] = await Promise.all([
          client.query(query, [limit, offset]),
          client.query(countQuery)
        ]);
        
        return {
          data: dataResult.rows,
          pagination: {
            page,
            limit,
            total: parseInt(countResult.rows[0].total),
            totalPages: Math.ceil(countResult.rows[0].total / limit)
          }
        };
      } finally {
        client.release();
      }
    });
  }

  /**
   * Cria novo produto (Write-Back)
   * Escreve imediatamente no cache e agenda persistência
   */
  async create(productData) {
    const { name, description, price, stock_quantity, category } = productData;
    
    // Validação básica
    if (!name || !price) {
      throw new Error('Nome e preço são obrigatórios');
    }

    // Gera ID temporário para o cache (será substituído pelo ID real do banco)
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const cacheKey = `products:${tempId}`;
    
    const newProduct = {
      id: tempId,
      name: name.trim(),
      description: description ? description.trim() : null,
      price: parseFloat(price),
      stock_quantity: parseInt(stock_quantity) || 0,
      category: category ? category.trim() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      // Write-back: escreve no cache primeiro
      await cache.set(cacheKey, newProduct, true);
      
      // Agenda persistência imediata para novos produtos
      await addPersistenceJob(cacheKey, newProduct, 'INSERT');
      
      // Invalida cache de listas
      await this.invalidateListCache();
      
      console.log(`✅ Produto criado no cache: ${tempId}`);
      return newProduct;
      
    } catch (error) {
      console.error('❌ Erro ao criar produto:', error);
      throw error;
    }
  }

  /**
   * Atualiza produto existente (Write-Back)
   */
  async update(id, updateData) {
    const cacheKey = `products:${id}`;
    
    try {
      // Busca produto atual
      const currentProduct = await this.getById(id);
      if (!currentProduct) {
        throw new Error(`Produto ${id} não encontrado`);
      }

      // Merge dos dados
      const updatedProduct = {
        ...currentProduct,
        ...updateData,
        id, // garante que o ID não seja alterado
        updated_at: new Date().toISOString()
      };

      // Validação
      if (updatedProduct.price && updatedProduct.price < 0) {
        throw new Error('Preço não pode ser negativo');
      }

      if (updatedProduct.stock_quantity && updatedProduct.stock_quantity < 0) {
        throw new Error('Quantidade em estoque não pode ser negativa');
      }

      // Write-back: escreve no cache primeiro
      await cache.set(cacheKey, updatedProduct, true);
      
      // Agenda persistência
      await addPersistenceJob(cacheKey, updatedProduct, 'UPDATE');
      
      // Invalida cache de listas
      await this.invalidateListCache();
      
      console.log(`✅ Produto ${id} atualizado no cache`);
      return updatedProduct;
      
    } catch (error) {
      console.error(`❌ Erro ao atualizar produto ${id}:`, error);
      throw error;
    }
  }

  /**
   * Deleta produto (Write-Back)
   */
  async delete(id) {
    const cacheKey = `products:${id}`;
    
    try {
      // Verifica se produto existe
      const product = await this.getById(id);
      if (!product) {
        throw new Error(`Produto ${id} não encontrado`);
      }

      // Remove do cache e marca para deleção no banco
      await cache.delete(cacheKey);
      
      // Invalida cache de listas
      await this.invalidateListCache();
      
      console.log(`✅ Produto ${id} deletado do cache`);
      return { id, deleted: true };
      
    } catch (error) {
      console.error(`❌ Erro ao deletar produto ${id}:`, error);
      throw error;
    }
  }

  /**
   * Atualiza estoque (operação otimizada para alta frequência)
   */
  async updateStock(id, quantity, operation = 'set') {
    const cacheKey = `products:${id}`;
    
    try {
      const product = await this.getById(id);
      if (!product) {
        throw new Error(`Produto ${id} não encontrado`);
      }

      let newQuantity;
      switch (operation) {
        case 'add':
          newQuantity = product.stock_quantity + quantity;
          break;
        case 'subtract':
          newQuantity = product.stock_quantity - quantity;
          break;
        case 'set':
        default:
          newQuantity = quantity;
          break;
      }

      if (newQuantity < 0) {
        throw new Error('Estoque não pode ser negativo');
      }

      const updatedProduct = {
        ...product,
        stock_quantity: newQuantity,
        updated_at: new Date().toISOString()
      };

      // Write-back com prioridade alta para operações de estoque
      await cache.set(cacheKey, updatedProduct, true);
      await addPersistenceJob(cacheKey, updatedProduct, 'UPDATE');
      
      console.log(`📦 Estoque do produto ${id} atualizado: ${newQuantity}`);
      return updatedProduct;
      
    } catch (error) {
      console.error(`❌ Erro ao atualizar estoque do produto ${id}:`, error);
      throw error;
    }
  }

  /**
   * Busca produtos por categoria
   */
  async getByCategory(category, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const cacheKey = `products:category:${category}:${page}:${limit}`;
    
    return await cache.get(cacheKey, async () => {
      console.log(`🔍 Buscando produtos da categoria ${category} no banco`);
      
      const client = await pool.connect();
      try {
        const query = `
          SELECT * FROM products 
          WHERE category ILIKE $1
          ORDER BY created_at DESC 
          LIMIT $2 OFFSET $3
        `;
        const countQuery = 'SELECT COUNT(*) as total FROM products WHERE category ILIKE $1';
        
        const [dataResult, countResult] = await Promise.all([
          client.query(query, [`%${category}%`, limit, offset]),
          client.query(countQuery, [`%${category}%`])
        ]);
        
        return {
          data: dataResult.rows,
          pagination: {
            page,
            limit,
            total: parseInt(countResult.rows[0].total),
            totalPages: Math.ceil(countResult.rows[0].total / limit)
          }
        };
      } finally {
        client.release();
      }
    });
  }

  /**
   * Invalida cache de listas (utilizado após modificações)
   */
  async invalidateListCache() {
    try {
      // Remove todas as chaves de lista do cache
      const pattern = 'products:list:*';
      const keys = await require('../config/redis').keys(pattern);
      
      if (keys.length > 0) {
        await require('../config/redis').del(...keys);
        console.log(`🗑️ Invalidadas ${keys.length} chaves de cache de lista`);
      }
      
      // Remove cache de categorias também
      const categoryPattern = 'products:category:*';
      const categoryKeys = await require('../config/redis').keys(categoryPattern);
      
      if (categoryKeys.length > 0) {
        await require('../config/redis').del(...categoryKeys);
        console.log(`🗑️ Invalidadas ${categoryKeys.length} chaves de cache de categoria`);
      }
      
    } catch (error) {
      console.error('❌ Erro ao invalidar cache de listas:', error);
    }
  }

  /**
   * Obtém estatísticas do cache
   */
  async getCacheStats() {
    return await cache.getStats();
  }
}

module.exports = new ProductService();
