/**
 * Script para testar o sistema de cache write-back
 * Demonstra operações básicas e comportamento do cache
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

class SystemTester {
  constructor() {
    this.testResults = [];
  }

  async runTest(name, testFn) {
    console.log(`\\n🧪 Executando teste: ${name}`);
    const start = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - start;
      console.log(`✅ ${name} - OK (${duration}ms)`);
      this.testResults.push({ name, status: 'OK', duration });
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`❌ ${name} - ERRO (${duration}ms):`, error.message);
      this.testResults.push({ name, status: 'ERRO', duration, error: error.message });
    }
  }

  async testHealthCheck() {
    const response = await axios.get(`${API_BASE}/admin/health`);
    if (response.data.success !== true) {
      throw new Error('Sistema não está saudável');
    }
    console.log('📊 Sistema saudável - Redis e PostgreSQL conectados');
  }

  async testCreateProduct() {
    const productData = {
      name: `Produto Teste ${Date.now()}`,
      description: 'Produto criado durante teste do sistema',
      price: 99.99,
      stock_quantity: 10,
      category: 'Teste'
    };

    const response = await axios.post(`${API_BASE}/products`, productData);
    
    if (response.status !== 201) {
      throw new Error(`Status inesperado: ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error('Resposta indica falha na criação');
    }

    this.testProductId = response.data.data.id;
    console.log(`📦 Produto criado com ID: ${this.testProductId}`);
    
    return response.data.data;
  }

  async testReadProduct() {
    if (!this.testProductId) {
      throw new Error('Nenhum produto de teste disponível');
    }

    const response = await axios.get(`${API_BASE}/products/${this.testProductId}`);
    
    if (response.status !== 200) {
      throw new Error(`Status inesperado: ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error('Resposta indica falha na leitura');
    }

    console.log(`📖 Produto lido: ${response.data.data.name}`);
    return response.data.data;
  }

  async testUpdateProduct() {
    if (!this.testProductId) {
      throw new Error('Nenhum produto de teste disponível');
    }

    const updateData = {
      description: `Descrição atualizada em ${new Date().toISOString()}`,
      price: 149.99
    };

    const response = await axios.put(`${API_BASE}/products/${this.testProductId}`, updateData);
    
    if (response.status !== 200) {
      throw new Error(`Status inesperado: ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error('Resposta indica falha na atualização');
    }

    console.log(`✏️ Produto atualizado - novo preço: R$ ${response.data.data.price}`);
    return response.data.data;
  }

  async testStockUpdate() {
    if (!this.testProductId) {
      throw new Error('Nenhum produto de teste disponível');
    }

    // Testa operação de adição
    const addResponse = await axios.patch(`${API_BASE}/products/${this.testProductId}/stock`, {
      quantity: 5,
      operation: 'add'
    });

    if (addResponse.status !== 200) {
      throw new Error(`Status inesperado na adição: ${addResponse.status}`);
    }

    // Testa operação de subtração
    const subtractResponse = await axios.patch(`${API_BASE}/products/${this.testProductId}/stock`, {
      quantity: 2,
      operation: 'subtract'
    });

    if (subtractResponse.status !== 200) {
      throw new Error(`Status inesperado na subtração: ${subtractResponse.status}`);
    }

    console.log(`📦 Estoque final: ${subtractResponse.data.data.stock_quantity}`);
    return subtractResponse.data.data;
  }

  async testConcurrentWrites() {
    if (!this.testProductId) {
      throw new Error('Nenhum produto de teste disponível');
    }

    console.log('🔄 Testando escritas concorrentes...');
    
    // Executa 10 atualizações de estoque simultaneamente
    const promises = Array.from({ length: 10 }, (_, i) => 
      axios.patch(`${API_BASE}/products/${this.testProductId}/stock`, {
        quantity: 1,
        operation: 'add'
      }).catch(error => ({ error: error.message }))
    );

    const results = await Promise.all(promises);
    const errors = results.filter(r => r.error);
    const successes = results.filter(r => !r.error);

    console.log(`✅ Sucessos: ${successes.length}, ❌ Erros: ${errors.length}`);
    
    if (errors.length > 5) {
      throw new Error(`Muitas falhas concorrentes: ${errors.length}/10`);
    }
  }

  async testCacheStats() {
    const response = await axios.get(`${API_BASE}/admin/cache/stats`);
    
    if (response.status !== 200) {
      throw new Error(`Status inesperado: ${response.status}`);
    }

    const stats = response.data.data;
    console.log(`📊 Cache Stats - Total: ${stats.totalKeys}, Dirty: ${stats.dirtyKeys}, Mutexes: ${stats.mutexCount}`);
    
    return stats;
  }

  async testDirtyKeys() {
    const response = await axios.get(`${API_BASE}/admin/cache/dirty-keys`);
    
    if (response.status !== 200) {
      throw new Error(`Status inesperado: ${response.status}`);
    }

    const data = response.data.data;
    console.log(`🔄 Chaves pendentes - Dirty: ${data.dirty_keys.length}, Deletadas: ${data.deleted_keys.length}`);
    
    return data;
  }

  async testForcedSync() {
    const response = await axios.post(`${API_BASE}/admin/cache/force-sync`);
    
    if (response.status !== 200) {
      throw new Error(`Status inesperado: ${response.status}`);
    }

    const data = response.data.data;
    console.log(`🔄 Sincronização forçada - Processadas: ${data.total_processed} chaves`);
    
    return data;
  }

  async testPagination() {
    const response = await axios.get(`${API_BASE}/products?page=1&limit=5`);
    
    if (response.status !== 200) {
      throw new Error(`Status inesperado: ${response.status}`);
    }

    const data = response.data;
    console.log(`📄 Paginação - Página: ${data.pagination.page}, Total: ${data.pagination.total}`);
    
    return data;
  }

  async testCategorySearch() {
    const response = await axios.get(`${API_BASE}/products/category/Electronics`);
    
    if (response.status !== 200) {
      throw new Error(`Status inesperado: ${response.status}`);
    }

    const data = response.data;
    console.log(`🔍 Busca por categoria - Encontrados: ${data.data.length} produtos`);
    
    return data;
  }

  async testDeleteProduct() {
    if (!this.testProductId) {
      throw new Error('Nenhum produto de teste disponível');
    }

    const response = await axios.delete(`${API_BASE}/products/${this.testProductId}`);
    
    if (response.status !== 200) {
      throw new Error(`Status inesperado: ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error('Resposta indica falha na deleção');
    }

    console.log(`🗑️ Produto ${this.testProductId} deletado`);
    this.testProductId = null;
    
    return response.data.data;
  }

  async cleanupTest() {
    if (this.testProductId) {
      try {
        await axios.delete(`${API_BASE}/products/${this.testProductId}`);
        console.log(`🧹 Produto de teste ${this.testProductId} removido`);
      } catch (error) {
        console.warn(`⚠️ Erro ao limpar produto de teste:`, error.message);
      }
    }
  }

  async runAllTests() {
    console.log('🚀 Iniciando testes do sistema de cache write-back...');
    console.log('='.repeat(60));

    try {
      // Testes básicos
      await this.runTest('Health Check', () => this.testHealthCheck());
      await this.runTest('Cache Stats', () => this.testCacheStats());
      await this.runTest('Paginação', () => this.testPagination());
      await this.runTest('Busca por Categoria', () => this.testCategorySearch());

      // Testes CRUD
      await this.runTest('Criar Produto', () => this.testCreateProduct());
      await this.runTest('Ler Produto', () => this.testReadProduct());
      await this.runTest('Atualizar Produto', () => this.testUpdateProduct());
      await this.runTest('Atualizar Estoque', () => this.testStockUpdate());

      // Testes de concorrência e cache
      await this.runTest('Escritas Concorrentes', () => this.testConcurrentWrites());
      await this.runTest('Verificar Dirty Keys', () => this.testDirtyKeys());
      await this.runTest('Sincronização Forçada', () => this.testForcedSync());

      // Aguarda um pouco para persistência
      console.log('\\n⏱️ Aguardando 3 segundos para persistência...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      await this.runTest('Stats Finais', () => this.testCacheStats());
      await this.runTest('Deletar Produto', () => this.testDeleteProduct());

    } catch (error) {
      console.error('❌ Erro crítico durante os testes:', error.message);
    } finally {
      await this.cleanupTest();
    }

    // Relatório final
    console.log('\\n' + '='.repeat(60));
    console.log('📊 RELATÓRIO FINAL DOS TESTES');
    console.log('='.repeat(60));

    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.status === 'OK').length;
    const failed = this.testResults.filter(r => r.status === 'ERRO').length;

    console.log(`Total de testes: ${total}`);
    console.log(`✅ Passou: ${passed}`);
    console.log(`❌ Falhou: ${failed}`);
    console.log(`📈 Taxa de sucesso: ${((passed/total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\\n❌ Testes que falharam:');
      this.testResults
        .filter(r => r.status === 'ERRO')
        .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    }

    const avgDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0) / total;
    console.log(`⏱️ Tempo médio por teste: ${avgDuration.toFixed(0)}ms`);

    console.log('\\n🏁 Testes concluídos!');
    return { total, passed, failed, avgDuration };
  }
}

// Executa os testes se este arquivo for chamado diretamente
if (require.main === module) {
  const tester = new SystemTester();
  
  tester.runAllTests()
    .then(results => {
      if (results.failed === 0) {
        console.log('\\n🎉 Todos os testes passaram! Sistema funcionando corretamente.');
        process.exit(0);
      } else {
        console.log('\\n⚠️ Alguns testes falharam. Verifique os logs acima.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\\n💥 Erro fatal durante os testes:', error.message);
      process.exit(1);
    });
}

module.exports = SystemTester;
