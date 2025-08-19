const express = require('express');
const productService = require('../services/productService');

const router = express.Router();

/**
 * Rotas para API de Produtos
 * Demonstra o sistema de cache write-back em ação
 */

/**
 * GET /products
 * Lista produtos com paginação
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    // Validação
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Parâmetros de paginação inválidos (page >= 1, limit 1-100)'
      });
    }

    const result = await productService.getAll(page, limit);
    
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar produtos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

/**
 * GET /products/:id
 * Busca produto por ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validação básica do ID
    if (!id || (isNaN(id) && !id.startsWith('temp_'))) {
      return res.status(400).json({
        error: 'ID do produto inválido'
      });
    }

    const product = await productService.getById(id);
    
    if (!product) {
      return res.status(404).json({
        error: 'Produto não encontrado'
      });
    }

    res.json({
      success: true,
      data: product,
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error(`❌ Erro ao buscar produto ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

/**
 * POST /products
 * Cria novo produto
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, price, stock_quantity, category } = req.body;
    
    // Validação de dados obrigatórios
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Nome do produto é obrigatório'
      });
    }
    
    if (!price || isNaN(price) || parseFloat(price) < 0) {
      return res.status(400).json({
        error: 'Preço deve ser um número válido e não negativo'
      });
    }

    const productData = {
      name: name.trim(),
      description: description ? description.trim() : null,
      price: parseFloat(price),
      stock_quantity: stock_quantity ? parseInt(stock_quantity) : 0,
      category: category ? category.trim() : null
    };

    const newProduct = await productService.create(productData);
    
    res.status(201).json({
      success: true,
      data: newProduct,
      message: 'Produto criado com sucesso (persistência assíncrona em andamento)',
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar produto:', error);
    
    if (error.message.includes('obrigatório')) {
      res.status(400).json({
        error: error.message
      });
    } else {
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
});

/**
 * PUT /products/:id
 * Atualiza produto existente
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Validação do ID
    if (!id || (isNaN(id) && !id.startsWith('temp_'))) {
      return res.status(400).json({
        error: 'ID do produto inválido'
      });
    }

    // Remove campos que não devem ser atualizados
    delete updateData.id;
    delete updateData.created_at;
    delete updateData._cache_timestamp;
    delete updateData._cache_version;

    // Validações específicas
    if (updateData.price !== undefined) {
      if (isNaN(updateData.price) || parseFloat(updateData.price) < 0) {
        return res.status(400).json({
          error: 'Preço deve ser um número válido e não negativo'
        });
      }
      updateData.price = parseFloat(updateData.price);
    }

    if (updateData.stock_quantity !== undefined) {
      if (isNaN(updateData.stock_quantity) || parseInt(updateData.stock_quantity) < 0) {
        return res.status(400).json({
          error: 'Quantidade em estoque deve ser um número inteiro não negativo'
        });
      }
      updateData.stock_quantity = parseInt(updateData.stock_quantity);
    }

    // Limpa strings
    if (updateData.name) updateData.name = updateData.name.trim();
    if (updateData.description) updateData.description = updateData.description.trim();
    if (updateData.category) updateData.category = updateData.category.trim();

    const updatedProduct = await productService.update(id, updateData);
    
    res.json({
      success: true,
      data: updatedProduct,
      message: 'Produto atualizado com sucesso (persistência assíncrona em andamento)',
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error(`❌ Erro ao atualizar produto ${req.params.id}:`, error);
    
    if (error.message.includes('não encontrado')) {
      res.status(404).json({
        error: error.message
      });
    } else if (error.message.includes('negativo')) {
      res.status(400).json({
        error: error.message
      });
    } else {
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
});

/**
 * DELETE /products/:id
 * Deleta produto
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validação do ID
    if (!id || (isNaN(id) && !id.startsWith('temp_'))) {
      return res.status(400).json({
        error: 'ID do produto inválido'
      });
    }

    const result = await productService.delete(id);
    
    res.json({
      success: true,
      data: result,
      message: 'Produto deletado com sucesso (persistência assíncrona em andamento)',
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error(`❌ Erro ao deletar produto ${req.params.id}:`, error);
    
    if (error.message.includes('não encontrado')) {
      res.status(404).json({
        error: error.message
      });
    } else {
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
});

/**
 * PATCH /products/:id/stock
 * Atualiza estoque do produto (operação otimizada)
 */
router.patch('/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, operation = 'set' } = req.body;
    
    // Validações
    if (!id || (isNaN(id) && !id.startsWith('temp_'))) {
      return res.status(400).json({
        error: 'ID do produto inválido'
      });
    }

    if (quantity === undefined || isNaN(quantity)) {
      return res.status(400).json({
        error: 'Quantidade deve ser um número válido'
      });
    }

    if (!['set', 'add', 'subtract'].includes(operation)) {
      return res.status(400).json({
        error: 'Operação deve ser: set, add ou subtract'
      });
    }

    const updatedProduct = await productService.updateStock(id, parseInt(quantity), operation);
    
    res.json({
      success: true,
      data: updatedProduct,
      message: `Estoque ${operation === 'set' ? 'definido' : operation === 'add' ? 'adicionado' : 'subtraído'} com sucesso`,
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error(`❌ Erro ao atualizar estoque do produto ${req.params.id}:`, error);
    
    if (error.message.includes('não encontrado')) {
      res.status(404).json({
        error: error.message
      });
    } else if (error.message.includes('negativo')) {
      res.status(400).json({
        error: error.message
      });
    } else {
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
});

/**
 * GET /products/category/:category
 * Busca produtos por categoria
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    // Validações
    if (!category || category.trim().length === 0) {
      return res.status(400).json({
        error: 'Categoria é obrigatória'
      });
    }

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Parâmetros de paginação inválidos (page >= 1, limit 1-100)'
      });
    }

    const result = await productService.getByCategory(category.trim(), page, limit);
    
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      category: category.trim(),
      cache_strategy: 'write-back'
    });
    
  } catch (error) {
    console.error(`❌ Erro ao buscar produtos da categoria ${req.params.category}:`, error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

module.exports = router;
