// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Criar tabela se não existir
async function createTableIfNotExists() {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                description VARCHAR(255) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                type VARCHAR(50) NOT NULL,
                category VARCHAR(100) NOT NULL,
                date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        console.log("Tabela verificada/criada com sucesso");
    } catch (error) {
        console.error("Erro ao criar tabela:", error);
    }
}

// Rota de health check
app.get("/health", async (req, res) => {
    try {
        const result = await sql`SELECT version()`;
        res.json({ 
            status: "healthy", 
            database: "connected",
            version: result[0].version 
        });
    } catch (error) {
        res.status(500).json({ 
            status: "unhealthy", 
            database: "disconnected",
            error: error.message 
        });
    }
});

// Obter todas as transações
app.get("/transactions", async (req, res) => {
    try {
        const transactions = await sql`
            SELECT * FROM transactions 
            ORDER BY date DESC, created_at DESC
        `;
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Contar transações
app.get("/transactions/count", async (req, res) => {
    try {
        const result = await sql`SELECT COUNT(*) as count FROM transactions`;
        res.json({ count: parseInt(result[0].count) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Adicionar uma transação
app.post("/transactions", async (req, res) => {
    try {
        const { description, amount, type, category, date } = req.body;
        
        const result = await sql`
            INSERT INTO transactions (description, amount, type, category, date)
            VALUES (${description}, ${amount}, ${type}, ${category}, ${date})
            RETURNING *
        `;
        
        res.status(201).json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Adicionar várias transações (bulk insert)
app.post("/transactions/bulk", async (req, res) => {
    try {
        const { transactions } = req.body;
        
        if (!transactions || !Array.isArray(transactions)) {
            return res.status(400).json({ error: "Formato inválido" });
        }
        
        const inserted = [];
        
        for (const transaction of transactions) {
            const { description, amount, type, category, date } = transaction;
            
            try {
                const result = await sql`
                    INSERT INTO transactions (description, amount, type, category, date)
                    VALUES (${description}, ${amount}, ${type}, ${category}, ${date})
                    ON CONFLICT DO NOTHING
                    RETURNING *
                `;
                
                if (result && result.length > 0) {
                    inserted.push(result[0]);
                }
            } catch (error) {
                console.error("Erro ao inserir transação:", error);
            }
        }
        
        res.status(201).json({ 
            message: "Transações processadas",
            count: inserted.length,
            transactions: inserted 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Deletar uma transação
app.delete("/transactions/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        await sql`DELETE FROM transactions WHERE id = ${id}`;
        
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obter estatísticas
app.get("/statistics", async (req, res) => {
    try {
        const totalIncome = await sql`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM transactions 
            WHERE type = 'income'
        `;
        
        const totalExpense = await sql`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM transactions 
            WHERE type = 'expense'
        `;
        
        const categoryStats = await sql`
            SELECT category, SUM(amount) as total
            FROM transactions
            WHERE type = 'expense'
            GROUP BY category
            ORDER BY total DESC
        `;
        
        res.json({
            totalIncome: parseFloat(totalIncome[0].total),
            totalExpense: parseFloat(totalExpense[0].total),
            balance: parseFloat(totalIncome[0].total) - parseFloat(totalExpense[0].total),
            categories: categoryStats
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Iniciar servidor
app.listen(PORT, async () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    await createTableIfNotExists();
});