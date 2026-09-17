(function(){
    const LETTERS = ['A','B','C','D','E','F'];
    let questions = [];
    let savedFilters = [];
    let answers = {}; 
    let lastResults = {}; 
    let cadernos = {}; 
    let hiddenFeedback = new Set(); 
    let filter = {palavra:'',banca:'',instituicao:'',disciplina:'',assunto:'',ano:'',status:'',tipo:'',caderno:'', areaFormacao:''};
    let optCount = 5;
    
    // NOVO: Armazena seleções temporárias de alternativas antes de clicar no botão "Responder"
    let tempSelections = {};

    let cachedOptions = { banca: [], instituicao: [], disciplina: [], assunto: [], ano: [] };

    let currentPage = 1;
    let itemsPerPage = 10;

    let timerInterval;
    let initialTimeLeft = 25 * 60;
    let timeLeft = 25 * 60; 

    let myChart = null;

    const $ = (id) => document.getElementById(id);

    // ---- Custom Modal Logic ----
    function showCustomPrompt(title, msg, showInput, callback) {
        const modal = $('custom-modal');
        const titleEl = $('modal-title');
        const msgEl = $('modal-msg');
        const inputEl = $('modal-input');
        const btnOk = $('modal-btn-ok');
        const btnCancel = $('modal-btn-cancel');

        titleEl.textContent = title;
        msgEl.textContent = msg || '';
        msgEl.style.display = msg ? 'block' : 'none';
        inputEl.style.display = showInput ? 'block' : 'none';
        inputEl.value = '';
        modal.style.display = 'flex';
        
        if(showInput) inputEl.focus();

        const cleanup = () => {
            modal.style.display = 'none';
            btnOk.onclick = null;
            btnCancel.onclick = null;
        };

        btnOk.onclick = () => {
            const val = showInput ? inputEl.value.trim() : true;
            cleanup();
            callback(val);
        };
        btnCancel.onclick = () => {
            cleanup();
            callback(null);
        };
    }

    // ---- Timer & Audio Logic ----
    function playAlarm() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            for(let i=0; i<3; i++){
                setTimeout(() => {
                    const oscillator = audioCtx.createOscillator();
                    const gainNode = audioCtx.createGain();
                    oscillator.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                    oscillator.type = 'triangle';
                    oscillator.frequency.value = 800;
                    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                    oscillator.start();
                    oscillator.stop(audioCtx.currentTime + 0.5);
                }, i * 600);
            }
        } catch(e) {
            console.error("Audio API não suportada", e);
        }
    }

    function updateTimerDisplay() {
        let m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        let s = (timeLeft % 60).toString().padStart(2, '0');
        $('timer-display').textContent = `${m}:${s}`;
    }
    
    $('btn-timer-start').onclick = () => {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerDisplay();
            } else {
                clearInterval(timerInterval);
                playAlarm();
                showCustomPrompt('Tempo Esgotado', 'Seu ciclo de foco terminou!', false, () => {});
            }
        }, 1000);
    };
    
    $('btn-timer-pause').onclick = () => clearInterval(timerInterval);
    
    $('btn-timer-reset').onclick = () => {
        clearInterval(timerInterval);
        timeLeft = initialTimeLeft;
        updateTimerDisplay();
    };

    $('btn-timer-edit').onclick = () => {
        clearInterval(timerInterval);
        showCustomPrompt('Configurar Foco', 'Digite o tempo desejado (em minutos):', true, (val) => {
            const mins = parseInt(val, 10);
            if(!isNaN(mins) && mins > 0) {
                initialTimeLeft = mins * 60;
                timeLeft = initialTimeLeft;
                updateTimerDisplay();
            } else {
                showCustomPrompt('Erro', 'Tempo inválido.', false, () => {});
            }
        });
    };

    // ---- Rendimento / Chart rendering ----
    function renderPerformanceChart() {
        const results = Object.values(lastResults);
        const acertos = results.filter(r => r === 'acerto').length;
        const erros = results.filter(r => r === 'erro').length;
        const total = acertos + erros;

        // RETORNADO: Exibição textual com as porcentagens completas abaixo da rosca
        const percAcertos = total > 0 ? Math.round((acertos / total) * 100) : 0;
        const percErros = total > 0 ? Math.round((erros / total) * 100) : 0;

        const legendContainer = $('chart-legend-labels');
        legendContainer.innerHTML = `
            <div class="legend-item">
                <span class="legend-color" style="background-color: var(--green);"></span>
                <span>Acertos: ${acertos} (${percAcertos}%)</span>
            </div>
            <div class="legend-item">
                <span class="legend-color" style="background-color: var(--red);"></span>
                <span>Erros: ${erros} (${percErros}%)</span>
            </div>
            <div style="font-size: 10px; margin-top: 4px; color: var(--muted)">Total respondidas: ${total}</div>
        `;

        const ctx = $('performanceChart').getContext('2d');
        if (myChart !== null) {
            myChart.destroy();
        }

        const dataValues = total === 0 ? [1] : [acertos, erros];
        const bgColors = total === 0 ? ['#e3e1da'] : ['#2e7d4f', '#c0392b'];
        const labelText = total === 0 ? ['Sem respostas'] : ['Acertos', 'Erros'];

        myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labelText,
                datasets: [{
                    data: dataValues,
                    backgroundColor: bgColors,
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: total > 0 }
                },
                cutout: '60%'
            }
        });
    }

    // Botão para zera o histórico de rendimento local
    $('btn-reset-stats').onclick = () => {
        showCustomPrompt(
            'Zerar Estatísticas', 
            'Deseja limpar todo o histórico de acertos e erros do gráfico? Isso não apagará as questões do seu banco.', 
            false, 
            (confirmado) => {
                if (confirmado) {
                    lastResults = {};
                    persistLastResults();
                    renderPerformanceChart();
                    renderList(); 
                }
            }
        );
    };

    // ---- Data Handling ----
    async function loadQuestionsFromServer(){
      try{
        const res = await fetch('http://localhost:3000/api/questions');
        questions = await res.json();
      }catch(e){
        console.error('Erro ao carregar do servidor, usando vazio', e);
        questions = [];
      }
    }

    async function persistQuestions(){
      try{
        await fetch('http://localhost:3000/api/questions', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(questions)
        });
      }catch(e){ console.error('Erro ao salvar no servidor', e); }
    }

    function formatQuestionAddedAt(question) {
      if (!question.adicionadoEm) return '';

      const addedAt = new Date(question.adicionadoEm);
      if (Number.isNaN(addedAt.getTime())) return '';

      return addedAt.toLocaleString('pt-BR', {
        timeZone: 'America/Bahia',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).replace(',', ' às');
    }

    function loadAll(){
      try{
        const sf = localStorage.getItem('bq-saved-filters');
        savedFilters = sf ? JSON.parse(sf) : [];
      }catch(e){ savedFilters = []; }
      try{
        const an = localStorage.getItem('bq-answers');
        answers = an ? JSON.parse(an) : {};
      }catch(e){ answers = {}; }
      try{
        const lr = localStorage.getItem('bq-last-results');
        lastResults = lr ? JSON.parse(lr) : {};
      }catch(e){ lastResults = {}; }
      try{
        const cd = localStorage.getItem('bq-cadernos');
        cadernos = cd ? JSON.parse(cd) : {};
      }catch(e){ cadernos = {}; }
      try{
        const pp = localStorage.getItem('bq-per-page');
        if(pp) {
            itemsPerPage = parseInt(pp, 10);
            $('f-per-page').value = pp;
        }
      }catch(e){}
    }

    function persistFilters(){
      try{ localStorage.setItem('bq-saved-filters', JSON.stringify(savedFilters)); }
      catch(e){ console.error('Erro ao salvar filtros', e); }
    }
    
    function persistAnswers(){
      try{ localStorage.setItem('bq-answers', JSON.stringify(answers)); }
      catch(e){ console.error('Erro ao salvar respostas', e); }
    }

    function belongsToArea(q, area) {
    if (!area) return false;

    // NOVO: Se a questão foi importada com uma área específica, valida diretamente
    if (q.areaFormacao && q.areaFormacao === area) {
        return true;
    }

    // Regra antiga (fallback) para questões que não têm a área salva
    const disc = String(q.disciplina || '').toLowerCase();
    const assunto = String(q.assunto || '').toLowerCase();
    const cargo = String(q.cargo || '').toLowerCase();

    if (area === 'TI') {
        return disc.includes('software') || disc.includes('tecnologia') || disc.includes('informática') || 
               disc.includes('programação') || disc.includes('lógica') || disc.includes('banco de dados') ||
               assunto.includes('lgpd') || cargo.includes('ti') || cargo.includes('tecnologia');
    }
    if (area === 'Direito') {
        return disc.includes('direito') || disc.includes('constitucional') || disc.includes('administrativo') || 
               (assunto.includes('lei') && !cargo.includes('ti'));
    }
    if (area === 'Geral') {
        return !belongsToArea(q, 'TI') && !belongsToArea(q, 'Direito');
    }
    return false;
}
    function persistLastResults(){
      try{ localStorage.setItem('bq-last-results', JSON.stringify(lastResults)); }
      catch(e){ console.error('Erro ao salvar histórico de acertos', e); }
    }

    function persistCadernos(){
      try{ localStorage.setItem('bq-cadernos', JSON.stringify(cadernos)); }
      catch(e){ console.error('Erro ao salvar cadernos', e); }
    }

    function uniqVals(field){
      const s = new Set();
      questions.forEach(q => { 
          if(q[field] && filter.areaFormacao && belongsToArea(q, filter.areaFormacao)) {
              s.add(q[field].toString().trim()); 
          }
      });
      return Array.from(s).sort();
    }

    function updateOptionsCache() {
        cachedOptions.banca = uniqVals('banca');
        cachedOptions.instituicao = uniqVals('instituicao');
        cachedOptions.disciplina = uniqVals('disciplina');
        cachedOptions.assunto = uniqVals('assunto');
        cachedOptions.ano = uniqVals('ano');
    }

    // ---- SISTEMA DE DROPDOWN CUSTOMIZADO COM BUSCA ----
    function setupCustomSearchSelect(inputId, dropdownId, fieldKey) {
        const input = $(inputId);
        const dropdown = $(dropdownId);

        function populateDropdown(typedText = '') {
            if(!filter.areaFormacao) {
                dropdown.innerHTML = `<div class="search-select-no-results">Selecione uma Área primeiro</div>`;
                return;
            }
            const list = cachedOptions[fieldKey];
            const filtered = list.filter(item => 
                item.toLowerCase().includes(typedText.toLowerCase())
            );

            dropdown.innerHTML = '';
            if (filtered.length === 0) {
                dropdown.innerHTML = `<div class="search-select-no-results">Nenhum resultado</div>`;
            } else {
                filtered.forEach(value => {
                    const opt = document.createElement('div');
                    opt.className = 'search-select-option';
                    opt.textContent = value;
                    opt.onmousedown = (e) => {
                        e.preventDefault(); 
                        input.value = value;
                        filter[fieldKey] = value;
                        currentPage = 1;
                        render();
                        dropdown.classList.remove('show');
                    };
                    dropdown.appendChild(opt);
                });
            }
        }

        input.onfocus = () => {
            populateDropdown(input.value);
            dropdown.classList.add('show');
        };

        input.oninput = () => {
            filter[fieldKey] = input.value;
            populateDropdown(input.value);
            dropdown.classList.add('show');
            currentPage = 1;
            render();
        };

        input.onblur = () => {
            setTimeout(() => {
                dropdown.classList.remove('show');
            }, 180); 
        };
    }

    function refreshFilterOptions(){
      updateOptionsCache();
      setupCustomSearchSelect('f-banca', 'dropdown-banca', 'banca');
      setupCustomSearchSelect('f-instituicao', 'dropdown-instituicao', 'instituicao');
      setupCustomSearchSelect('f-disciplina', 'dropdown-disciplina', 'disciplina');
      setupCustomSearchSelect('f-assunto', 'dropdown-assunto', 'assunto');
      setupCustomSearchSelect('f-ano', 'dropdown-ano', 'ano');
    }

    function escHtml(s){
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
    function escAttr(s){ return escHtml(s); }

    function getQuestionType(question) {
      const explicitType = String(question.tipo || question.tipoQuestao || '').toLowerCase();
      if (explicitType.includes('certo') || explicitType.includes('errado') || explicitType === 'ce') {
        return 'certo-errado';
      }

      const options = Array.isArray(question.opcoes) ? question.opcoes : [];
      const optionLetters = options.map(option => String(option.letra || '').trim().toLowerCase());
      const optionTexts = options.map(option => String(option.texto || '').trim().toLowerCase());
      const hasCertoErradoTexts = optionTexts.length === 2 &&
        optionTexts.includes('certo') && optionTexts.includes('errado');
      const hasCertoErradoLetters = optionLetters.length === 2 &&
        optionLetters.includes('c') && optionLetters.includes('e');
      const isCertoErrado = hasCertoErradoTexts || hasCertoErradoLetters;

      return isCertoErrado ? 'certo-errado' : 'multipla';
    }

    function matchesFilter(q){
      if(!filter.areaFormacao) return false;
      if(!belongsToArea(q, filter.areaFormacao)) return false;

      if(filter.banca && !String(q.banca).toLowerCase().includes(filter.banca.toLowerCase())) return false;
      if(filter.instituicao && !String(q.instituicao).toLowerCase().includes(filter.instituicao.toLowerCase())) return false;
      if(filter.disciplina && !String(q.disciplina).toLowerCase().includes(filter.disciplina.toLowerCase())) return false;
      if(filter.assunto && !String(q.assunto).toLowerCase().includes(filter.assunto.toLowerCase())) return false;
      if(filter.ano && !String(q.ano).toLowerCase().includes(filter.ano.toLowerCase())) return false;
      if(filter.tipo && getQuestionType(q) !== filter.tipo) return false;
      
      if(filter.status === 'erradas' && (!answers[q.id] || answers[q.id] === q.correta)) return false;
      if(filter.status === 'corretas' && answers[q.id] !== q.correta) return false;
      if(filter.status === 'novas' && answers[q.id]) return false;
      if(filter.status === 'recentes' && questions.indexOf(q) >= 50) return false;

      if(filter.caderno && (!cadernos[filter.caderno] || !cadernos[filter.caderno].includes(q.id))) return false;

      if(filter.palavra){
        const p = filter.palavra.toLowerCase();
        if(!(q.enunciado||'').toLowerCase().includes(p)) return false;
      }
      return true;
    }

    function renderChips(){
      const wrap = $('active-chips');
      wrap.innerHTML = '';
      const labels = {palavra:'Palavra-chave',banca:'Banca',instituicao:'Instituição',disciplina:'Disciplina',assunto:'Assunto',ano:'Ano',status:'Foco',tipo:'Tipo',caderno:'Caderno', areaFormacao:'Área'};
      Object.keys(filter).forEach(k => {
        if(filter[k]){
          let displayVal = filter[k];
          if(k === 'status') {
            if(displayVal === 'erradas') displayVal = 'Revisar Erradas';
            if(displayVal === 'corretas') displayVal = 'Apenas Corretas';
            if(displayVal === 'novas') displayVal = 'Não Respondidas';
            if(displayVal === 'recentes') displayVal = 'Adicionadas Recentemente';
          }
          if(k === 'tipo') {
            if(displayVal === 'multipla') displayVal = 'Múltipla escolha';
            if(displayVal === 'certo-errado') displayVal = 'Certo ou Errado';
          }
          if(k === 'areaFormacao' && displayVal === 'TI') displayVal = 'Tecnologia da Informação';
          
          const chip = document.createElement('div');
          chip.className = 'chip';
          chip.innerHTML = `${labels[k]}: ${escHtml(displayVal)} <button data-k="${k}">×</button>`;
          chip.querySelector('button').onclick = () => { 
              filter[k]=''; 
              if(k === 'areaFormacao') $('f-area-formacao').value = '';
              syncFilterInputs(); 
              currentPage=1; 
              render(); 
          };
          wrap.appendChild(chip);
        }
      });

      const sw = $('saved-chips');
      sw.innerHTML = '';
      savedFilters.forEach(sf => {
        const chip = document.createElement('div');
        chip.className = 'savedchip';
        chip.innerHTML = `☆ ${escHtml(sf.nome)} <span class="del">✕</span>`;
        chip.querySelector('.del').onclick = (e) => {
          e.stopPropagation();
          savedFilters = savedFilters.filter(x => x.id !== sf.id);
          persistFilters(); renderChips();
        };
        chip.onclick = () => { filter = Object.assign({palavra:'',banca:'',instituicao:'',disciplina:'',assunto:'',ano:'',status:'',tipo:'',caderno:'', areaFormacao:''}, sf.filtro); syncFilterInputs(); currentPage=1; render(); };
        sw.appendChild(chip);
      });
    }

    function syncFilterInputs(){
      $('f-palavra').value = filter.palavra || '';
      $('f-banca').value = filter.banca || '';
      $('f-instituicao').value = filter.instituicao || '';
      $('f-disciplina').value = filter.disciplina || '';
      $('f-assunto').value = filter.assunto || '';
      $('f-ano').value = filter.ano || '';
      $('f-status').value = filter.status || '';
      $('f-tipo').value = filter.tipo || '';
      $('f-area-formacao').value = filter.areaFormacao || '';
    }

    function renderPagination(totalItems) {
        const wrap = $('pagination-wrapper');
        wrap.innerHTML = '';
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        
        if(currentPage > totalPages) currentPage = totalPages;
        if(totalPages <= 1) return;

        const btnPrev = document.createElement('button');
        btnPrev.className = 'page-btn';
        btnPrev.textContent = 'Anterior';
        btnPrev.disabled = currentPage === 1;
        btnPrev.onclick = () => { if(currentPage > 1) { currentPage--; renderList(); window.scrollTo(0,0); } };
        wrap.appendChild(btnPrev);

        for(let i=1; i<=totalPages; i++) {
            if(totalPages > 7) {
                if(i !== 1 && i !== totalPages && (i < currentPage - 1 || i > currentPage + 1)) {
                    if(i === 2 || i === totalPages - 1) {
                        const dots = document.createElement('span');
                        dots.style.alignSelf = 'center';
                        dots.style.color = 'var(--muted)';
                        dots.textContent = '...';
                        wrap.appendChild(dots);
                    }
                    continue;
                }
            }
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => { currentPage = i; renderList(); window.scrollTo(0,0); };
            wrap.appendChild(btn);
        }

        const btnNext = document.createElement('button');
        btnNext.className = 'page-btn';
        btnNext.textContent = 'Próximo';
        btnNext.disabled = currentPage === totalPages;
        btnNext.onclick = () => { if(currentPage < totalPages) { currentPage++; renderList(); window.scrollTo(0,0); } };
        wrap.appendChild(btnNext);
    }

    function renderList(){
      const fullList = questions.filter(matchesFilter);
      $('qcount').textContent = fullList.length;
      const box = $('qlist');
      box.innerHTML = '';
      
      if(!filter.areaFormacao) {
          box.innerHTML = `<div class="empty"><h3>Nenhum caderno carregado</h3>Por favor, selecione uma <b>Área de Formação</b> acima para listar e responder às questões.</div>`;
          $('pagination-wrapper').innerHTML = '';
          return;
      }

      if(fullList.length === 0){
        box.innerHTML = `<div class="empty"><h3>Nenhuma questão encontrada</h3>Adicione questões ou ajuste os filtros para esta área.</div>`;
        $('pagination-wrapper').innerHTML = '';
        return;
      }

      renderPagination(fullList.length);

      const startIndex = (currentPage - 1) * itemsPerPage;
      const pagedList = fullList.slice(startIndex, startIndex + itemsPerPage);

      pagedList.forEach((q, idx) => {
        const card = document.createElement('div');
        card.className = 'card';
        const globalIdx = startIndex + idx + 1;
        const crumbParts = [q.banca, q.ano, q.disciplina, q.assunto].filter(Boolean);
        const addedAtLabel = formatQuestionAddedAt(q);
        
        const answered = answers[q.id];
        const currentSelection = tempSelections[q.id] || answered;
        const isHidden = hiddenFeedback.has(q.id);
        const lastStatus = lastResults[q.id]; 
        
        let comentariosHtml = '';
        let resultMsgHtml = '';
        let feedbackToggleBtn = '';
        let lastResultBadgeHtml = '';

        if(lastStatus) {
            const classColor = lastStatus === 'acerto' ? 'ok' : 'no';
            const labelText = lastStatus === 'acerto' ? 'Último resultado: Acerto' : 'Último resultado: Erro';
            lastResultBadgeHtml = `<span class="result-msg ${classColor}" style="border:1.5px solid; padding:3px 8px; border-radius:6px; font-size:11px; margin-right:8px;">${labelText}</span>`;
        }

        if (answered) {
            feedbackToggleBtn = `<button class="icon-btn" data-toggle-fb="${q.id}">${isHidden ? 'Mostrar Resposta' : 'Ocultar Resposta'}</button>`;
            
            if (!isHidden) {
                let cleanComentarioGeral = (q.comentario || '').replace(/^(?:(?:correta|incorreta|errada|certo|errado)[\.\-\:]?\s*)+/i, '');
                
                comentariosHtml = `<div class="comentarios-box"><h4>Comentários:</h4>`;
                q.opcoes.forEach(op => {
                    const isCorrect = (op.letra === q.correta);
                    const statusTxt = isCorrect ? 'Correta.' : 'Errada.';
                    const cls = isCorrect ? 'correta' : 'errada';
                    
                    let exp = op.explicacao ? op.explicacao : '';
                    if (!exp && q.comentario) exp = (isCorrect ? cleanComentarioGeral : ''); 
                    
                    exp = exp.replace(/^(?:(?:correta|incorreta|errada|certo|errado)[\.\-\:]?\s*)+/i, '');
                    
                    comentariosHtml += `
                        <div class="comentario-item ${cls}">
                            <span class="letra">${op.letra})</span>
                            <span class="status">${statusTxt}</span>
                            <span class="txt">${escHtml(exp)}</span>
                        </div>
                    `;
                });
                comentariosHtml += `</div>`;
                
                resultMsgHtml = `<span class="result-msg ${answered===q.correta?'ok':'no'}">${answered===q.correta?'Você acertou!':'Você errou. Resposta correta: '+q.correta}</span>`;
            } else {
                resultMsgHtml = `<span style="color:var(--muted);font-size:13px;font-style:italic;">Resposta e comentários ocultos.</span>`;
            }
        } else {
            resultMsgHtml = `<span style="color:var(--muted);font-size:13px;">Selecione uma alternativa e clique em Responder.</span>`;
        }

        // NOVO: Adiciona a área do botão de confirmação "Responder" se houver uma opção clicada mas não confirmada
        let actionButtonHtml = '';
        if(tempSelections[q.id] && !answered) {
            actionButtonHtml = `<div style="margin-top:14px;"><button class="btn btn-primary btn-sm" data-confirm-ans="${q.id}">Responder</button></div>`;
        }
let imageHtml = '';
        if (q.imagem) {
            // Se houver uma imagem salva em Base64, cria a tag <img>
            imageHtml = `<div style="margin-top: 12px; margin-bottom: 16px;"><img src="${q.imagem}" alt="Imagem anexa" style="max-width: 100%; max-height: 400px; border-radius: 8px; border: 1px solid var(--line);"></div>`;
        }
        card.innerHTML = `
          <div class="tab-num">#${globalIdx}</div>
          <div class="crumbs">
            <span class="qid">Q${q.id}</span>
            ${crumbParts.map(c => `<span class="sep">›</span><span>${escHtml(c)}</span>`).join('')}
            ${q.instituicao ? `<span class="sep">›</span><span class="org">${escHtml(q.instituicao)}</span>` : ''}
            ${q.cargo ? `<span class="sep">›</span><span>${escHtml(q.cargo)}</span>` : ''}
            ${addedAtLabel ? `<span class="sep">›</span><span class="added-at" title="Data e hora da inclusão em Salvador, Bahia">Adicionada em ${escHtml(addedAtLabel)}</span>` : ''}
          </div>
          <div class="enun" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
             <span>${escHtml(q.enunciado)}</span>
             ${lastResultBadgeHtml}
          </div>
          ${imageHtml} <!-- IMAGEM RENDERIZADA AQUI, DEBAIXO DO ENUNCIADO -->
          <div class="opts" data-qid="${q.id}"></div>
          ${actionButtonHtml}
          <div class="card-actions" style="margin-top:12px;">
            ${resultMsgHtml}
            <div class="card-tools">
              ${feedbackToggleBtn}
              <button class="icon-btn blue" data-add-cad="${q.id}">+ Caderno</button>
              <button class="icon-btn" data-del="${q.id}">Excluir</button>
            </div>
          </div>
          ${comentariosHtml}
        `;
        
        const optsBox = card.querySelector('.opts');
        q.opcoes.forEach(op => {
          const row = document.createElement('div');
          let cls = '';
          
          if(answered){
            // Se a questão já foi validada
            if(isHidden) {
               if(op.letra === answered) cls = 'selected-hidden'; 
               else cls = 'dim';
            } else {
               if(op.letra === q.correta) cls = 'correct';
               else if(op.letra === answered) cls = 'wrong';
               else cls = 'dim';
            }
          } else if(tempSelections[q.id] === op.letra) {
             // Caso tenha selecionado mas não clicou em "Responder" ainda
             cls = 'selected-hidden';
          }
          
          row.className = 'opt ' + cls;
          row.innerHTML = `<span class="letter">${op.letra}</span><span class="txt">${escHtml(op.texto)}</span>`;
          
          row.onclick = () => {
              if (answers[q.id]) {
                  // MODIFICADO: Se já foi confirmada e o usuário clicar em OUTRA alternativa errada, limpa e reinicia
                  if(op.letra !== q.correta) {
                      delete answers[q.id];
                      persistAnswers();
                      tempSelections[q.id] = op.letra;
                      hiddenFeedback.delete(q.id);
                      renderList();
                  }
                  return;
              }
              
              // Se não foi confirmada ainda, apenas muda a marcação temporária cor de âmbar
              tempSelections[q.id] = op.letra;
              renderList();
          };
          
          optsBox.appendChild(row);
        });

        // Evento do botão de confirmação obrigatório ("Responder")
        const confirmBtn = card.querySelector('[data-confirm-ans]');
        if(confirmBtn) {
            confirmBtn.onclick = () => {
                const selectedLetter = tempSelections[q.id];
                if(!selectedLetter) return;
                
                answers[q.id] = selectedLetter;
                lastResults[q.id] = (selectedLetter === q.correta) ? 'acerto' : 'erro';
                
                persistAnswers();
                persistLastResults();
                delete tempSelections[q.id];
                
                renderList();
                renderPerformanceChart();
            };
        }

        // Toggle Feedback
        const toggleBtn = card.querySelector('[data-toggle-fb]');
        if(toggleBtn) {
            toggleBtn.onclick = () => {
                if(hiddenFeedback.has(q.id)) hiddenFeedback.delete(q.id);
                else hiddenFeedback.add(q.id);
                renderList();
            };
        }

        // Add to Caderno
        card.querySelector('[data-add-cad]').onclick = () => {
          const nomes = Object.keys(cadernos);
          let msg = 'Cadernos existentes: ' + (nomes.length > 0 ? nomes.join(', ') : 'Nenhum');
          
          showCustomPrompt('Adicionar ao Caderno', msg + '\n\nDigite o nome do caderno (existente ou novo):', true, (nome) => {
             if(!nome) return;
             if(!cadernos[nome]) cadernos[nome] = [];
             if(!cadernos[nome].includes(q.id)) {
               cadernos[nome].push(q.id);
               persistCadernos();
               showCustomPrompt('Sucesso', `Questão adicionada ao caderno "${nome}"!`, false, () => {});
             } else {
               showCustomPrompt('Aviso', `A questão já faz parte do caderno "${nome}".`, false, () => {});
             }
          });
        };

        // Delete Question
        card.querySelector('[data-del]').onclick = () => {
          showCustomPrompt('Excluir Questão', 'Tem certeza que deseja excluir esta questão do banco de dados?', false, (res) => {
            if(!res) return;
            questions = questions.filter(x => x.id !== q.id);
            delete answers[q.id];
            delete lastResults[q.id];
            delete tempSelections[q.id];
            Object.keys(cadernos).forEach(c => {
               cadernos[c] = cadernos[c].filter(id => id !== q.id);
            });
            persistQuestions(); persistAnswers(); persistLastResults(); persistCadernos();
            refreshFilterOptions();
            render();
            renderPerformanceChart();
          });
        };

        box.appendChild(card);
      });
    }

    function renderCadernos(){
      const box = $('cadernos-list');
      box.innerHTML = '';
      const nomes = Object.keys(cadernos);
      
      if(nomes.length === 0) {
        box.innerHTML = `<div style="color:var(--muted); font-size: 14px;">Você ainda não possui cadernos.</div>`;
        return;
      }

      nomes.forEach(nome => {
        const chip = document.createElement('div');
        chip.className = 'savedchip';
        chip.innerHTML = `📚 ${escHtml(nome)} (${cadernos[nome].length} questões) <span class="del">✕</span>`;
        
        chip.onclick = () => {
          filter = {palavra:'',banca:'',instituicao:'',disciplina:'',assunto:'',ano:'',status:'',tipo:'',caderno:nome, areaFormacao:''};
          syncFilterInputs();
          currentPage = 1;
          document.querySelector('.tab-btn[data-tab="questoes"]').click();
          render();
        };
        
        chip.querySelector('.del').onclick = (e) => {
          e.stopPropagation();
          showCustomPrompt('Excluir Caderno', `Tem certeza que deseja excluir o caderno "${nome}"?\n(As questões não serão apagadas do banco, apenas o agrupamento)`, false, (res) => {
             if(res){
               delete cadernos[nome];
               persistCadernos();
               renderCadernos();
             }
          });
        };
        box.appendChild(chip);
      });
    }

    $('btn-novo-caderno').onclick = () => {
      showCustomPrompt('Novo Caderno', 'Digite o nome do novo caderno:', true, (nome) => {
         if(nome && !cadernos[nome]){
            cadernos[nome] = [];
            persistCadernos();
            renderCadernos();
         } else if (cadernos[nome]) {
            showCustomPrompt('Erro', 'Já existe um caderno com este nome.', false, () => {});
         }
      });
    };

    // ---- Listeners de filtros ----
    $('f-area-formacao').addEventListener('change', e => {
        filter.areaFormacao = e.target.value;
        currentPage = 1;
        ['f-banca', 'f-instituicao', 'f-disciplina', 'f-assunto', 'f-ano'].forEach(id => $(id).value = '');
        ['banca', 'instituicao', 'disciplina', 'assunto', 'ano'].forEach(k => filter[k] = '');
        
        refreshFilterOptions();
        render();
    });

    $('f-palavra').addEventListener('input', e => { filter.palavra = e.target.value; currentPage=1; render(); });
    $('f-status').addEventListener('change', e => { filter.status = e.target.value; currentPage=1; render(); });
    $('f-tipo').addEventListener('change', e => { filter.tipo = e.target.value; currentPage=1; render(); });
    
    $('f-per-page').addEventListener('change', e => { 
        itemsPerPage = parseInt(e.target.value, 10); 
        localStorage.setItem('bq-per-page', itemsPerPage);
        currentPage = 1; 
        renderList(); 
    });

    $('btn-limpar').onclick = () => {
      filter = {palavra:'',banca:'',instituicao:'',disciplina:'',assunto:'',ano:'',status:'',tipo:'',caderno:'', areaFormacao:''};
      tempSelections = {};
      syncFilterInputs(); currentPage=1; render();
    };

    $('btn-salvar-filtro').onclick = () => {
      const hasAny = Object.values(filter).some(v => v);
      if(!hasAny){ 
         showCustomPrompt('Aviso', 'Aplique ao menos um filtro antes de salvar.', false, () => {}); 
         return; 
      }
      showCustomPrompt('Salvar Filtro', 'Nome para este filtro:', true, (nome) => {
         if(!nome) return;
         savedFilters.push({id: Date.now().toString(36), nome, filtro: Object.assign({}, filter)});
         persistFilters();
         renderChips();
      });
    };

    function render(){
      renderChips();
      renderList();
    }
    function isDuplicate(text) {
        const cleanText = text.trim().toLowerCase();
        return questions.some(q => (q.enunciado || '').trim().toLowerCase() === cleanText);
    }

    // ---- tabs ----
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const t = btn.dataset.tab;
        $('view-questoes').style.display = t === 'questoes' ? '' : 'none';
        $('view-nova').style.display = t === 'nova' ? '' : 'none';
        $('view-importar').style.display = t === 'importar' ? '' : 'none';
        $('view-cadernos').style.display = t === 'cadernos' ? '' : 'none';
        
        if (t === 'cadernos') {
           renderCadernos();
        }
      };
    });

    // ---- new question form: option builder ----
    function renderOptBuild(){
      const box = $('optbuild');
      box.innerHTML = '';
      for(let i=0;i<optCount;i++){
        const letter = LETTERS[i];
        const col = document.createElement('div');
        col.className = 'optbuild-col';
        col.innerHTML = `
          <div class="optbuild-row">
            <span class="letter-badge">${letter}</span>
            <input type="radio" name="correta" value="${letter}" ${i===0?'checked':''}>
            <input type="text" placeholder="Texto da alternativa ${letter}" data-letter="${letter}">
            ${optCount > 2 ? `<button class="rm" type="button" data-rm="${i}">✕</button>` : ''}
          </div>
          <input type="text" class="optbuild-expl" placeholder="Explicação desta alternativa (opcional)" data-expl="${letter}">
        `;
        box.appendChild(col);
      }
      box.querySelectorAll('[data-rm]').forEach(b => {
        b.onclick = () => { optCount = Math.max(2, optCount-1); renderOptBuild(); };
      });
    }
    $('btn-add-opt').onclick = () => { if(optCount < 6){ optCount++; renderOptBuild(); } };
    renderOptBuild();

    function clearForm(){
      ['n-banca','n-instituicao','n-ano','n-disciplina','n-assunto','n-cargo','n-enunciado','n-comentario'].forEach(id => $(id).value = '');
      optCount = 5;
      renderOptBuild();
    }
    $('btn-limpar-form').onclick = clearForm;

    $('btn-salvar-questao').onclick = () => {
      const enunciado = $('n-enunciado').value.trim();
      if(!enunciado){ showCustomPrompt('Erro', 'Digite o enunciado da questão.', false, ()=>{}); return; }
      if(isDuplicate(enunciado)) {
          showCustomPrompt('Erro', 'Uma questão com este mesmo enunciado já existe no seu banco de dados.', false, ()=>{});
          return;
      }
      const cols = Array.from(document.querySelectorAll('.optbuild-col'));
      const opcoes = cols.map(c => ({
        letra: c.querySelector('.letter-badge').textContent,
        texto: c.querySelector('input[data-letter]').value.trim(),
        explicacao: c.querySelector('input[data-expl]').value.trim()
      })).filter(o => o.texto);
      if(opcoes.length < 2){ showCustomPrompt('Erro', 'Adicione ao menos duas alternativas preenchidas.', false, ()=>{}); return; }
      const correta = (document.querySelector('input[name=correta]:checked') || {}).value;
      if(!correta || !opcoes.find(o => o.letra === correta)){ showCustomPrompt('Erro', 'Marque a alternativa correta (ela precisa ter texto preenchido).', false, ()=>{}); return; }

      const q = {
        id: Date.now().toString(36).toUpperCase(),
        banca: $('n-banca').value.trim(),
        instituicao: $('n-instituicao').value.trim(),
        ano: $('n-ano').value.trim(),
        disciplina: $('n-disciplina').value.trim(),
        assunto: $('n-assunto').value.trim(),
        cargo: $('n-cargo').value.trim(),
        enunciado,
        opcoes,
        correta,
        comentario: $('n-comentario').value.trim(),
        adicionadoEm: new Date().toISOString()
      };
      questions.unshift(q);
      persistQuestions();
      clearForm();
      refreshFilterOptions();
      document.querySelector('.tab-btn[data-tab="questoes"]').click();
      currentPage = 1;
      render();
    };

    // ---- import JSON ----
    $('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => { $('import-json').value = reader.result; };
      reader.readAsText(file);
    });

$('btn-limpar-import').onclick = () => {
  $('import-json').value = '';
  $('import-file').value = '';
  $('import-status').textContent = '';
  $('import-area').value = ''; // NOVO
};

    function validateAndNormalize(item, idx, areaEscolhida){
  const errors = [];
  if(!item.enunciado || !String(item.enunciado).trim()) errors.push(`item ${idx}: falta "enunciado"`);
  if(!Array.isArray(item.opcoes) || item.opcoes.length < 2) errors.push(`item ${idx}: precisa de ao menos 2 "opcoes"`);
  else {
    item.opcoes.forEach((o,i) => {
      if(!o.letra || !o.texto) errors.push(`item ${idx}: opcao ${i} precisa de "letra" e "texto"`);
    });
  }
  if(!item.correta) errors.push(`item ${idx}: falta "correta"`);
  else if(Array.isArray(item.opcoes) && !item.opcoes.find(o => o.letra === item.correta)){
    errors.push(`item ${idx}: "correta" (${item.correta}) não corresponde a nenhuma letra em "opcoes"`);
  }
  if(errors.length) return {ok:false, errors};
  
  return {ok:true, question:{
    id: item.id ? String(item.id) : (Date.now().toString(36) + idx).toUpperCase(),
    banca: (item.banca||'').toString().trim(),
    instituicao: (item.instituicao||'').toString().trim(),
    ano: (item.ano||'').toString().trim(),
    disciplina: (item.disciplina||'').toString().trim(),
    assunto: (item.assunto||'').toString().trim(),
    cargo: (item.cargo||'').toString().trim(),
    adicionadoEm: new Date(Date.now() + idx).toISOString(),
    enunciado: String(item.enunciado).trim(),
    opcoes: item.opcoes.map(o => ({
      letra: String(o.letra).trim().toUpperCase(), 
      texto: String(o.texto).trim(),
      explicacao: o.explicacao ? String(o.explicacao).trim() : ''
    })),
    correta: String(item.correta).trim().toUpperCase(),
    comentario: (item.comentario||'').toString().trim(),
    tipo: (item.tipo || item.tipoQuestao || '').toString().trim(),
    areaFormacao: areaEscolhida // NOVO: Carimba a área na questão
  }};
}

  $('btn-importar').onclick = () => {
  // NOVA VALIDAÇÃO: Obriga a escolha da área
  const areaSelecionada = $('import-area').value;
  if (!areaSelecionada) {
    showCustomPrompt('Aviso', 'Selecione a Área de Formação antes de importar as questões.', false, () => {});
    return;
  }

  const raw = $('import-json').value.trim();
  const statusEl = $('import-status');
  if(!raw){ statusEl.textContent = 'Cole ou envie um JSON primeiro.'; statusEl.style.color = 'var(--red)'; return; }
  let data;
  try{ data = JSON.parse(raw); }
  catch(e){ statusEl.textContent = 'JSON inválido: ' + e.message; statusEl.style.color = 'var(--red)'; return; }
  if(!Array.isArray(data)){ data = [data]; }

  const toAdd = [];
  const allErrors = [];
  
  data.forEach((item, i) => {
    // Passa a área selecionada para a função de normalização
    const r = validateAndNormalize(item, i+1, areaSelecionada);
    
    if(r.ok) {
        const cleanText = r.question.enunciado.trim().toLowerCase();
        const dupInNew = toAdd.some(q => (q.enunciado || '').trim().toLowerCase() === cleanText);
        
        if(isDuplicate(r.question.enunciado) || dupInNew) {
            allErrors.push(`item ${i+1}: ignorado (questão duplicada)`);
        } else {
            toAdd.push(r.question);
        }
    }
    else allErrors.push(...r.errors);
  });

  if(toAdd.length){
    questions = toAdd.concat(questions);
    persistQuestions();
    refreshFilterOptions();
    currentPage = 1;
    render();
    renderPerformanceChart();
  }

  if(allErrors.length){
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = `${toAdd.length} importada(s), ${allErrors.length} erro(s): ` + allErrors.slice(0,4).join(' | ') + (allErrors.length>4 ? ' ...' : '');
  } else {
    statusEl.style.color = 'var(--green)';
    statusEl.textContent = `${toAdd.length} questão(ões) importada(s) com sucesso.`;
    $('import-json').value = '';
    $('import-file').value = '';
    $('import-area').value = ''; // Limpa a área após sucesso
  }
};
// ---- Importar JSON + Imagem ----
    $('btn-limpar-import-img').onclick = () => {
      $('import-json-img').value = '';
      $('import-file-img').value = '';
      $('import-status-img').textContent = '';
      $('import-area-img').value = '';
    };

    $('btn-importar-img').onclick = () => {
      const areaSelecionada = $('import-area-img').value;
      const rawJson = $('import-json-img').value.trim();
      const fileInput = $('import-file-img');
      const statusEl = $('import-status-img');

      if (!areaSelecionada) {
        showCustomPrompt('Aviso', 'Selecione a Área de Formação primeiro.', false, () => {});
        return;
      }
      if (!rawJson) {
        statusEl.textContent = 'Cole o JSON da questão.'; statusEl.style.color = 'var(--red)'; return;
      }
      if (!fileInput.files || fileInput.files.length === 0) {
        statusEl.textContent = 'Selecione um arquivo de imagem.'; statusEl.style.color = 'var(--red)'; return;
      }

      let data;
      try { data = JSON.parse(rawJson); }
      catch(e) { statusEl.textContent = 'JSON inválido: ' + e.message; statusEl.style.color = 'var(--red)'; return; }

      // Se o usuário colar um array, pegamos o primeiro item. Se colar o objeto direto, pegamos ele.
      let qData = Array.isArray(data) ? data[0] : data;
      const file = fileInput.files[0];

      // File Reader converte a imagem para Base64 (Texto)
      const reader = new FileReader();
      
      reader.onload = function(e) {
        const base64Image = e.target.result;
        
        // Usa a validação existente passando a área
        const r = validateAndNormalize(qData, 1, areaSelecionada);
        
        if (r.ok) {
          if (isDuplicate(r.question.enunciado)) {
            statusEl.textContent = 'Erro: Esta questão já existe no banco (enunciado duplicado).'; 
            statusEl.style.color = 'var(--red)';
          } else {
            // Anexa a imagem em formato de texto à questão
            r.question.imagem = base64Image;
            
            // Adiciona a questão e salva
            questions.unshift(r.question);
            persistQuestions();
            refreshFilterOptions();
            currentPage = 1;
            render();
            renderPerformanceChart();

            statusEl.textContent = 'Sucesso! Questão salva com imagem.';
            statusEl.style.color = 'var(--green)';
            
            // Limpa o form após 2 segundos
            setTimeout(() => { $('btn-limpar-import-img').click(); }, 2000);
          }
        } else {
          statusEl.textContent = 'Erro no JSON: ' + r.errors.join(', ');
          statusEl.style.color = 'var(--red)';
        }
      };

      reader.onerror = function() {
        statusEl.textContent = 'Falha ao processar o arquivo de imagem.'; 
        statusEl.style.color = 'var(--red)';
      };

      // Inicia a leitura da imagem
      reader.readAsDataURL(file);
    };
    // ---- init ----
   (async function init(){
    loadAll();

    // Reinicia todas as respostas ao abrir o sistema
    answers = {};
    lastResults = {};
    tempSelections = {};

    persistAnswers();
    persistLastResults();

    await loadQuestionsFromServer();
    refreshFilterOptions();
    syncFilterInputs();
    render();
    renderPerformanceChart();
})();

})();
// =======================
// Tema Escuro
// =======================

(function(){

    const btn = document.getElementById("theme-toggle");

    function applyTheme(theme){
        if(theme === "dark"){
            document.body.classList.add("dark");
            btn.textContent = "☀️";
        }else{
            document.body.classList.remove("dark");
            btn.textContent = "🌙";
        }
    }

    const savedTheme = localStorage.getItem("bq-theme") || "light";
    applyTheme(savedTheme);

    btn.onclick = () => {
        const dark = document.body.classList.toggle("dark");
        const theme = dark ? "dark" : "light";

        localStorage.setItem("bq-theme", theme);
        applyTheme(theme);
    };

})();