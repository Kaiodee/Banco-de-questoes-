const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const FILE_PATH = path.join(__dirname, 'questoes.json');
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

// Garante que o arquivo JSON exista e tenha um formato de array válido do início
if (!fs.existsSync(FILE_PATH) || fs.readFileSync(FILE_PATH, 'utf-8').trim() === '') {
    fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2));
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

    // Rota para pegar as questões salvas no arquivo JSON
    if (req.url === '/api/questions' && req.method === 'GET') {
        fs.readFile(FILE_PATH, 'utf-8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Erro ao ler arquivo' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(data);
        });
    } 
    // Rota para salvar todas as questões no arquivo JSON
    else if (req.url === '/api/questions' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const questions = JSON.parse(body);
                fs.writeFile(FILE_PATH, JSON.stringify(questions, null, 2), 'utf-8', (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Erro ao escrever no arquivo' }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                });
            } catch (e) {
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
    console.log(`💾 Salvando dados diretamente em: ${FILE_PATH}`);
});
