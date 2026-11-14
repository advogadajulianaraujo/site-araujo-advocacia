-- Painel jurídico — banco novo (Supabase / PostgreSQL), gerado do ESQUEMA do Code.gs (versão 8.27.0).
-- Uma tabela por aba da planilha, com as MESMAS colunas (texto), mais:
--   escritorio_id  = de qual escritório é a linha (vários escritórios no mesmo banco)
--   _n             = número da linha na planilha;  _sinc = carimbo da última cópia
-- A senha (hash/salt) dos usuários NUNCA vem para cá. Rodar UMA vez no Supabase › SQL Editor › New query › colar tudo › Run.
-- Pode rodar de novo sem perder nada (só cria o que falta). Nenhum dado de cliente está neste arquivo.

create extension if not exists pgcrypto;
create table if not exists escritorios (id uuid primary key default gen_random_uuid(), nome text not null, criado_em timestamptz default now());
alter table escritorios enable row level security;

create table if not exists config (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "chave" text,
  "valor" text,
  "descricao" text,
  primary key (escritorio_id, _n)
);
alter table config add column if not exists "chave" text;
alter table config add column if not exists "valor" text;
alter table config add column if not exists "descricao" text;
alter table config enable row level security;
drop policy if exists "config: só o próprio escritório" on config; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists usuarios (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "usuario" text,
  "nome" text,
  "perfil" text,
  "ativo" text,
  "tentativas" text,
  "bloqueado_ate" text,
  "criado_em" text,
  "ultimo_acesso" text,
  "sessao_versao" text,
  "email" text,
  "resumo_email" text,
  primary key (escritorio_id, "id")
);
alter table usuarios add column if not exists "id" text;
alter table usuarios add column if not exists "usuario" text;
alter table usuarios add column if not exists "nome" text;
alter table usuarios add column if not exists "perfil" text;
alter table usuarios add column if not exists "ativo" text;
alter table usuarios add column if not exists "tentativas" text;
alter table usuarios add column if not exists "bloqueado_ate" text;
alter table usuarios add column if not exists "criado_em" text;
alter table usuarios add column if not exists "ultimo_acesso" text;
alter table usuarios add column if not exists "sessao_versao" text;
alter table usuarios add column if not exists "email" text;
alter table usuarios add column if not exists "resumo_email" text;
alter table usuarios enable row level security;
drop policy if exists "usuarios: só o próprio escritório" on usuarios; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists obs_arquivo (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "cliente_id" text,
  "texto" text,
  "arquivado_em" text,
  primary key (escritorio_id, "id")
);
alter table obs_arquivo add column if not exists "id" text;
alter table obs_arquivo add column if not exists "cliente_id" text;
alter table obs_arquivo add column if not exists "texto" text;
alter table obs_arquivo add column if not exists "arquivado_em" text;
alter table obs_arquivo enable row level security;
drop policy if exists "obs_arquivo: só o próprio escritório" on obs_arquivo; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists clientes (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "tipo" text,
  "nome" text,
  "cpf_cnpj" text,
  "rg" text,
  "nascimento" text,
  "estado_civil" text,
  "profissao" text,
  "representante" text,
  "cep" text,
  "endereco" text,
  "cidade" text,
  "uf" text,
  "telefone" text,
  "email" text,
  "origem" text,
  "area" text,
  "pasta_id" text,
  "pasta_url" text,
  "observacoes" text,
  "situacao" text,
  "criado_em" text,
  "atualizado_em" text,
  "atualizado_por" text,
  "tipo_acao" text,
  "resumo_caso" text,
  "providencias" text,
  "genero" text,
  "acesso_hash" text,
  "acesso_criado_em" text,
  "como_conheceu" text,
  "asaas_id" text,
  primary key (escritorio_id, "id")
);
alter table clientes add column if not exists "id" text;
alter table clientes add column if not exists "tipo" text;
alter table clientes add column if not exists "nome" text;
alter table clientes add column if not exists "cpf_cnpj" text;
alter table clientes add column if not exists "rg" text;
alter table clientes add column if not exists "nascimento" text;
alter table clientes add column if not exists "estado_civil" text;
alter table clientes add column if not exists "profissao" text;
alter table clientes add column if not exists "representante" text;
alter table clientes add column if not exists "cep" text;
alter table clientes add column if not exists "endereco" text;
alter table clientes add column if not exists "cidade" text;
alter table clientes add column if not exists "uf" text;
alter table clientes add column if not exists "telefone" text;
alter table clientes add column if not exists "email" text;
alter table clientes add column if not exists "origem" text;
alter table clientes add column if not exists "area" text;
alter table clientes add column if not exists "pasta_id" text;
alter table clientes add column if not exists "pasta_url" text;
alter table clientes add column if not exists "observacoes" text;
alter table clientes add column if not exists "situacao" text;
alter table clientes add column if not exists "criado_em" text;
alter table clientes add column if not exists "atualizado_em" text;
alter table clientes add column if not exists "atualizado_por" text;
alter table clientes add column if not exists "tipo_acao" text;
alter table clientes add column if not exists "resumo_caso" text;
alter table clientes add column if not exists "providencias" text;
alter table clientes add column if not exists "genero" text;
alter table clientes add column if not exists "acesso_hash" text;
alter table clientes add column if not exists "acesso_criado_em" text;
alter table clientes add column if not exists "como_conheceu" text;
alter table clientes add column if not exists "asaas_id" text;
alter table clientes enable row level security;
drop policy if exists "clientes: só o próprio escritório" on clientes; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists processos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "cliente_id" text,
  "cliente_nome" text,
  "numero" text,
  "tribunal" text,
  "sistema" text,
  "orgao" text,
  "area" text,
  "polo" text,
  "parte_contraria" text,
  "proximo_ato" text,
  "proximo_ato_data" text,
  "status" text,
  "observacoes" text,
  "origem" text,
  "criado_em" text,
  "atualizado_em" text,
  "atualizado_por" text,
  "ultimo_movimento" text,
  "ultimo_movimento_em" text,
  "classe" text,
  "andamentos" text,
  "datajud_em" text,
  "fase" text,
  "fase_auto" text,
  "responsavel" text,
  "avisado_mov_em" text,
  "fluxo_fase" text,
  primary key (escritorio_id, "id")
);
alter table processos add column if not exists "id" text;
alter table processos add column if not exists "cliente_id" text;
alter table processos add column if not exists "cliente_nome" text;
alter table processos add column if not exists "numero" text;
alter table processos add column if not exists "tribunal" text;
alter table processos add column if not exists "sistema" text;
alter table processos add column if not exists "orgao" text;
alter table processos add column if not exists "area" text;
alter table processos add column if not exists "polo" text;
alter table processos add column if not exists "parte_contraria" text;
alter table processos add column if not exists "proximo_ato" text;
alter table processos add column if not exists "proximo_ato_data" text;
alter table processos add column if not exists "status" text;
alter table processos add column if not exists "observacoes" text;
alter table processos add column if not exists "origem" text;
alter table processos add column if not exists "criado_em" text;
alter table processos add column if not exists "atualizado_em" text;
alter table processos add column if not exists "atualizado_por" text;
alter table processos add column if not exists "ultimo_movimento" text;
alter table processos add column if not exists "ultimo_movimento_em" text;
alter table processos add column if not exists "classe" text;
alter table processos add column if not exists "andamentos" text;
alter table processos add column if not exists "datajud_em" text;
alter table processos add column if not exists "fase" text;
alter table processos add column if not exists "fase_auto" text;
alter table processos add column if not exists "responsavel" text;
alter table processos add column if not exists "avisado_mov_em" text;
alter table processos add column if not exists "fluxo_fase" text;
alter table processos enable row level security;
drop policy if exists "processos: só o próprio escritório" on processos; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists intimacoes (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "chave" text,
  "fonte" text,
  "recebido_em" text,
  "numero" text,
  "tribunal" text,
  "movimento" text,
  "evento" text,
  "texto" text,
  "partes_cliente" text,
  "processo_id" text,
  "prazo_id" text,
  "criado_em" text,
  "resumo_ia" text,
  "terminada_por" text,
  "terminada_em" text,
  "ok_por" text,
  "ok_em" text,
  primary key (escritorio_id, "id")
);
alter table intimacoes add column if not exists "id" text;
alter table intimacoes add column if not exists "chave" text;
alter table intimacoes add column if not exists "fonte" text;
alter table intimacoes add column if not exists "recebido_em" text;
alter table intimacoes add column if not exists "numero" text;
alter table intimacoes add column if not exists "tribunal" text;
alter table intimacoes add column if not exists "movimento" text;
alter table intimacoes add column if not exists "evento" text;
alter table intimacoes add column if not exists "texto" text;
alter table intimacoes add column if not exists "partes_cliente" text;
alter table intimacoes add column if not exists "processo_id" text;
alter table intimacoes add column if not exists "prazo_id" text;
alter table intimacoes add column if not exists "criado_em" text;
alter table intimacoes add column if not exists "resumo_ia" text;
alter table intimacoes add column if not exists "terminada_por" text;
alter table intimacoes add column if not exists "terminada_em" text;
alter table intimacoes add column if not exists "ok_por" text;
alter table intimacoes add column if not exists "ok_em" text;
alter table intimacoes enable row level security;
drop policy if exists "intimacoes: só o próprio escritório" on intimacoes; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists prazos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "processo_id" text,
  "numero" text,
  "intimacao_id" text,
  "descricao" text,
  "dias" text,
  "contagem" text,
  "ciencia" text,
  "ciencia_tipo" text,
  "fatal" text,
  "situacao" text,
  "conferido_por" text,
  "conferido_em" text,
  "origem" text,
  "observacoes" text,
  "criado_em" text,
  "atualizado_em" text,
  "atualizado_por" text,
  "cumprido_por" text,
  "cumprido_em" text,
  "responsavel" text,
  "etapa" text,
  "resumo_ia" text,
  "ok_por" text,
  "ok_em" text,
  "agenda_id" text,
  "agenda_data" text,
  "conferido_fonte" text,
  primary key (escritorio_id, "id")
);
alter table prazos add column if not exists "id" text;
alter table prazos add column if not exists "processo_id" text;
alter table prazos add column if not exists "numero" text;
alter table prazos add column if not exists "intimacao_id" text;
alter table prazos add column if not exists "descricao" text;
alter table prazos add column if not exists "dias" text;
alter table prazos add column if not exists "contagem" text;
alter table prazos add column if not exists "ciencia" text;
alter table prazos add column if not exists "ciencia_tipo" text;
alter table prazos add column if not exists "fatal" text;
alter table prazos add column if not exists "situacao" text;
alter table prazos add column if not exists "conferido_por" text;
alter table prazos add column if not exists "conferido_em" text;
alter table prazos add column if not exists "origem" text;
alter table prazos add column if not exists "observacoes" text;
alter table prazos add column if not exists "criado_em" text;
alter table prazos add column if not exists "atualizado_em" text;
alter table prazos add column if not exists "atualizado_por" text;
alter table prazos add column if not exists "cumprido_por" text;
alter table prazos add column if not exists "cumprido_em" text;
alter table prazos add column if not exists "responsavel" text;
alter table prazos add column if not exists "etapa" text;
alter table prazos add column if not exists "resumo_ia" text;
alter table prazos add column if not exists "ok_por" text;
alter table prazos add column if not exists "ok_em" text;
alter table prazos add column if not exists "agenda_id" text;
alter table prazos add column if not exists "agenda_data" text;
alter table prazos add column if not exists "conferido_fonte" text;
alter table prazos enable row level security;
drop policy if exists "prazos: só o próprio escritório" on prazos; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists honorarios (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "cliente_id" text,
  "processo_id" text,
  "tipo" text,
  "descricao" text,
  "valor_total" text,
  "percentual" text,
  "valor_mensal" text,
  "dia_vencimento" text,
  "inicio" text,
  "situacao" text,
  "observacoes" text,
  "origem" text,
  "criado_em" text,
  "atualizado_em" text,
  "atualizado_por" text,
  primary key (escritorio_id, "id")
);
alter table honorarios add column if not exists "id" text;
alter table honorarios add column if not exists "cliente_id" text;
alter table honorarios add column if not exists "processo_id" text;
alter table honorarios add column if not exists "tipo" text;
alter table honorarios add column if not exists "descricao" text;
alter table honorarios add column if not exists "valor_total" text;
alter table honorarios add column if not exists "percentual" text;
alter table honorarios add column if not exists "valor_mensal" text;
alter table honorarios add column if not exists "dia_vencimento" text;
alter table honorarios add column if not exists "inicio" text;
alter table honorarios add column if not exists "situacao" text;
alter table honorarios add column if not exists "observacoes" text;
alter table honorarios add column if not exists "origem" text;
alter table honorarios add column if not exists "criado_em" text;
alter table honorarios add column if not exists "atualizado_em" text;
alter table honorarios add column if not exists "atualizado_por" text;
alter table honorarios enable row level security;
drop policy if exists "honorarios: só o próprio escritório" on honorarios; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists parcelas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "honorario_id" text,
  "cliente_id" text,
  "numero" text,
  "vencimento" text,
  "valor" text,
  "pago_em" text,
  "valor_pago" text,
  "forma" text,
  "cobranca" text,
  "mensagem_em" text,
  "acao_processo_id" text,
  "observacoes" text,
  "criado_em" text,
  "atualizado_em" text,
  "atualizado_por" text,
  "recibo_url" text,
  "asaas_id" text,
  "asaas_link" text,
  "asaas_status" text,
  primary key (escritorio_id, "id")
);
alter table parcelas add column if not exists "id" text;
alter table parcelas add column if not exists "honorario_id" text;
alter table parcelas add column if not exists "cliente_id" text;
alter table parcelas add column if not exists "numero" text;
alter table parcelas add column if not exists "vencimento" text;
alter table parcelas add column if not exists "valor" text;
alter table parcelas add column if not exists "pago_em" text;
alter table parcelas add column if not exists "valor_pago" text;
alter table parcelas add column if not exists "forma" text;
alter table parcelas add column if not exists "cobranca" text;
alter table parcelas add column if not exists "mensagem_em" text;
alter table parcelas add column if not exists "acao_processo_id" text;
alter table parcelas add column if not exists "observacoes" text;
alter table parcelas add column if not exists "criado_em" text;
alter table parcelas add column if not exists "atualizado_em" text;
alter table parcelas add column if not exists "atualizado_por" text;
alter table parcelas add column if not exists "recibo_url" text;
alter table parcelas add column if not exists "asaas_id" text;
alter table parcelas add column if not exists "asaas_link" text;
alter table parcelas add column if not exists "asaas_status" text;
alter table parcelas enable row level security;
drop policy if exists "parcelas: só o próprio escritório" on parcelas; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists recebimentos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "honorario_id" text,
  "processo_id" text,
  "data" text,
  "valor_bruto" text,
  "percentual" text,
  "honorarios" text,
  "repasse_cliente" text,
  "repassado_em" text,
  "observacoes" text,
  "criado_em" text,
  "criado_por" text,
  primary key (escritorio_id, "id")
);
alter table recebimentos add column if not exists "id" text;
alter table recebimentos add column if not exists "honorario_id" text;
alter table recebimentos add column if not exists "processo_id" text;
alter table recebimentos add column if not exists "data" text;
alter table recebimentos add column if not exists "valor_bruto" text;
alter table recebimentos add column if not exists "percentual" text;
alter table recebimentos add column if not exists "honorarios" text;
alter table recebimentos add column if not exists "repasse_cliente" text;
alter table recebimentos add column if not exists "repassado_em" text;
alter table recebimentos add column if not exists "observacoes" text;
alter table recebimentos add column if not exists "criado_em" text;
alter table recebimentos add column if not exists "criado_por" text;
alter table recebimentos enable row level security;
drop policy if exists "recebimentos: só o próprio escritório" on recebimentos; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists audiencias (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "chave" text,
  "numero" text,
  "data" text,
  "hora" text,
  "tipo" text,
  "modo" text,
  "link" text,
  "testemunhas" text,
  "obs" text,
  "ciente_em" text,
  "ciente_por" text,
  "aviso_semana_em" text,
  "aviso_semana_por" text,
  "aviso_vespera_em" text,
  "aviso_vespera_por" text,
  "aviso_dia_em" text,
  "aviso_dia_por" text,
  "criado_em" text,
  "atualizado_em" text,
  "atualizado_por" text,
  primary key (escritorio_id, _n)
);
alter table audiencias add column if not exists "chave" text;
alter table audiencias add column if not exists "numero" text;
alter table audiencias add column if not exists "data" text;
alter table audiencias add column if not exists "hora" text;
alter table audiencias add column if not exists "tipo" text;
alter table audiencias add column if not exists "modo" text;
alter table audiencias add column if not exists "link" text;
alter table audiencias add column if not exists "testemunhas" text;
alter table audiencias add column if not exists "obs" text;
alter table audiencias add column if not exists "ciente_em" text;
alter table audiencias add column if not exists "ciente_por" text;
alter table audiencias add column if not exists "aviso_semana_em" text;
alter table audiencias add column if not exists "aviso_semana_por" text;
alter table audiencias add column if not exists "aviso_vespera_em" text;
alter table audiencias add column if not exists "aviso_vespera_por" text;
alter table audiencias add column if not exists "aviso_dia_em" text;
alter table audiencias add column if not exists "aviso_dia_por" text;
alter table audiencias add column if not exists "criado_em" text;
alter table audiencias add column if not exists "atualizado_em" text;
alter table audiencias add column if not exists "atualizado_por" text;
alter table audiencias enable row level security;
drop policy if exists "audiencias: só o próprio escritório" on audiencias; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists eventos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "chave" text,
  "tipo" text,
  "numero" text,
  "data" text,
  "hora" text,
  "agenda" text,
  "evento_id" text,
  "prazo_id" text,
  "criado_em" text,
  "avisado_em" text,
  "avisado_por" text,
  "avisado_dia_em" text,
  "avisado_dia_por" text,
  primary key (escritorio_id, _n)
);
alter table eventos add column if not exists "chave" text;
alter table eventos add column if not exists "tipo" text;
alter table eventos add column if not exists "numero" text;
alter table eventos add column if not exists "data" text;
alter table eventos add column if not exists "hora" text;
alter table eventos add column if not exists "agenda" text;
alter table eventos add column if not exists "evento_id" text;
alter table eventos add column if not exists "prazo_id" text;
alter table eventos add column if not exists "criado_em" text;
alter table eventos add column if not exists "avisado_em" text;
alter table eventos add column if not exists "avisado_por" text;
alter table eventos add column if not exists "avisado_dia_em" text;
alter table eventos add column if not exists "avisado_dia_por" text;
alter table eventos enable row level security;
drop policy if exists "eventos: só o próprio escritório" on eventos; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists feriados (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "data" text,
  "descricao" text,
  "abrangencia" text,
  primary key (escritorio_id, _n)
);
alter table feriados add column if not exists "data" text;
alter table feriados add column if not exists "descricao" text;
alter table feriados add column if not exists "abrangencia" text;
alter table feriados enable row level security;
drop policy if exists "feriados: só o próprio escritório" on feriados; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists log (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "quando" text,
  "usuario" text,
  "acao" text,
  "detalhe" text,
  primary key (escritorio_id, _n)
);
alter table log add column if not exists "quando" text;
alter table log add column if not exists "usuario" text;
alter table log add column if not exists "acao" text;
alter table log add column if not exists "detalhe" text;
alter table log enable row level security;
drop policy if exists "log: só o próprio escritório" on log; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists log_arquivo (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "quando" text,
  "usuario" text,
  "acao" text,
  "detalhe" text,
  primary key (escritorio_id, _n)
);
alter table log_arquivo add column if not exists "quando" text;
alter table log_arquivo add column if not exists "usuario" text;
alter table log_arquivo add column if not exists "acao" text;
alter table log_arquivo add column if not exists "detalhe" text;
alter table log_arquivo enable row level security;
drop policy if exists "log_arquivo: só o próprio escritório" on log_arquivo; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists leads (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "criado_em" text,
  "nome" text,
  "telefone" text,
  "email" text,
  "area" text,
  "assunto" text,
  "canal" text,
  "etapa" text,
  "valor_estimado" text,
  "responsavel" text,
  "proxima_acao" text,
  "proxima_data" text,
  "temperatura" text,
  "consulta_em" text,
  "indicado_por" text,
  "observacoes" text,
  "motivo_perda" text,
  "cliente_id" text,
  "contato_id" text,
  "proposta_url" text,
  "historico" text,
  "primeiro_contato_em" text,
  "ganho_em" text,
  "perdido_em" text,
  "criado_por" text,
  "atualizado_em" text,
  "atualizado_por" text,
  "cadastro_token" text,
  "cadastro_ate" text,
  "cadastro_em" text,
  primary key (escritorio_id, "id")
);
alter table leads add column if not exists "id" text;
alter table leads add column if not exists "criado_em" text;
alter table leads add column if not exists "nome" text;
alter table leads add column if not exists "telefone" text;
alter table leads add column if not exists "email" text;
alter table leads add column if not exists "area" text;
alter table leads add column if not exists "assunto" text;
alter table leads add column if not exists "canal" text;
alter table leads add column if not exists "etapa" text;
alter table leads add column if not exists "valor_estimado" text;
alter table leads add column if not exists "responsavel" text;
alter table leads add column if not exists "proxima_acao" text;
alter table leads add column if not exists "proxima_data" text;
alter table leads add column if not exists "temperatura" text;
alter table leads add column if not exists "consulta_em" text;
alter table leads add column if not exists "indicado_por" text;
alter table leads add column if not exists "observacoes" text;
alter table leads add column if not exists "motivo_perda" text;
alter table leads add column if not exists "cliente_id" text;
alter table leads add column if not exists "contato_id" text;
alter table leads add column if not exists "proposta_url" text;
alter table leads add column if not exists "historico" text;
alter table leads add column if not exists "primeiro_contato_em" text;
alter table leads add column if not exists "ganho_em" text;
alter table leads add column if not exists "perdido_em" text;
alter table leads add column if not exists "criado_por" text;
alter table leads add column if not exists "atualizado_em" text;
alter table leads add column if not exists "atualizado_por" text;
alter table leads add column if not exists "cadastro_token" text;
alter table leads add column if not exists "cadastro_ate" text;
alter table leads add column if not exists "cadastro_em" text;
alter table leads enable row level security;
drop policy if exists "leads: só o próprio escritório" on leads; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists transcricoes (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "criado_em" text,
  "criado_por" text,
  "tipo" text,
  "titulo" text,
  "cliente_id" text,
  "processo_id" text,
  "data_ato" text,
  "fonte" text,
  "doc_url" text,
  "resumo_cliente" text,
  "resumo_equipe" text,
  "documentos" text,
  "publicado" text,
  "publicado_em" text,
  primary key (escritorio_id, "id")
);
alter table transcricoes add column if not exists "id" text;
alter table transcricoes add column if not exists "criado_em" text;
alter table transcricoes add column if not exists "criado_por" text;
alter table transcricoes add column if not exists "tipo" text;
alter table transcricoes add column if not exists "titulo" text;
alter table transcricoes add column if not exists "cliente_id" text;
alter table transcricoes add column if not exists "processo_id" text;
alter table transcricoes add column if not exists "data_ato" text;
alter table transcricoes add column if not exists "fonte" text;
alter table transcricoes add column if not exists "doc_url" text;
alter table transcricoes add column if not exists "resumo_cliente" text;
alter table transcricoes add column if not exists "resumo_equipe" text;
alter table transcricoes add column if not exists "documentos" text;
alter table transcricoes add column if not exists "publicado" text;
alter table transcricoes add column if not exists "publicado_em" text;
alter table transcricoes enable row level security;
drop policy if exists "transcricoes: só o próprio escritório" on transcricoes; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists padroes (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "grupo" text,
  "titulo" text,
  "texto" text,
  "ordem" text,
  "atualizado_em" text,
  "atualizado_por" text,
  primary key (escritorio_id, "id")
);
alter table padroes add column if not exists "id" text;
alter table padroes add column if not exists "grupo" text;
alter table padroes add column if not exists "titulo" text;
alter table padroes add column if not exists "texto" text;
alter table padroes add column if not exists "ordem" text;
alter table padroes add column if not exists "atualizado_em" text;
alter table padroes add column if not exists "atualizado_por" text;
alter table padroes enable row level security;
drop policy if exists "padroes: só o próprio escritório" on padroes; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists conversas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "telefone" text,
  "nome" text,
  "cliente_id" text,
  "lead_id" text,
  "estado" text,
  "ultima_em" text,
  "ultima_msg" text,
  "nao_lidas" text,
  "atendente" text,
  "pausado_ate" text,
  "criado_em" text,
  "resumo" text,
  "dados" text,
  "ultima_cliente_em" text,
  primary key (escritorio_id, "id")
);
alter table conversas add column if not exists "id" text;
alter table conversas add column if not exists "telefone" text;
alter table conversas add column if not exists "nome" text;
alter table conversas add column if not exists "cliente_id" text;
alter table conversas add column if not exists "lead_id" text;
alter table conversas add column if not exists "estado" text;
alter table conversas add column if not exists "ultima_em" text;
alter table conversas add column if not exists "ultima_msg" text;
alter table conversas add column if not exists "nao_lidas" text;
alter table conversas add column if not exists "atendente" text;
alter table conversas add column if not exists "pausado_ate" text;
alter table conversas add column if not exists "criado_em" text;
alter table conversas add column if not exists "resumo" text;
alter table conversas add column if not exists "dados" text;
alter table conversas add column if not exists "ultima_cliente_em" text;
alter table conversas enable row level security;
drop policy if exists "conversas: só o próprio escritório" on conversas; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists avisos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "chave" text,
  "tipo" text,
  "ref" text,
  "em" text,
  "por" text,
  primary key (escritorio_id, _n)
);
alter table avisos add column if not exists "chave" text;
alter table avisos add column if not exists "tipo" text;
alter table avisos add column if not exists "ref" text;
alter table avisos add column if not exists "em" text;
alter table avisos add column if not exists "por" text;
alter table avisos enable row level security;
drop policy if exists "avisos: só o próprio escritório" on avisos; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists mensagens (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "conversa_id" text,
  "quando" text,
  "direcao" text,
  "tipo" text,
  "texto" text,
  "wa_id" text,
  "autor" text,
  primary key (escritorio_id, "id")
);
alter table mensagens add column if not exists "id" text;
alter table mensagens add column if not exists "conversa_id" text;
alter table mensagens add column if not exists "quando" text;
alter table mensagens add column if not exists "direcao" text;
alter table mensagens add column if not exists "tipo" text;
alter table mensagens add column if not exists "texto" text;
alter table mensagens add column if not exists "wa_id" text;
alter table mensagens add column if not exists "autor" text;
alter table mensagens enable row level security;
drop policy if exists "mensagens: só o próprio escritório" on mensagens; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists assinaturas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "cliente_id" text,
  "cliente_nome" text,
  "documentos" text,
  "tipo_acao" text,
  "parte_contraria" text,
  "gerado_em" text,
  "gerado_por" text,
  "situacao" text,
  "assinado_em" text,
  "assinado_por" text,
  "processo_id" text,
  "lembretes" text,
  "lembrete_em" text,
  "pasta_url" text,
  "honorarios" text,
  "honorarios_lancados" text,
  primary key (escritorio_id, "id")
);
alter table assinaturas add column if not exists "id" text;
alter table assinaturas add column if not exists "cliente_id" text;
alter table assinaturas add column if not exists "cliente_nome" text;
alter table assinaturas add column if not exists "documentos" text;
alter table assinaturas add column if not exists "tipo_acao" text;
alter table assinaturas add column if not exists "parte_contraria" text;
alter table assinaturas add column if not exists "gerado_em" text;
alter table assinaturas add column if not exists "gerado_por" text;
alter table assinaturas add column if not exists "situacao" text;
alter table assinaturas add column if not exists "assinado_em" text;
alter table assinaturas add column if not exists "assinado_por" text;
alter table assinaturas add column if not exists "processo_id" text;
alter table assinaturas add column if not exists "lembretes" text;
alter table assinaturas add column if not exists "lembrete_em" text;
alter table assinaturas add column if not exists "pasta_url" text;
alter table assinaturas add column if not exists "honorarios" text;
alter table assinaturas add column if not exists "honorarios_lancados" text;
alter table assinaturas enable row level security;
drop policy if exists "assinaturas: só o próprio escritório" on assinaturas; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists pastas_conferir (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "pasta" text,
  "pasta_url" text,
  "motivo" text,
  "clientes_possiveis" text,
  primary key (escritorio_id, _n)
);
alter table pastas_conferir add column if not exists "pasta" text;
alter table pastas_conferir add column if not exists "pasta_url" text;
alter table pastas_conferir add column if not exists "motivo" text;
alter table pastas_conferir add column if not exists "clientes_possiveis" text;
alter table pastas_conferir enable row level security;
drop policy if exists "pastas_conferir: só o próprio escritório" on pastas_conferir; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists advogados (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "nome" text,
  "oab" text,
  "uf" text,
  "tratamento" text,
  "email" text,
  "telefone" text,
  "ativo" text,
  "padrao" text,
  "criado_em" text,
  primary key (escritorio_id, "id")
);
alter table advogados add column if not exists "id" text;
alter table advogados add column if not exists "nome" text;
alter table advogados add column if not exists "oab" text;
alter table advogados add column if not exists "uf" text;
alter table advogados add column if not exists "tratamento" text;
alter table advogados add column if not exists "email" text;
alter table advogados add column if not exists "telefone" text;
alter table advogados add column if not exists "ativo" text;
alter table advogados add column if not exists "padrao" text;
alter table advogados add column if not exists "criado_em" text;
alter table advogados enable row level security;
drop policy if exists "advogados: só o próprio escritório" on advogados; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists tarefas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "titulo" text,
  "descricao" text,
  "responsavel" text,
  "processo_id" text,
  "numero" text,
  "cliente_id" text,
  "vence_em" text,
  "etapa" text,
  "peso" text,
  "situacao" text,
  "concluida_por" text,
  "concluida_em" text,
  "historico" text,
  "criado_em" text,
  "criado_por" text,
  "atualizado_em" text,
  "atualizado_por" text,
  "prioridade" text,
  "checklist" text,
  "repetir" text,
  "ok_por" text,
  "ok_em" text,
  primary key (escritorio_id, "id")
);
alter table tarefas add column if not exists "id" text;
alter table tarefas add column if not exists "titulo" text;
alter table tarefas add column if not exists "descricao" text;
alter table tarefas add column if not exists "responsavel" text;
alter table tarefas add column if not exists "processo_id" text;
alter table tarefas add column if not exists "numero" text;
alter table tarefas add column if not exists "cliente_id" text;
alter table tarefas add column if not exists "vence_em" text;
alter table tarefas add column if not exists "etapa" text;
alter table tarefas add column if not exists "peso" text;
alter table tarefas add column if not exists "situacao" text;
alter table tarefas add column if not exists "concluida_por" text;
alter table tarefas add column if not exists "concluida_em" text;
alter table tarefas add column if not exists "historico" text;
alter table tarefas add column if not exists "criado_em" text;
alter table tarefas add column if not exists "criado_por" text;
alter table tarefas add column if not exists "atualizado_em" text;
alter table tarefas add column if not exists "atualizado_por" text;
alter table tarefas add column if not exists "prioridade" text;
alter table tarefas add column if not exists "checklist" text;
alter table tarefas add column if not exists "repetir" text;
alter table tarefas add column if not exists "ok_por" text;
alter table tarefas add column if not exists "ok_em" text;
alter table tarefas enable row level security;
drop policy if exists "tarefas: só o próprio escritório" on tarefas; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists contatos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "criado_em" text,
  "nome" text,
  "telefone" text,
  "assunto" text,
  "horario" text,
  "pagina" text,
  "situacao" text,
  "tarefa_id" text,
  "observacoes" text,
  "origem" text,
  "campanha" text,
  primary key (escritorio_id, "id")
);
alter table contatos add column if not exists "id" text;
alter table contatos add column if not exists "criado_em" text;
alter table contatos add column if not exists "nome" text;
alter table contatos add column if not exists "telefone" text;
alter table contatos add column if not exists "assunto" text;
alter table contatos add column if not exists "horario" text;
alter table contatos add column if not exists "pagina" text;
alter table contatos add column if not exists "situacao" text;
alter table contatos add column if not exists "tarefa_id" text;
alter table contatos add column if not exists "observacoes" text;
alter table contatos add column if not exists "origem" text;
alter table contatos add column if not exists "campanha" text;
alter table contatos enable row level security;
drop policy if exists "contatos: só o próprio escritório" on contatos; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists marketing (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "mes" text,
  "canal" text,
  "campanha" text,
  "area" text,
  "investimento" text,
  "cliques" text,
  "impressoes" text,
  "conversoes" text,
  "obs" text,
  "criado_em" text,
  "criado_por" text,
  primary key (escritorio_id, "id")
);
alter table marketing add column if not exists "id" text;
alter table marketing add column if not exists "mes" text;
alter table marketing add column if not exists "canal" text;
alter table marketing add column if not exists "campanha" text;
alter table marketing add column if not exists "area" text;
alter table marketing add column if not exists "investimento" text;
alter table marketing add column if not exists "cliques" text;
alter table marketing add column if not exists "impressoes" text;
alter table marketing add column if not exists "conversoes" text;
alter table marketing add column if not exists "obs" text;
alter table marketing add column if not exists "criado_em" text;
alter table marketing add column if not exists "criado_por" text;
alter table marketing enable row level security;
drop policy if exists "marketing: só o próprio escritório" on marketing; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists site_cliques (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "quando" text,
  "pagina" text,
  "area" text,
  "origem" text,
  "campanha" text,
  "canal" text,
  primary key (escritorio_id, _n)
);
alter table site_cliques add column if not exists "quando" text;
alter table site_cliques add column if not exists "pagina" text;
alter table site_cliques add column if not exists "area" text;
alter table site_cliques add column if not exists "origem" text;
alter table site_cliques add column if not exists "campanha" text;
alter table site_cliques add column if not exists "canal" text;
alter table site_cliques enable row level security;
drop policy if exists "site_cliques: só o próprio escritório" on site_cliques; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists mkt_funil (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "mes" text,
  "pagina" text,
  "conversas" text,
  "consultas" text,
  "atualizado_em" text,
  "atualizado_por" text,
  primary key (escritorio_id, _n)
);
alter table mkt_funil add column if not exists "mes" text;
alter table mkt_funil add column if not exists "pagina" text;
alter table mkt_funil add column if not exists "conversas" text;
alter table mkt_funil add column if not exists "consultas" text;
alter table mkt_funil add column if not exists "atualizado_em" text;
alter table mkt_funil add column if not exists "atualizado_por" text;
alter table mkt_funil enable row level security;
drop policy if exists "mkt_funil: só o próprio escritório" on mkt_funil; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists pix (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "recebido_em" text,
  "valor" text,
  "pagador" text,
  "situacao" text,
  "cliente_id" text,
  "parcela_id" text,
  "motivo" text,
  "criado_em" text,
  "atualizado_em" text,
  "atualizado_por" text,
  "recibo" text,
  "sugestao" text,
  "categoria" text,
  primary key (escritorio_id, "id")
);
alter table pix add column if not exists "id" text;
alter table pix add column if not exists "recebido_em" text;
alter table pix add column if not exists "valor" text;
alter table pix add column if not exists "pagador" text;
alter table pix add column if not exists "situacao" text;
alter table pix add column if not exists "cliente_id" text;
alter table pix add column if not exists "parcela_id" text;
alter table pix add column if not exists "motivo" text;
alter table pix add column if not exists "criado_em" text;
alter table pix add column if not exists "atualizado_em" text;
alter table pix add column if not exists "atualizado_por" text;
alter table pix add column if not exists "recibo" text;
alter table pix add column if not exists "sugestao" text;
alter table pix add column if not exists "categoria" text;
alter table pix enable row level security;
drop policy if exists "pix: só o próprio escritório" on pix; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists fut_unidades (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "tipo" text,
  "andar" text,
  "ordem" text,
  "aluguel" text,
  "taxas" text,
  "situacao" text,
  "locatario" text,
  "telefone" text,
  "entrada" text,
  "saida" text,
  "garantia" text,
  "caucao" text,
  "energia_resp" text,
  "kit" text,
  "uc" text,
  "medidor" text,
  "uc_antiga" text,
  "obs" text,
  "atualizado_em" text,
  "atualizado_por" text,
  "pagador" text,
  "pasta_url" text,
  "cobra_energia" text,
  "moeda" text,
  "modalidade" text,
  "conta_receb" text,
  primary key (escritorio_id, "id")
);
alter table fut_unidades add column if not exists "id" text;
alter table fut_unidades add column if not exists "tipo" text;
alter table fut_unidades add column if not exists "andar" text;
alter table fut_unidades add column if not exists "ordem" text;
alter table fut_unidades add column if not exists "aluguel" text;
alter table fut_unidades add column if not exists "taxas" text;
alter table fut_unidades add column if not exists "situacao" text;
alter table fut_unidades add column if not exists "locatario" text;
alter table fut_unidades add column if not exists "telefone" text;
alter table fut_unidades add column if not exists "entrada" text;
alter table fut_unidades add column if not exists "saida" text;
alter table fut_unidades add column if not exists "garantia" text;
alter table fut_unidades add column if not exists "caucao" text;
alter table fut_unidades add column if not exists "energia_resp" text;
alter table fut_unidades add column if not exists "kit" text;
alter table fut_unidades add column if not exists "uc" text;
alter table fut_unidades add column if not exists "medidor" text;
alter table fut_unidades add column if not exists "uc_antiga" text;
alter table fut_unidades add column if not exists "obs" text;
alter table fut_unidades add column if not exists "atualizado_em" text;
alter table fut_unidades add column if not exists "atualizado_por" text;
alter table fut_unidades add column if not exists "pagador" text;
alter table fut_unidades add column if not exists "pasta_url" text;
alter table fut_unidades add column if not exists "cobra_energia" text;
alter table fut_unidades add column if not exists "moeda" text;
alter table fut_unidades add column if not exists "modalidade" text;
alter table fut_unidades add column if not exists "conta_receb" text;
alter table fut_unidades enable row level security;
drop policy if exists "fut_unidades: só o próprio escritório" on fut_unidades; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists fut_pessoas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "nome" text,
  "telefone" text,
  "cpf" text,
  "unidade" text,
  "entrada" text,
  "saida" text,
  "garantia" text,
  "caucao" text,
  "situacao" text,
  "obs" text,
  "origem" text,
  "criado_em" text,
  "pasta_url" text,
  "arquivos" text,
  "contrato_url" text,
  "rg" text,
  "qualificacao" text,
  "genero" text,
  "laudo_url" text,
  "email" text,
  primary key (escritorio_id, "id")
);
alter table fut_pessoas add column if not exists "id" text;
alter table fut_pessoas add column if not exists "nome" text;
alter table fut_pessoas add column if not exists "telefone" text;
alter table fut_pessoas add column if not exists "cpf" text;
alter table fut_pessoas add column if not exists "unidade" text;
alter table fut_pessoas add column if not exists "entrada" text;
alter table fut_pessoas add column if not exists "saida" text;
alter table fut_pessoas add column if not exists "garantia" text;
alter table fut_pessoas add column if not exists "caucao" text;
alter table fut_pessoas add column if not exists "situacao" text;
alter table fut_pessoas add column if not exists "obs" text;
alter table fut_pessoas add column if not exists "origem" text;
alter table fut_pessoas add column if not exists "criado_em" text;
alter table fut_pessoas add column if not exists "pasta_url" text;
alter table fut_pessoas add column if not exists "arquivos" text;
alter table fut_pessoas add column if not exists "contrato_url" text;
alter table fut_pessoas add column if not exists "rg" text;
alter table fut_pessoas add column if not exists "qualificacao" text;
alter table fut_pessoas add column if not exists "genero" text;
alter table fut_pessoas add column if not exists "laudo_url" text;
alter table fut_pessoas add column if not exists "email" text;
alter table fut_pessoas enable row level security;
drop policy if exists "fut_pessoas: só o próprio escritório" on fut_pessoas; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists fut_lanc (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "data" text,
  "competencia" text,
  "tipo" text,
  "categoria" text,
  "unidade" text,
  "pessoa" text,
  "valor" text,
  "forma" text,
  "responsavel" text,
  "descricao" text,
  "origem" text,
  "chave" text,
  "criado_em" text,
  "criado_por" text,
  primary key (escritorio_id, "id")
);
alter table fut_lanc add column if not exists "id" text;
alter table fut_lanc add column if not exists "data" text;
alter table fut_lanc add column if not exists "competencia" text;
alter table fut_lanc add column if not exists "tipo" text;
alter table fut_lanc add column if not exists "categoria" text;
alter table fut_lanc add column if not exists "unidade" text;
alter table fut_lanc add column if not exists "pessoa" text;
alter table fut_lanc add column if not exists "valor" text;
alter table fut_lanc add column if not exists "forma" text;
alter table fut_lanc add column if not exists "responsavel" text;
alter table fut_lanc add column if not exists "descricao" text;
alter table fut_lanc add column if not exists "origem" text;
alter table fut_lanc add column if not exists "chave" text;
alter table fut_lanc add column if not exists "criado_em" text;
alter table fut_lanc add column if not exists "criado_por" text;
alter table fut_lanc enable row level security;
drop policy if exists "fut_lanc: só o próprio escritório" on fut_lanc; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists fut_cobrancas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "unidade" text,
  "pessoa" text,
  "competencia" text,
  "vencimento" text,
  "aluguel" text,
  "taxas" text,
  "energia" text,
  "outros" text,
  "total" text,
  "pago_em" text,
  "valor_pago" text,
  "forma" text,
  "lanc_id" text,
  "situacao" text,
  "obs" text,
  "criado_em" text,
  "atualizado_em" text,
  "atualizado_por" text,
  "pagador" text,
  "enviado_em" text,
  "enviado_por" text,
  "detalhe" text,
  "lavanderia" text,
  "lembrete5_em" text,
  "lembrete10_em" text,
  primary key (escritorio_id, "id")
);
alter table fut_cobrancas add column if not exists "id" text;
alter table fut_cobrancas add column if not exists "unidade" text;
alter table fut_cobrancas add column if not exists "pessoa" text;
alter table fut_cobrancas add column if not exists "competencia" text;
alter table fut_cobrancas add column if not exists "vencimento" text;
alter table fut_cobrancas add column if not exists "aluguel" text;
alter table fut_cobrancas add column if not exists "taxas" text;
alter table fut_cobrancas add column if not exists "energia" text;
alter table fut_cobrancas add column if not exists "outros" text;
alter table fut_cobrancas add column if not exists "total" text;
alter table fut_cobrancas add column if not exists "pago_em" text;
alter table fut_cobrancas add column if not exists "valor_pago" text;
alter table fut_cobrancas add column if not exists "forma" text;
alter table fut_cobrancas add column if not exists "lanc_id" text;
alter table fut_cobrancas add column if not exists "situacao" text;
alter table fut_cobrancas add column if not exists "obs" text;
alter table fut_cobrancas add column if not exists "criado_em" text;
alter table fut_cobrancas add column if not exists "atualizado_em" text;
alter table fut_cobrancas add column if not exists "atualizado_por" text;
alter table fut_cobrancas add column if not exists "pagador" text;
alter table fut_cobrancas add column if not exists "enviado_em" text;
alter table fut_cobrancas add column if not exists "enviado_por" text;
alter table fut_cobrancas add column if not exists "detalhe" text;
alter table fut_cobrancas add column if not exists "lavanderia" text;
alter table fut_cobrancas add column if not exists "lembrete5_em" text;
alter table fut_cobrancas add column if not exists "lembrete10_em" text;
alter table fut_cobrancas enable row level security;
drop policy if exists "fut_cobrancas: só o próprio escritório" on fut_cobrancas; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists fut_contratos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "criado_em" text,
  "criado_por" text,
  "unidade" text,
  "pessoa_id" text,
  "nome" text,
  "cpf" text,
  "telefone" text,
  "prazo_meses" text,
  "inicio" text,
  "fim" text,
  "aluguel" text,
  "garantia" text,
  "caucao" text,
  "doc_url" text,
  "pdf_url" text,
  "laudo_doc" text,
  "laudo_pdf" text,
  "pasta_url" text,
  "situacao" text,
  "tipo" text,
  "dias" text,
  "valor_total" text,
  "email" text,
  "video_url" text,
  "enviado_em" text,
  "enviado_por" text,
  primary key (escritorio_id, "id")
);
alter table fut_contratos add column if not exists "id" text;
alter table fut_contratos add column if not exists "criado_em" text;
alter table fut_contratos add column if not exists "criado_por" text;
alter table fut_contratos add column if not exists "unidade" text;
alter table fut_contratos add column if not exists "pessoa_id" text;
alter table fut_contratos add column if not exists "nome" text;
alter table fut_contratos add column if not exists "cpf" text;
alter table fut_contratos add column if not exists "telefone" text;
alter table fut_contratos add column if not exists "prazo_meses" text;
alter table fut_contratos add column if not exists "inicio" text;
alter table fut_contratos add column if not exists "fim" text;
alter table fut_contratos add column if not exists "aluguel" text;
alter table fut_contratos add column if not exists "garantia" text;
alter table fut_contratos add column if not exists "caucao" text;
alter table fut_contratos add column if not exists "doc_url" text;
alter table fut_contratos add column if not exists "pdf_url" text;
alter table fut_contratos add column if not exists "laudo_doc" text;
alter table fut_contratos add column if not exists "laudo_pdf" text;
alter table fut_contratos add column if not exists "pasta_url" text;
alter table fut_contratos add column if not exists "situacao" text;
alter table fut_contratos add column if not exists "tipo" text;
alter table fut_contratos add column if not exists "dias" text;
alter table fut_contratos add column if not exists "valor_total" text;
alter table fut_contratos add column if not exists "email" text;
alter table fut_contratos add column if not exists "video_url" text;
alter table fut_contratos add column if not exists "enviado_em" text;
alter table fut_contratos add column if not exists "enviado_por" text;
alter table fut_contratos enable row level security;
drop policy if exists "fut_contratos: só o próprio escritório" on fut_contratos; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists fut_energia (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "competencia" text,
  "unidade" text,
  "valor" text,
  "kwh" text,
  "origem" text,
  "criado_em" text,
  primary key (escritorio_id, "id")
);
alter table fut_energia add column if not exists "id" text;
alter table fut_energia add column if not exists "competencia" text;
alter table fut_energia add column if not exists "unidade" text;
alter table fut_energia add column if not exists "valor" text;
alter table fut_energia add column if not exists "kwh" text;
alter table fut_energia add column if not exists "origem" text;
alter table fut_energia add column if not exists "criado_em" text;
alter table fut_energia enable row level security;
drop policy if exists "fut_energia: só o próprio escritório" on fut_energia; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists fut_lavagens (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "data" text,
  "competencia" text,
  "unidade" text,
  "pessoa" text,
  "quantidade" text,
  "valor" text,
  "obs" text,
  "criado_em" text,
  "criado_por" text,
  "situacao" text,
  "tipo" text,
  "chave" text,
  primary key (escritorio_id, "id")
);
alter table fut_lavagens add column if not exists "id" text;
alter table fut_lavagens add column if not exists "data" text;
alter table fut_lavagens add column if not exists "competencia" text;
alter table fut_lavagens add column if not exists "unidade" text;
alter table fut_lavagens add column if not exists "pessoa" text;
alter table fut_lavagens add column if not exists "quantidade" text;
alter table fut_lavagens add column if not exists "valor" text;
alter table fut_lavagens add column if not exists "obs" text;
alter table fut_lavagens add column if not exists "criado_em" text;
alter table fut_lavagens add column if not exists "criado_por" text;
alter table fut_lavagens add column if not exists "situacao" text;
alter table fut_lavagens add column if not exists "tipo" text;
alter table fut_lavagens add column if not exists "chave" text;
alter table fut_lavagens enable row level security;
drop policy if exists "fut_lavagens: só o próprio escritório" on fut_lavagens; -- só o servidor (service_role) lê e grava as tabelas brutas

create table if not exists despesas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  _n integer,
  _sinc text,
  "id" text,
  "descricao" text,
  "categoria" text,
  "valor" text,
  "vencimento" text,
  "pago_em" text,
  "valor_pago" text,
  "forma" text,
  "cliente_id" text,
  "processo_id" text,
  "reembolsavel" text,
  "reembolsado_em" text,
  "recorrente" text,
  "serie_id" text,
  "situacao" text,
  "observacoes" text,
  "criado_em" text,
  "atualizado_em" text,
  "atualizado_por" text,
  primary key (escritorio_id, "id")
);
alter table despesas add column if not exists "id" text;
alter table despesas add column if not exists "descricao" text;
alter table despesas add column if not exists "categoria" text;
alter table despesas add column if not exists "valor" text;
alter table despesas add column if not exists "vencimento" text;
alter table despesas add column if not exists "pago_em" text;
alter table despesas add column if not exists "valor_pago" text;
alter table despesas add column if not exists "forma" text;
alter table despesas add column if not exists "cliente_id" text;
alter table despesas add column if not exists "processo_id" text;
alter table despesas add column if not exists "reembolsavel" text;
alter table despesas add column if not exists "reembolsado_em" text;
alter table despesas add column if not exists "recorrente" text;
alter table despesas add column if not exists "serie_id" text;
alter table despesas add column if not exists "situacao" text;
alter table despesas add column if not exists "observacoes" text;
alter table despesas add column if not exists "criado_em" text;
alter table despesas add column if not exists "atualizado_em" text;
alter table despesas add column if not exists "atualizado_por" text;
alter table despesas enable row level security;
drop policy if exists "despesas: só o próprio escritório" on despesas; -- só o servidor (service_role) lê e grava as tabelas brutas

-- ===== Leitura rápida do painel (8.27) =====
-- Listas prontas de cada tela, calculadas pelo servidor POR PERFIL (já com o filtro do RH) ou por pessoa, e a versão dos dados.
create table if not exists respostas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  perfil text not null, quem text not null, chave text not null, rota text, versao text, dados jsonb, atualizado_em timestamptz default now(),
  primary key (escritorio_id, perfil, quem, chave)
);
create table if not exists estado (escritorio_id uuid primary key references escritorios(id) on delete cascade, versao text, atualizado_em timestamptz default now());
alter table respostas enable row level security;
alter table estado enable row level security;
-- cada usuário do painel tem login próprio no Supabase; escritório, perfil e id ficam no app_metadata (só o servidor muda)
drop policy if exists "respostas: só o meu perfil" on respostas;
create policy "respostas: só o meu perfil" on respostas for select to authenticated using (
  escritorio_id = nullif(auth.jwt() -> 'app_metadata' ->> 'escritorio_id', '')::uuid
  and perfil = auth.jwt() -> 'app_metadata' ->> 'perfil'
  and (quem = 'perfil' or quem = auth.jwt() -> 'app_metadata' ->> 'uid'));
drop policy if exists "estado: só o meu escritório" on estado;
create policy "estado: só o meu escritório" on estado for select to authenticated using (escritorio_id = nullif(auth.jwt() -> 'app_metadata' ->> 'escritorio_id', '')::uuid);
grant usage on schema public to authenticated, service_role;
grant select on respostas, estado to authenticated;
grant all on all tables in schema public to service_role;
