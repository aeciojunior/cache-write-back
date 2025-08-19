const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

// Importa rotas
const productRoutes = require('./routes/products');
const adminRoutes = require('./routes/admin');

// Importa configurações
const redis = require('./config/redis');
const pool = require('./config/database');
const { startPeriodicSync } = require('./queue/persistenceQueue');

/**
 * Servidor Express para demonstrar o sistema de cache write-back
 */
class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configura middlewares do Express
   */
  setupMiddlewares() {
    // Segurança
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));
    
    // Compressão
    this.app.use(compression());
    
    // Parse JSON
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Log de requests
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      });
      
      next();
    });
  }

  /**
   * Configura rotas da API
   */
  setupRoutes() {
    // Rota de boas-vindas com informações sobre o sistema
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Sistema de Cache Write-Back - ESDB3 At2',
        description: 'Sistema demonstra estratégia de cache write-back com Redis e PostgreSQL',
        features: [
          'Cache write-back com persistência assíncrona',
          'Controle de concorrência com mutexes',
          'Fila de persistência com Bull.js',
          'API REST para operações CRUD',
          'Monitoramento e estatísticas'
        ],
        endpoints: {
          products: '/api/products',
          admin: '/api/admin',
          health: '/api/admin/health'
        },
        cache_strategy: 'write-back',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // Rotas da API
    this.app.use('/api/products', productRoutes);
    this.app.use('/api/admin', adminRoutes);
    
    // Rota 404
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint não encontrado',
        message: `A rota ${req.method} ${req.originalUrl} não existe`,
        available_routes: [
          'GET /',
          'GET /api/products',
          'POST /api/products',
          'GET /api/products/:id',
          'PUT /api/products/:id',
          'DELETE /api/products/:id',
          'PATCH /api/products/:id/stock',
          'GET /api/products/category/:category',
          'GET /api/admin/health',
          'GET /api/admin/cache/stats'
        ]
      });
    });
  }

  /**
   * Configura tratamento de erros global
   */
  setupErrorHandling() {
    // Middleware de tratamento de erros
    this.app.use((error, req, res, next) => {
      console.error('❌ Erro não tratado:', error);
      
      // Não expor stack trace em produção
      const isDevelopment = process.env.NODE_ENV !== 'production';
      
      res.status(error.status || 500).json({
        error: 'Erro interno do servidor',
        message: error.message,
        ...(isDevelopment && { stack: error.stack }),
        timestamp: new Date().toISOString()
      });
    });

    // Tratamento de erros não capturados
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      process.exit(1);
    });
  }

  /**
   * Verifica conexões com banco de dados e cache
   */
  async checkConnections() {
    try {
      console.log('🔄 Verificando conexões...');
      
      // Testa Redis
      await redis.ping();
      console.log('✅ Redis conectado');
      
      // Testa PostgreSQL
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('✅ PostgreSQL conectado');
      
      return true;
    } catch (error) {
      console.error('❌ Erro nas conexões:', error);
      return false;
    }
  }

  /**
   * Inicia o servidor
   */
  async start() {
    try {
      // Verifica conexões
      const connectionsOk = await this.checkConnections();
      if (!connectionsOk) {
        console.error('❌ Falha ao conectar com dependências');
        process.exit(1);
      }

      // Inicia sincronização periódica
      console.log('🔄 Iniciando sincronização periódica...');
      startPeriodicSync();

      // Inicia servidor HTTP
      this.app.listen(this.port, () => {
        console.log(`🚀 Servidor iniciado na porta ${this.port}`);
        console.log(`📖 Documentação: http://localhost:${this.port}`);
        console.log(`🏥 Health check: http://localhost:${this.port}/api/admin/health`);
        console.log(`📊 Cache stats: http://localhost:${this.port}/api/admin/cache/stats`);
        console.log('');
        console.log('📋 Sistema de Cache Write-Back ativo!');
        console.log('✍️  Escritas são feitas imediatamente no cache');
        console.log('💾 Persistência no banco é assíncrona');
        console.log('🔒 Controle de concorrência com mutexes');
        console.log('⚡ Performance otimizada para escritas rápidas');
      });

    } catch (error) {
      console.error('❌ Erro ao iniciar servidor:', error);
      process.exit(1);
    }
  }

  /**
   * Para o servidor graciosamente
   */
  async stop() {
    try {
      console.log('🔄 Parando servidor...');
      
      // Fecha conexões
      await redis.quit();
      await pool.end();
      
      console.log('✅ Servidor parado');
    } catch (error) {
      console.error('❌ Erro ao parar servidor:', error);
    }
  }
}

// Inicia o servidor se este arquivo for executado diretamente
if (require.main === module) {
  const server = new Server();
  server.start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Sinal SIGINT recebido, parando servidor...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\\n🛑 Sinal SIGTERM recebido, parando servidor...');
    await server.stop();
    process.exit(0);
  });
}

module.exports = Server;
