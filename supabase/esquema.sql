-- Painel jurídico — esquema do banco (Supabase / PostgreSQL), gerado do ESQUEMA do Code.gs (versão 8.25.0).
-- Uma tabela por aba da planilha, com as MESMAS colunas (texto), mais escritorio_id para vários escritórios (SaaS).
-- Rodar no Supabase › SQL Editor. Nenhum dado vai neste arquivo.

create table if not exists escritorios (id uuid primary key default gen_random_uuid(), nome text not null, criado_em timestamptz default now());

create table if not exists config (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "chave" text,
  "valor" text,
  "descricao" text
);
alter table config enable row level security;
create policy "config: só o próprio escritório" on config for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists usuarios (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "id" text,
  "usuario" text,
  "nome" text,
  "perfil" text,
  "hash" text,
  "salt" text,
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
alter table usuarios enable row level security;
create policy "usuarios: só o próprio escritório" on usuarios for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists obs_arquivo (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "id" text,
  "cliente_id" text,
  "texto" text,
  "arquivado_em" text,
  primary key (escritorio_id, "id")
);
alter table obs_arquivo enable row level security;
create policy "obs_arquivo: só o próprio escritório" on obs_arquivo for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists clientes (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table clientes enable row level security;
create policy "clientes: só o próprio escritório" on clientes for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists processos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table processos enable row level security;
create policy "processos: só o próprio escritório" on processos for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists intimacoes (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table intimacoes enable row level security;
create policy "intimacoes: só o próprio escritório" on intimacoes for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists prazos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table prazos enable row level security;
create policy "prazos: só o próprio escritório" on prazos for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists honorarios (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table honorarios enable row level security;
create policy "honorarios: só o próprio escritório" on honorarios for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists parcelas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table parcelas enable row level security;
create policy "parcelas: só o próprio escritório" on parcelas for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists recebimentos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table recebimentos enable row level security;
create policy "recebimentos: só o próprio escritório" on recebimentos for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists audiencias (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
  "atualizado_por" text
);
alter table audiencias enable row level security;
create policy "audiencias: só o próprio escritório" on audiencias for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists eventos (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
  "avisado_dia_por" text
);
alter table eventos enable row level security;
create policy "eventos: só o próprio escritório" on eventos for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists feriados (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "data" text,
  "descricao" text,
  "abrangencia" text
);
alter table feriados enable row level security;
create policy "feriados: só o próprio escritório" on feriados for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists log (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "quando" text,
  "usuario" text,
  "acao" text,
  "detalhe" text
);
alter table log enable row level security;
create policy "log: só o próprio escritório" on log for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists log_arquivo (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "quando" text,
  "usuario" text,
  "acao" text,
  "detalhe" text
);
alter table log_arquivo enable row level security;
create policy "log_arquivo: só o próprio escritório" on log_arquivo for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists leads (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table leads enable row level security;
create policy "leads: só o próprio escritório" on leads for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists transcricoes (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table transcricoes enable row level security;
create policy "transcricoes: só o próprio escritório" on transcricoes for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists padroes (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "id" text,
  "grupo" text,
  "titulo" text,
  "texto" text,
  "ordem" text,
  "atualizado_em" text,
  "atualizado_por" text,
  primary key (escritorio_id, "id")
);
alter table padroes enable row level security;
create policy "padroes: só o próprio escritório" on padroes for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists conversas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table conversas enable row level security;
create policy "conversas: só o próprio escritório" on conversas for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists avisos (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "chave" text,
  "tipo" text,
  "ref" text,
  "em" text,
  "por" text
);
alter table avisos enable row level security;
create policy "avisos: só o próprio escritório" on avisos for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists mensagens (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table mensagens enable row level security;
create policy "mensagens: só o próprio escritório" on mensagens for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists assinaturas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table assinaturas enable row level security;
create policy "assinaturas: só o próprio escritório" on assinaturas for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists pastas_conferir (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "pasta" text,
  "pasta_url" text,
  "motivo" text,
  "clientes_possiveis" text
);
alter table pastas_conferir enable row level security;
create policy "pastas_conferir: só o próprio escritório" on pastas_conferir for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists advogados (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table advogados enable row level security;
create policy "advogados: só o próprio escritório" on advogados for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists tarefas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table tarefas enable row level security;
create policy "tarefas: só o próprio escritório" on tarefas for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists contatos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table contatos enable row level security;
create policy "contatos: só o próprio escritório" on contatos for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists marketing (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table marketing enable row level security;
create policy "marketing: só o próprio escritório" on marketing for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists site_cliques (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "quando" text,
  "pagina" text,
  "area" text,
  "origem" text,
  "campanha" text,
  "canal" text
);
alter table site_cliques enable row level security;
create policy "site_cliques: só o próprio escritório" on site_cliques for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists mkt_funil (
  _linha bigint generated always as identity primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "mes" text,
  "pagina" text,
  "conversas" text,
  "consultas" text,
  "atualizado_em" text,
  "atualizado_por" text
);
alter table mkt_funil enable row level security;
create policy "mkt_funil: só o próprio escritório" on mkt_funil for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists pix (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table pix enable row level security;
create policy "pix: só o próprio escritório" on pix for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists fut_unidades (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table fut_unidades enable row level security;
create policy "fut_unidades: só o próprio escritório" on fut_unidades for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists fut_pessoas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table fut_pessoas enable row level security;
create policy "fut_pessoas: só o próprio escritório" on fut_pessoas for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists fut_lanc (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table fut_lanc enable row level security;
create policy "fut_lanc: só o próprio escritório" on fut_lanc for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists fut_cobrancas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table fut_cobrancas enable row level security;
create policy "fut_cobrancas: só o próprio escritório" on fut_cobrancas for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists fut_contratos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table fut_contratos enable row level security;
create policy "fut_contratos: só o próprio escritório" on fut_contratos for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists fut_energia (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  "id" text,
  "competencia" text,
  "unidade" text,
  "valor" text,
  "kwh" text,
  "origem" text,
  "criado_em" text,
  primary key (escritorio_id, "id")
);
alter table fut_energia enable row level security;
create policy "fut_energia: só o próprio escritório" on fut_energia for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists fut_lavagens (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table fut_lavagens enable row level security;
create policy "fut_lavagens: só o próprio escritório" on fut_lavagens for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

create table if not exists despesas (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
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
alter table despesas enable row level security;
create policy "despesas: só o próprio escritório" on despesas for all using (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid) with check (escritorio_id = (auth.jwt() ->> 'escritorio_id')::uuid);

