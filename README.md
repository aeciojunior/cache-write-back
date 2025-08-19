# Sistema de Cache Write-Back - ESDB3 At2

## 📋 Descrição

Este projeto implementa um sistema de cache utilizando a estratégia **write-back** com Redis e PostgreSQL. O sistema foi desenvolvido como parte da atividade 2 do módulo 2 da disciplina ESDB3, demonstrando como implementar um cache que prioriza a velocidade de escrita através de persistência assíncrona.

## 🏗️ Arquitetura

### Componentes Principais

1. **Cache Write-Back (Redis)**: Armazena dados temporariamente e gerencia operações de escrita
2. **Fila de Persistência (Bull.js)**: Processa operações assíncronas para o banco de dados
3. **Banco de Dados (PostgreSQL)**: Armazenamento persistente final
4. **API REST (Express.js)**: Interface para operações CRUD
5. **Sistema de Locks**: Controla concorrência e evita condições de corrida

### Fluxo de Dados

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Cliente   │───▶│  API REST   │───▶│ Write-Back  │───▶│    Fila     │
└─────────────┘    └─────────────┘    │   Cache     │    │Persistência │
                                      └─────────────┘    └─────────────┘
                                             │                   │
                                             ▼                   ▼
                                      ┌─────────────┐    ┌─────────────┐
                                      │    Redis    │    │ PostgreSQL  │
                                      └─────────────┘    └─────────────┘
```

## 🚀 Como Executar

### Pré-requisitos

- Docker e Docker Compose
- Node.js 18+ (para desenvolvimento local)

### Usando Docker (Recomendado)

1. **Clone e acesse o diretório:**
```bash
git clone <repository>
cd write-back-cache-system
```

2. **Inicie os serviços:**
```bash
docker-compose up -d
```

3. **Acesse a aplicação:**
- API: http://localhost:3000
- Health Check: http://localhost:3000/api/admin/health
- Estatísticas do Cache: http://localhost:3000/api/admin/cache/stats

### Desenvolvimento Local

1. **Instale dependências:**
```bash
npm install
```

2. **Configure variáveis de ambiente:**
```bash
cp env.example .env
# Edite o arquivo .env conforme necessário
```

3. **Inicie Redis e PostgreSQL:**
```bash
docker-compose up redis postgres -d
```

4. **Execute a aplicação:**
```bash
npm run dev
```

## 📚 API Endpoints

### Produtos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/products` | Lista produtos com paginação |
| GET | `/api/products/:id` | Busca produto por ID |
| POST | `/api/products` | Cria novo produto |
| PUT | `/api/products/:id` | Atualiza produto |
| DELETE | `/api/products/:id` | Deleta produto |
| PATCH | `/api/products/:id/stock` | Atualiza estoque |
| GET | `/api/products/category/:category` | Busca por categoria |

### Administração

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/admin/health` | Verifica saúde do sistema |
| GET | `/api/admin/cache/stats` | Estatísticas do cache |
| GET | `/api/admin/cache/dirty-keys` | Chaves pendentes de persistência |
| POST | `/api/admin/cache/force-sync` | Força sincronização |
| DELETE | `/api/admin/cache/clear` | Limpa todo o cache |
| GET | `/api/admin/cache/key/:key` | Inspeciona chave específica |

## 🔧 Exemplos de Uso

### Criar Produto
```bash
curl -X POST http://localhost:3000/api/products \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Smartphone Galaxy",
    "description": "Smartphone Android com 128GB",
    "price": 1299.99,
    "stock_quantity": 50,
    "category": "Electronics"
  }'
```

### Atualizar Estoque
```bash
curl -X PATCH http://localhost:3000/api/products/1/stock \\
  -H "Content-Type: application/json" \\
  -d '{
    "quantity": 10,
    "operation": "add"
  }'
```

### Ver Estatísticas do Cache
```bash
curl http://localhost:3000/api/admin/cache/stats
```

## ⚡ Estratégia Write-Back

### Como Funciona

1. **Escrita Rápida**: Dados são escritos imediatamente no cache Redis
2. **Marcação Dirty**: Chave é marcada para persistência posterior
3. **Resposta Imediata**: Cliente recebe confirmação sem esperar o banco
4. **Persistência Assíncrona**: Fila processa dados para PostgreSQL em background
5. **Controle de Versão**: Sistema evita conflitos com timestamps e versões

### Vantagens

- ✅ **Latência Mínima**: Escritas são extremamente rápidas
- ✅ **Alto Throughput**: Suporta muitas operações simultâneas
- ✅ **Tolerância a Falhas**: Dados ficam seguros no cache mesmo se o banco estiver lento
- ✅ **Otimização de Recursos**: Agrupa escritas para reduzir carga no banco

### Desvantagens

- ❌ **Risco de Perda**: Dados podem ser perdidos se o cache falhar antes da persistência
- ❌ **Complexidade**: Requer controle cuidadoso de concorrência
- ❌ **Consistência Eventual**: Dados podem estar temporariamente inconsistentes
- ❌ **Debugging Complexo**: Mais difícil rastrear problemas de dados

## 🔒 Controle de Concorrência

### Mutexes por Chave
- Cada chave do cache tem seu próprio mutex
- Evita condições de corrida durante escritas simultâneas
- Garante atomicidade das operações

### Controle de Versão
- Cada operação recebe um timestamp e número de versão
- Permite detectar e resolver conflitos
- Evita sobrescrita de dados mais recentes

### Exemplo de Conflito Resolvido
```
Tempo    | Operação A        | Operação B        | Resultado
---------|-------------------|-------------------|----------
T1       | Lê produto (v1)   | Lê produto (v1)   | Ambos têm v1
T2       | Modifica preço    | Modifica estoque  | -
T3       | Escreve (v2)      | -                 | Cache tem v2
T4       | -                 | Escreve (v3)      | Cache tem v3 (mais recente)
T5       | Persiste v2       | Persiste v3       | Banco fica com v3
```

## 🔄 Fila de Persistência

### Configuração Bull.js
- **Retry**: 3 tentativas com backoff exponencial
- **Prioridade**: DELETE > INSERT > UPDATE
- **Delay**: 1 segundo para permitir write coalescing
- **Cleanup**: Remove jobs antigos automaticamente

### Monitoramento
- Logs detalhados de todas as operações
- Métricas de performance disponíveis via API
- Alertas para falhas de persistência

## 📊 Monitoramento e Observabilidade

### Logs Estruturados
```
✅ Cache HIT para products:123
❌ Cache MISS para products:456
🔄 Chave products:123 marcada para persistência
✍️ Escrevendo no cache: products:789
💾 Persistência concluída: UPDATE para products:123
```

### Métricas Disponíveis
- Total de chaves no cache
- Número de chaves dirty
- Número de chaves deletadas
- Contadores de hits/misses
- Tempo de resposta das operações

## 🧪 Cenários de Teste

### Teste de Carga
```bash
# Terminal 1: Cria muitos produtos
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/products -H "Content-Type: application/json" -d "{\"name\":\"Produto $i\",\"price\":$((RANDOM%1000))}";
done

# Terminal 2: Monitora estatísticas
watch -n 1 'curl -s http://localhost:3000/api/admin/cache/stats | jq'
```

### Teste de Concorrência
```bash
# Atualiza mesmo produto simultaneamente
seq 1 50 | xargs -P 10 -I {} curl -X PATCH http://localhost:3000/api/products/1/stock -H "Content-Type: application/json" -d '{"quantity":1,"operation":"add"}'
```

## 📋 Casos de Uso

### ✅ Ideal para Write-Back

**E-commerce com atualizações frequentes de estoque:**
- Milhares de operações de estoque por segundo
- Necessidade de resposta imediata para usuários
- Tolerância a pequenos atrasos na persistência
- Dados podem ser reconstruídos a partir de logs

### ❌ Não Ideal para Write-Back

**Sistema bancário de transferências:**
- Necessidade de consistência imediata
- Zero tolerância a perda de dados
- Regulamentações exigem persistência imediata
- Auditoria requer garantias de durabilidade

## 🛠️ Configuração Avançada

### Variáveis de Ambiente
```bash
# Cache
CACHE_TTL=3600                    # TTL padrão em segundos
SYNC_INTERVAL=5000                # Intervalo de sincronização em ms

# Performance
MAX_RETRIES=3                     # Máximo de tentativas na fila
BATCH_SIZE=100                    # Tamanho do lote para persistência
WRITE_COALESCING_DELAY=1000       # Delay para agrupamento em ms

# Monitoramento
LOG_LEVEL=info                    # Nível de log (debug, info, warn, error)
ENABLE_METRICS=true               # Habilita coleta de métricas
```

### Otimizações de Performance
1. **Write Coalescing**: Agrupa escritas da mesma chave
2. **Batch Processing**: Processa múltiplas operações juntas
3. **Connection Pooling**: Reutiliza conexões do banco
4. **Memory Optimization**: Limpa mutexes não utilizados

## 🐛 Troubleshooting

### Cache não está funcionando
```bash
# Verifica conexão Redis
docker exec -it cache_redis redis-cli ping

# Verifica logs do container
docker logs cache_app
```

### Persistência lenta
```bash
# Verifica fila de trabalhos
curl http://localhost:3000/api/admin/cache/dirty-keys

# Força sincronização
curl -X POST http://localhost:3000/api/admin/cache/force-sync
```

### Problemas de concorrência
```bash
# Inspeciona chave específica
curl http://localhost:3000/api/admin/cache/key/products:123

# Verifica estatísticas de mutexes
curl http://localhost:3000/api/admin/cache/stats
```

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

## 👥 Autores

- **ESDB3 At2** - Implementação do sistema de cache write-back

---

**⚡ Sistema de Cache Write-Back - Velocidade máxima para escritas com persistência assíncrona confiável!**
