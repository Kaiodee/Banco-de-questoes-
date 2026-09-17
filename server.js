const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = 3000;
const FILE_PATH = path.join(__dirname, 'questoes.json');
const DATABASE_PATH = path.join(__dirname, 'questoes.db');
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

const database = new Database(DATABASE_PATH);
database.pragma('journal_mode = WAL');
database.exec(`
    CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`);

function readLegacyQuestions() {
    if (!fs.existsSync(FILE_PATH)) return [];

    try {
        const content = fs.readFileSync(FILE_PATH, 'utf-8').trim();
        if (!content) return [];
        const questions = JSON.parse(content);
        return Array.isArray(questions) ? questions : [];
    } catch (error) {
        console.error('Não foi possível migrar questoes.json:', error.message);
        return [];
    }
}

function getQuestions() {
    return database.prepare('SELECT data FROM questions ORDER BY rowid DESC').all()
        .map(row => JSON.parse(row.data));
}

function replaceQuestions(questions) {
    const insertQuestion = database.prepare(
        'INSERT INTO questions (id, data) VALUES (?, ?)'
    );
    const replaceAll = database.transaction((items) => {
        database.prepare('DELETE FROM questions').run();
        items.forEach((question, index) => {
            const id = String(question.id || `imported-${Date.now()}-${index}`);
            insertQuestion.run(id, JSON.stringify({ ...question, id }));
        });
    });

    replaceAll(questions);
}

if (database.prepare('SELECT COUNT(*) AS count FROM questions').get().count === 0) {
    const legacyQuestions = readLegacyQuestions();
    if (legacyQuestions.length > 0) {
        replaceQuestions(legacyQuestions);
        console.log(`📦 ${legacyQuestions.length} questão(ões) migrada(s) do JSON para SQLite.`);
    }
}

const server = http.createServer((req, res) => {
    // Permite que o seu index.html acesse o servidor sem problemas de CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Rota para pegar as questões salvas no SQLite
    if (req.url === '/api/questions' && req.method === 'GET') {
        try {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(getQuestions()));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Erro ao ler banco de dados' }));
        }
    } 
    // Rota para substituir as questões salvas no SQLite
    else if (req.url === '/api/questions' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const questions = JSON.parse(body);
                if (!Array.isArray(questions)) throw new Error('O corpo precisa ser um array');
                replaceQuestions(questions);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'JSON inválido enviado' }));
            }
        });
    } else if (req.method === 'GET') {
        const requestedPath = req.url === '/' ? '/index.html' : req.url;
        const filePath = path.resolve(__dirname, `.${requestedPath}`);

        if (!filePath.startsWith(`${__dirname}${path.sep}`)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Acesso negado');
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Não encontrado' }));
                return;
            }

            const extension = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME_TYPES[extension] || 'application/octet-stream'
            });
            res.end(data);
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Não encontrado' }));
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`💾 Banco SQLite: ${DATABASE_PATH}`);
});
