-- Painel jurídico — passo 2 do banco novo (8.28): o painel LÊ direto do Supabase; gravar continua pelo Apps Script.
-- Rodar UMA vez no Supabase › SQL Editor › New query › colar tudo › Run (depois do esquema.sql). Pode rodar de novo sem perder nada.
-- Nenhum dado de cliente nem chave está neste arquivo.
--
-- Como fica seguro:
--  * No login, o Apps Script cria uma "sessão do banco" (tabela painel_sessoes) com o perfil da pessoa e o que ela pode ler.
--    O navegador recebe só um código aleatório (o banco guarda só o resumo SHA-256 dele) e a chave PÚBLICA do projeto.
--  * O navegador só lê pela função painel_ler(código, pedidos): ela confere o código, o prazo (12 h no total, 6 h sem uso),
--    o escritório, e devolve só as tabelas/colunas/linhas que o perfil pode ver. As tabelas continuam fechadas (RLS) para o resto.
--  * Sair, "Desconectar agora", trocar senha/perfil ou desativar apaga a sessão do banco na hora.
--  * Só o Apps Script (chave secreta) grava: painel_gravar só aceita uma linha MAIS NOVA do que a que está no banco (_sinc),
--    então uma cópia atrasada nunca passa por cima de uma mudança recente.

-- 1) _em = quando a linha mudou no banco (o navegador busca só o que mudou desde a última vez)
do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           where c.table_schema = 'public' and c.column_name = 'escritorio_id' and c.table_name not like 'painel\_%'
  loop
    execute format('alter table public.%I add column if not exists _em timestamptz not null default now()', t);
    execute format('create index if not exists %I on public.%I (escritorio_id, _em)', t || '_em_idx', t);
  end loop;
end $$;

-- 2) sessões do banco (uma por login; só o Apps Script cria e apaga)
create table if not exists painel_sessoes (
  token_hash text primary key,
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  usuario_id text not null,
  usuario text not null,
  perfil text not null,
  permissoes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  ultimo_uso timestamptz not null default now(),
  versao text not null default '0',  -- sessao_versao da pessoa no login: trocou senha/perfil/desativou → a sessão cai
  sessao text                        -- resumo do código da sessão do Apps Script (Sair apaga)
);
alter table painel_sessoes add column if not exists versao text not null default '0';
alter table painel_sessoes add column if not exists sessao text;
create index if not exists painel_sessoes_usuario_idx on painel_sessoes (escritorio_id, usuario_id);
alter table painel_sessoes enable row level security; -- sem política: ninguém de fora lê

create index if not exists painel_sessoes_sessao_idx on painel_sessoes (sessao);

-- 3) estado (ex.: "pendente" = alguma mudança ainda não chegou; o navegador volta para a planilha enquanto isso)
create table if not exists painel_estado (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  chave text not null,
  valor text,
  em timestamptz not null default now(),
  primary key (escritorio_id, chave)
);
alter table painel_estado enable row level security;

-- coluna-chave de cada tabela: "id" se existir, senão o número da linha (_n) — igual à cópia do Apps Script
create or replace function painel_chave_(p_tabela text) returns text language sql stable set search_path = public as $$
  select case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_tabela and column_name = 'id')
              then 'id' else '_n' end
$$;

-- 4) LEITURA pelo navegador
create or replace function painel_ler(p_token text, p_pedidos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s painel_sessoes%rowtype;
  ped jsonb; t text; g jsonb; cols text; filtro text; v_chave text; desde timestamptz; meu text;
  res jsonb := '{}'::jsonb; linhas jsonb; n bigint; chs jsonb; pend text;
begin
  if p_token is null or length(p_token) < 40 then raise exception 'sessão do banco inválida' using errcode = '28000'; end if;
  select * into s from painel_sessoes where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found or s.expira_em < now() or s.ultimo_uso < now() - interval '6 hours' then
    raise exception 'sessão do banco expirada' using errcode = '28000';
  end if;
  -- a pessoa continua ativa, com o mesmo perfil e sem troca de senha/"desconectar agora" (a aba usuarios chega na hora)
  if not exists (select 1 from usuarios us where us.escritorio_id = s.escritorio_id and us.id = s.usuario_id and us.ativo = 'sim'
                  and us.perfil = s.perfil and coalesce(nullif(us.sessao_versao, ''), '0') = s.versao) then
    delete from painel_sessoes where token_hash = s.token_hash;
    raise exception 'sessão do banco expirada' using errcode = '28000';
  end if;
  if s.ultimo_uso < now() - interval '1 minute' then update painel_sessoes set ultimo_uso = now() where token_hash = s.token_hash; end if;

  for ped in select * from jsonb_array_elements(coalesce(p_pedidos, '[]'::jsonb)) loop
    t := ped ->> 't';
    g := s.permissoes -> t;
    if t is null or t !~ '^[a-z_]+$' or g is null or t like 'painel\_%'
       or not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      res := res || jsonb_build_object(coalesce(t, '?'), jsonb_build_object('negado', true));
      continue;
    end if;
    -- colunas: as liberadas (g.cols) ou todas menos as escondidas (g.fora); sempre _n e _em.
    -- g.mascarar: o navegador só fica sabendo SE tem valor ("•"; "" e "-" passam como estão), nunca o valor
    -- (ex.: o resumo do código do Acompanhe; os andamentos do DataJud, grandes e que as listas não mostram)
    -- g.outros (tarefas fora da administração): as linhas de OUTRAS pessoas vêm só com as colunas de g.outros.cols e, na coluna
    -- g.outros.marcas, só as marcas internas ("[intim:…]", "[fluxo:…]"…); _meu diz se a linha é da pessoa.
    meu := format('(responsavel = %L or (coalesce(responsavel, %L) = %L and criado_por = %L))', s.usuario, '', '', s.usuario);
    select string_agg(case when coalesce((g -> 'mascarar') ? column_name, false)
                           then format('case when coalesce(%1$I, %2$L) in (%2$L, %4$L) then coalesce(%1$I, %2$L) else %3$L end as %1$I', column_name, '', '•', '-')
                           when (g -> 'outros') is not null and column_name not in ('_n', '_em') and column_name = (g -> 'outros' ->> 'marcas')
                           then format('case when %2$s then %1$I else coalesce((select string_agg(m[1], E''\n'') from regexp_matches(coalesce(%1$I, ''''), ''(\[[a-z0-9_]+:[^\]]*\])'', ''g'') as m), '''') end as %1$I', column_name, meu)
                           when (g -> 'outros') is not null and column_name not in ('_n', '_em') and not coalesce((g -> 'outros' -> 'cols') ? column_name, false)
                           then format('case when %2$s then %1$I else %3$L end as %1$I', column_name, meu, '')
                           else quote_ident(column_name) end, ', ' order by ordinal_position)
           || case when (g -> 'outros') is not null then ', ' || meu || ' as _meu' else '' end into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t
       and column_name not in ('escritorio_id', '_sinc')
       and (column_name in ('_n', '_em')
            or ((g -> 'cols') is null or (g -> 'cols') ? column_name)
               and not coalesce((g -> 'fora') ? column_name, false));
    filtro := format('escritorio_id = %L', s.escritorio_id);
    if g ->> 'filtro' = 'minhas_tarefas' then
      filtro := filtro || format(' and (responsavel = %L or (coalesce(responsavel, %L) = %L and criado_por = %L))', s.usuario, '', '', s.usuario);
    end if;
    if t = 'config' then
      if (g -> 'chaves') is null then res := res || jsonb_build_object(t, jsonb_build_object('negado', true)); continue; end if;
      filtro := filtro || format(' and chave in (select jsonb_array_elements_text(%L::jsonb))', (g -> 'chaves')::text);
    end if;
    desde := nullif(ped ->> 'desde', '')::timestamptz;
    execute format('select coalesce(jsonb_agg(to_jsonb(x) order by x._n), ''[]''::jsonb) from (select %s from public.%I where %s%s) x',
                   cols, t, filtro, case when desde is null then '' else format(' and _em > %L', desde) end) into linhas;
    execute format('select count(*) from public.%I where %s', t, filtro) into n;
    chs := null;
    if coalesce((ped ->> 'chaves')::boolean, false) then
      v_chave := painel_chave_(t);
      execute format('select coalesce(jsonb_agg(%I), ''[]''::jsonb) from public.%I where %s', v_chave, t, filtro) into chs;
    end if;
    res := res || jsonb_build_object(t, jsonb_build_object('linhas', linhas, 'n', n, 'chaves', chs));
  end loop;
  select e.valor into pend from painel_estado e where e.escritorio_id = s.escritorio_id and e.chave = 'pendente';
  return jsonb_build_object('agora', now(), 'pendente', pend, 'tabelas', res);
end $$;

-- 5) GRAVAÇÃO (só o Apps Script, com a chave secreta): uma linha só entra se for MAIS NOVA (_sinc) e diferente
create or replace function painel_gravar(p_tabela text, p_linhas jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare chave text; cols text; sets text; cmp_t text; cmp_e text; n integer;
begin
  if p_tabela !~ '^[a-z_]+$' or p_tabela like 'painel\_%' then raise exception 'tabela inválida'; end if;
  chave := painel_chave_(p_tabela);
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(format('%1$I = excluded.%1$I', column_name), ', ' order by ordinal_position) filter (where column_name not in ('escritorio_id', chave)),
         string_agg(format('t.%I', column_name), ', ' order by ordinal_position) filter (where column_name not in ('escritorio_id', '_sinc', chave)),
         string_agg(format('excluded.%I', column_name), ', ' order by ordinal_position) filter (where column_name not in ('escritorio_id', '_sinc', chave))
    into cols, sets, cmp_t, cmp_e
    from information_schema.columns where table_schema = 'public' and table_name = p_tabela and column_name <> '_em';
  if cols is null then raise exception 'tabela % não existe', p_tabela; end if;
  execute format('insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) '
              || 'on conflict (escritorio_id, %3$I) do update set %4$s, _em = now() '
              || 'where (t._sinc is null or t._sinc <= excluded._sinc) and (%5$s) is distinct from (%6$s)',
                 p_tabela, cols, chave, sets, cmp_t, cmp_e) using p_linhas;
  get diagnostics n = row_count;
  return n;
end $$;

-- 6) apagar linhas que saíram da planilha. p_chaves = o que apagar; ou p_manter = tudo que existe (apaga o resto).
--    Nunca apaga uma linha gravada DEPOIS de p_ate (_sinc mais novo).
create or replace function painel_apagar(p_tabela text, p_escritorio uuid, p_chaves jsonb, p_manter jsonb, p_ate text) returns integer
language plpgsql security definer set search_path = public as $$
declare chave text; n integer;
begin
  if p_tabela !~ '^[a-z_]+$' or p_tabela like 'painel\_%' then raise exception 'tabela inválida'; end if;
  chave := painel_chave_(p_tabela);
  if p_chaves is not null then
    execute format('delete from public.%I where escritorio_id = $1 and %I::text in (select jsonb_array_elements_text($2)) and (_sinc is null or _sinc <= $3)', p_tabela, chave)
      using p_escritorio, p_chaves, p_ate;
  else
    execute format('delete from public.%I where escritorio_id = $1 and %I::text not in (select jsonb_array_elements_text($2)) and (_sinc is null or _sinc < $3)', p_tabela, chave)
      using p_escritorio, coalesce(p_manter, '[]'::jsonb), p_ate;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function painel_gravar(text, jsonb) from public, anon, authenticated;
revoke all on function painel_apagar(text, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function painel_chave_(text) from public, anon, authenticated;
grant execute on function painel_gravar(text, jsonb) to service_role;
grant execute on function painel_apagar(text, uuid, jsonb, jsonb, text) to service_role;
grant execute on function painel_chave_(text) to service_role;
revoke all on function painel_ler(text, jsonb) from public;
grant execute on function painel_ler(text, jsonb) to anon, authenticated, service_role;
revoke all on table painel_sessoes from anon, authenticated;
revoke all on table painel_estado from anon, authenticated;
notify pgrst, 'reload schema';
