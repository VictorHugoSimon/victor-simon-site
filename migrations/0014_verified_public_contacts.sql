PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crm_verified_public_contacts (
  id TEXT PRIMARY KEY,
  host_key TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  linkedin_url TEXT,
  email TEXT,
  evidence_url TEXT NOT NULL,
  signal_description TEXT NOT NULL,
  signal_score INTEGER NOT NULL DEFAULT 75 CHECK (signal_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'verified',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  last_verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(host_key, name, role)
);

CREATE INDEX IF NOT EXISTS idx_crm_verified_contacts_host ON crm_verified_public_contacts(host_key, status, signal_score DESC);

INSERT OR IGNORE INTO crm_verified_public_contacts (
  id, host_key, name, role, linkedin_url, evidence_url, signal_description, signal_score, metadata_json
) VALUES
(
  'verified_bp_paulo_macedo',
  'bpbunge.com.br',
  'Paulo Macedo',
  'Diretor de Tecnologia da Informação e Digital',
  'https://br.linkedin.com/in/paulo-slg-macedo/pt',
  'https://pt.linkedin.com/posts/bp-bioenergy_bpbioenergy-inova%C3%A7%C3%A3o-intelig%C3%AAnciaartificial-activity-7463189514656735233-rMb3',
  'Diretor de TI da bp bioenergy com atuação pública em inteligência artificial, soluções digitais, analytics, conectividade e gestão integrada das operações.',
  94,
  '{"verification":"public_professional_and_corporate_sources","verifiedAt":"2026-08-30","outbound":"human_approval_required"}'
),
(
  'verified_saomartinho_luis_teixeira',
  'saomartinho.com.br',
  'Luís Gustavo Teixeira',
  'Diretor Agroindustrial de Tecnologia e Inovação',
  'https://br.linkedin.com/in/lu%C3%ADs-gustavo-teixeira-72b75014',
  'https://pt.linkedin.com/posts/saomartinho_x-simp%C3%B3sio-cerrado-activity-7488216926268248065-mcuB',
  'Liderança de tecnologia e inovação agroindustrial com atuação pública em integração de processos, inovação e eficiência operacional.',
  92,
  '{"verification":"public_professional_and_corporate_sources","verifiedAt":"2026-08-30","outbound":"human_approval_required"}'
),
(
  'verified_saomartinho_carlos_faroni',
  'saomartinho.com.br',
  'Carlos Eduardo Faroni',
  'Gerente de Tecnologia e Processos Agrícolas',
  'https://br.linkedin.com/in/carlos-eduardo-faroni-9ba2551a',
  'https://br.linkedin.com/in/carlos-eduardo-faroni-9ba2551a',
  'Profissional da São Martinho com atuação pública ligada a tecnologia e processos agrícolas.',
  84,
  '{"verification":"public_professional_profile","verifiedAt":"2026-08-30","outbound":"human_approval_required"}'
),
(
  'verified_cerradinho_sebastiao_castro',
  'cerradinhobio.com.br',
  'Sebastião Abílio de Castro Junior',
  'Diretor Industrial do Milho e Projetos',
  NULL,
  'https://www.cerradinhobio.com.br/governanca-corporativa/diretoria-executiva/',
  'Diretor com experiência pública em gestão de projetos, implantação industrial, operações agroindustriais e otimização de processos.',
  90,
  '{"verification":"official_executive_board","verifiedAt":"2026-08-30","outbound":"human_approval_required"}'
);
