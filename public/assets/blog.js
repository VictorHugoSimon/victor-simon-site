const API_BASE = document.querySelector('meta[name="api-base"]')?.content?.replace(/\/+$/, '') || '';
let language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'pt';
let activeCategory = 'all';

const source = [
  {
    category: 'PMO',
    slug: 'pmo-que-decide',
    pt: ['PMO que decide: como sair do painel bonito para a governança real', 'Governança não é acumular indicadores. É criar um sistema que torne decisões, riscos e responsabilidades visíveis no momento certo.', `Um PMO ganha valor quando deixa de ser apenas um produtor de relatórios e passa a funcionar como um mecanismo de decisão. Isso começa pela definição clara do que precisa subir para a liderança, o que deve ser resolvido pelo time e quais sinais indicam necessidade de intervenção.\n\nUm bom painel executivo não precisa ter dezenas de gráficos. Precisa mostrar poucos indicadores capazes de responder perguntas objetivas: onde estamos, o que está atrasando, qual risco ameaça o resultado, quem precisa agir e qual decisão está pendente. Roadmap, riscos, RACI, marcos e próximos passos devem conversar entre si.\n\nA cadência também é parte da governança. Reuniões semanais ou quinzenais precisam ter propósito explícito, dados atualizados e decisões registradas. Quando a reunião serve apenas para narrar status, o projeto perde velocidade. Quando ela existe para remover bloqueios e alinhar decisões, a governança passa a proteger a entrega.\n\nA maturidade do PMO aparece quando a liderança consegue olhar uma única visão, entender o cenário e agir. O objetivo não é produzir mais gestão; é reduzir incerteza e aumentar previsibilidade.`],
    en: ['Decision-making PMO: moving from pretty dashboards to real governance', 'Governance is not about accumulating indicators. It is about building a system that makes decisions, risks and accountability visible at the right time.', `A PMO creates value when it stops being only a reporting function and becomes a decision mechanism. That requires clarity about what leadership needs to see, what teams should solve, and which signals require escalation.\n\nExecutive dashboards do not need dozens of charts. They need a small set of indicators that answer where we are, what is delayed, which risks threaten outcomes, who must act and what decision is pending.\n\nCadence is also governance. Meetings should exist to remove blockers and make decisions, not simply narrate status.\n\nPMO maturity appears when leadership can understand the scenario and act from one trusted view.`]
  },
  {
    category: 'IA', slug: 'ia-aplicada-comece-pelo-problema',
    pt: ['IA aplicada: comece pelo problema, não pelo modelo', 'O melhor projeto de IA não começa escolhendo tecnologia. Começa definindo uma dor operacional que vale a pena resolver.', `É fácil transformar IA em uma busca por ferramentas. O caminho mais seguro é inverter a lógica: primeiro mapear a atividade, o volume, o custo, o risco e a qualidade esperada; depois decidir onde inteligência artificial realmente ajuda.\n\nCasos fortes normalmente têm padrão repetitivo, alto volume de informação, necessidade de triagem, geração de primeira versão ou apoio à decisão. Suporte, gestão de conhecimento, análise documental, conteúdo e operação são bons exemplos.\n\nTambém é importante definir onde o humano entra. Nem toda automação deve terminar em publicação ou decisão automática. Em muitos cenários, a IA cria, classifica ou recomenda e uma pessoa aprova. Esse desenho reduz risco e cria confiança para evoluir.\n\nA pergunta principal não é qual modelo usar. É qual resultado queremos melhorar, como vamos medir e qual nível de autonomia é aceitável.`],
    en: ['Applied AI: start with the problem, not the model', 'The best AI project does not start by choosing technology. It starts by defining an operational problem worth solving.', `AI initiatives are often reduced to tool selection. A stronger approach starts by mapping the activity, volume, cost, risk and expected quality, then deciding where AI can create leverage.\n\nStrong use cases usually involve repetitive patterns, information-heavy work, triage, first drafts or decision support.\n\nHuman oversight must be designed explicitly. In many cases AI should create, classify or recommend while a person approves.\n\nThe main question is not which model to use. It is which outcome we want to improve, how we will measure it and what autonomy level is acceptable.`]
  },
  {
    category: 'Produto', slug: 'backlog-orientado-a-valor',
    pt: ['Backlog orientado a valor, não a volume', 'Um backlog grande pode transmitir sensação de controle, mas volume não é estratégia.', `Backlog é uma ferramenta de priorização, não um arquivo histórico de tudo que alguém já pediu. Quando ele cresce sem critério, o time perde capacidade de distinguir prioridade de ruído.\n\nItens deveriam carregar contexto suficiente para responder qual problema resolvem, para quem, qual impacto esperado e como saberemos se funcionou. Isso muda a conversa de quantidade de entregas para resultado.\n\nPriorização também exige coragem para dizer não, adiar ou eliminar. Capacidade é limitada e cada item escolhido impede outro de ser feito.\n\nUm backlog saudável é compreensível, ordenado e conectado à estratégia. O objetivo não é manter o time ocupado; é maximizar valor entregue.`],
    en: ['A backlog driven by value, not volume', 'A large backlog may create a sense of control, but volume is not strategy.', `A backlog is a prioritization tool, not a historical archive of every request. When it grows without criteria, teams lose the ability to separate priorities from noise.\n\nItems should explain the problem, target user, expected impact and how success will be measured.\n\nPrioritization also requires the courage to say no, postpone or delete.\n\nA healthy backlog is understandable, ordered and connected to strategy. The goal is not to keep teams busy; it is to maximize delivered value.`]
  },
  {
    category: 'Dados', slug: 'paineis-executivos-menos-indicadores',
    pt: ['Painéis executivos: menos indicadores, mais decisão', 'Dashboard executivo não é inventário de dados. É uma interface de decisão.', `Quando tudo vira KPI, nada é prioridade. Um painel executivo deve começar pelas decisões que a liderança precisa tomar e trabalhar de trás para frente.\n\nIndicadores precisam ter dono, definição, periodicidade e regra de interpretação. Sem isso, duas áreas podem olhar o mesmo número e chegar a conclusões diferentes.\n\nTambém é útil separar indicadores de resultado, tendência e risco. Resultado mostra o que aconteceu; tendência ajuda a antecipar; risco indica onde agir antes do impacto.\n\nO melhor dashboard é aquele que reduz perguntas repetitivas e aumenta a qualidade da conversa de gestão.`],
    en: ['Executive dashboards: fewer metrics, better decisions', 'An executive dashboard is not a data inventory. It is a decision interface.', `When everything becomes a KPI, nothing is a priority. Executive dashboards should start from the decisions leadership needs to make and work backwards.\n\nMetrics need ownership, definitions, cadence and interpretation rules.\n\nIt also helps to separate outcome, trend and risk indicators.\n\nThe best dashboard reduces repetitive questions and improves the quality of management conversations.`]
  },
  {
    category: 'Tecnologia', slug: 'deploy-automatico-e-governanca',
    pt: ['Deploy automático é governança, não luxo', 'Automatizar publicação reduz variação, cria evidência e torna mudanças mais previsíveis.', `Deploy manual depende de memória, sequência correta e atenção humana em todas as etapas. Quanto mais crítico o ambiente, maior o risco desse modelo.\n\nUma esteira automatizada deve validar código, executar testes, aplicar controles de segurança, registrar a versão e publicar de forma reproduzível. Stage e produção precisam ter separação clara.\n\nO ganho não é apenas velocidade. É rastreabilidade: saber exatamente qual commit foi publicado, quais testes passaram e qual procedimento usar em caso de rollback.\n\nAutomação bem desenhada transforma uma atividade operacional em um controle de governança.`],
    en: ['Automated deployment is governance, not a luxury', 'Automating releases reduces variation, creates evidence and makes changes more predictable.', `Manual deployment depends on memory, correct sequencing and human attention at every step. The more critical the environment, the higher the risk.\n\nAn automated pipeline should validate code, run tests, enforce controls, register the version and publish reproducibly.\n\nThe benefit is not only speed. It is traceability.\n\nWell-designed automation turns an operational activity into a governance control.`]
  }
];

function buildFallbackPosts() {
  return source.map((item, index) => {
    const [title, excerpt, content] = item[language];
    return { id: `fallback-${index + 1}`, slug: item.slug, category: item.category, title, excerpt, content, published_at: new Date(Date.UTC(2026, 7, 26 - index)).toISOString() };
  });
}

let posts = buildFallbackPosts();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function articleHtml(content) {
  return String(content || '').split(/\n{2,}/).filter(Boolean).map((paragraph) => `<p style="margin-bottom:1.2rem">${escapeHtml(paragraph)}</p>`).join('');
}

function applyLanguage() {
  document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
  document.querySelectorAll('[data-pt][data-en]').forEach((element) => { element.textContent = element.dataset[language]; });
  const next = new URL(location.href); next.searchParams.set('lang', language); history.replaceState({}, '', next);
}

function showArticle(post) {
  if (!post) return;
  document.querySelector('#blogIndex').style.display = 'none';
  document.querySelector('#articleView').style.display = 'block';
  document.querySelector('#articleCategory').textContent = post.category || 'Insight';
  document.querySelector('#articleTitle').textContent = post.title;
  document.querySelector('#articleExcerpt').textContent = post.excerpt || '';
  document.querySelector('#articleDate').textContent = new Date(post.published_at || Date.now()).toLocaleDateString(language === 'en' ? 'en-US' : 'pt-BR');
  document.querySelector('#articleContent').innerHTML = articleHtml(post.content || post.excerpt || '');
  document.title = `${post.title} | Victor Hugo Simon`;
}

function render() {
  const postKey = new URLSearchParams(location.search).get('post');
  if (postKey) {
    const match = posts.find((post) => post.slug === postKey || post.id === postKey);
    if (match) { showArticle(match); return; }
  }
  document.querySelector('#blogIndex').style.display = 'block';
  document.querySelector('#articleView').style.display = 'none';
  const categories = ['all', ...new Set(posts.map((post) => post.category).filter(Boolean))];
  document.querySelector('#filters').innerHTML = categories.map((category) => `<button type="button" class="filter ${category === activeCategory ? 'active' : ''}" data-category="${escapeHtml(category)}">${category === 'all' ? (language === 'en' ? 'All' : 'Todos') : escapeHtml(category)}</button>`).join('');
  document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => { activeCategory = button.dataset.category; render(); }));
  const visible = activeCategory === 'all' ? posts : posts.filter((post) => post.category === activeCategory);
  document.querySelector('#postsGrid').innerHTML = visible.map((post) => `<a class="card post-card" href="/blog.html?lang=${language}&post=${encodeURIComponent(post.slug || post.id)}"><div class="card-index">${escapeHtml(post.category || 'Insight')}</div><h3>${escapeHtml(post.title)}</h3><p class="muted">${escapeHtml(post.excerpt || '')}</p><div class="post-meta">${new Date(post.published_at || Date.now()).toLocaleDateString(language === 'en' ? 'en-US' : 'pt-BR')} · ${language === 'en' ? 'Read article →' : 'Ler artigo →'}</div></a>`).join('');
  document.querySelector('#postsStatus').textContent = visible.length ? '' : (language === 'en' ? 'No posts found.' : 'Nenhum conteúdo encontrado.');
}

document.querySelector('#langToggle')?.addEventListener('click', () => {
  language = language === 'pt' ? 'en' : 'pt';
  posts = buildFallbackPosts();
  applyLanguage();
  loadPosts();
});

async function loadPosts() {
  if (!API_BASE || API_BASE.includes('example.invalid')) { render(); return; }
  try {
    const response = await fetch(`${API_BASE}/api/posts?lang=${language}`);
    const data = await response.json();
    if (response.ok && data.posts?.length) posts = data.posts;
  } catch { /* Mantém artigos evergreen mesmo sem API. */ }
  render();
}

applyLanguage();
loadPosts();
