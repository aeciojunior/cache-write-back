-- Tabela para demonstrar o sistema de cache write-back
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para rastrear operações de cache
CREATE TABLE IF NOT EXISTS cache_operations (
    id SERIAL PRIMARY KEY,
    operation_type VARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER NOT NULL,
    operation_data JSONB,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Inserir alguns dados de exemplo
INSERT INTO products (name, description, price, stock_quantity, category) VALUES
('Smartphone Galaxy', 'Smartphone Android com 128GB', 1299.99, 50, 'Electronics'),
('Notebook Dell', 'Notebook para trabalho com SSD 512GB', 2499.99, 25, 'Computers'),
('Headphone Bluetooth', 'Fone de ouvido sem fio com cancelamento de ruído', 299.99, 100, 'Audio'),
('Tablet iPad', 'Tablet Apple com tela de 10 polegadas', 1899.99, 30, 'Electronics'),
('Mouse Gamer', 'Mouse óptico para jogos com RGB', 149.99, 75, 'Gaming');

-- Função para atualizar o timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para atualizar automaticamente o updated_at
CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON products 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
