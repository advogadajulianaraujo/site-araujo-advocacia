-- Painel jurídico — passos 2 a 6 do banco novo (8.28 a 8.32): o painel LÊ direto do Supabase; gravar continua pelo Apps Script.
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

-- 1b) (8.31) senhas embaralhadas no banco (só o servidor lê; painel_ler nunca entrega hash/salt)
alter table usuarios add column if not exists hash text;
alter table usuarios add column if not exists salt text;

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
       and column_name not in ('escritorio_id', '_sinc', 'hash', 'salt') -- 8.31: senha embaralhada NUNCA vai ao navegador
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

-- 7) (8.29) LEITURA pelo servidor quando o Supabase é o banco principal: a tabela inteira do escritório, compacta
--    (nomes das colunas uma vez + uma lista por linha, na ordem de _n), com quantas linhas e a maior _n (para conferir com a planilha).
-- 8.36.3: mais leve (o Google chamava isto milhares de vezes por dia e o banco ficava lento): colunas pelo pg_attribute (o
-- information_schema gastava ~60 ms só para planejar) e json em vez de jsonb (~30% mais rápido). Mesmo formato de resposta.
create or replace function painel_cols_(p_tabela text, p_tira text[]) returns table(cols text, nomes json)
language sql stable security definer set search_path = public as $$
  select string_agg(format('coalesce(%I::text, %L)', a.attname, ''), ', ' order by a.attnum), json_agg(a.attname order by a.attnum)
    from pg_attribute a
   where a.attrelid = to_regclass('public.' || quote_ident(p_tabela)) and a.attnum > 0 and not a.attisdropped and a.attname <> all(p_tira)
$$;
revoke all on function painel_cols_(text, text[]) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'painel_tabela' and p.prorettype = 'jsonb'::regtype)
    then drop function public.painel_tabela(text, uuid); end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'painel_tabelas' and p.prorettype = 'jsonb'::regtype)
    then drop function public.painel_tabelas(uuid, text[]); end if;
end $$;
create or replace function painel_tabela(p_tabela text, p_escritorio uuid) returns json
language plpgsql security definer set search_path = public as $$
declare cols text; nomes json; linhas json; n bigint; maxn integer;
begin
  if p_tabela !~ '^[a-z_]+$' or p_tabela like 'painel\_%' then raise exception 'tabela inválida'; end if;
  select c.cols, c.nomes into cols, nomes from painel_cols_(p_tabela, array['escritorio_id', '_sinc', '_em']) c;
  if cols is null then raise exception 'tabela % não existe', p_tabela; end if;
  execute format('select coalesce(json_agg(json_build_array(%s) order by _n), ''[]''::json), count(*), coalesce(max(_n), 1) from public.%I where escritorio_id = $1', cols, p_tabela)
    into linhas, n, maxn using p_escritorio;
  return json_build_object('cols', nomes, 'linhas', linhas, 'n', n, 'max_n', maxn);
end $$;
revoke all on function painel_tabela(text, uuid) from public, anon, authenticated;
grant execute on function painel_tabela(text, uuid) to service_role;

-- 8) (8.30) GRAVAÇÃO com o Supabase em primeiro lugar: todas as mudanças de um pedido numa transação só (tudo ou nada).
--    p_ops = [{t, del:[chaves], upd:[{k, cols:{coluna: valor}}], ins:[{coluna: valor}]}]. Chave = id (ou _n nas abas sem id).
--    Linha nova ganha o próximo número (_n = maior + 1, com trava por tabela); atualização muda SÓ as colunas enviadas;
--    atualizar uma linha que não existe mais = erro (nada é gravado). Devolve os _n das linhas novas, na ordem.
create or replace function painel_aplicar(p_escritorio uuid, p_ops jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare op jsonb; t text; ch text; u jsonb; cols text; vals text; n integer; base integer; novos jsonb; res jsonb := '{}'::jsonb;
        agora text := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); linha jsonb; i integer;
begin
  for op in select * from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    t := op ->> 't';
    if t is null or t !~ '^[a-z_]+$' or t like 'painel\_%' or not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      raise exception 'tabela inválida: %', t;
    end if;
    ch := painel_chave_(t);
    -- apagar
    if jsonb_array_length(coalesce(op -> 'del', '[]'::jsonb)) > 0 then
      execute format('delete from public.%I where escritorio_id = $1 and %I::text in (select jsonb_array_elements_text($2))', t, ch) using p_escritorio, op -> 'del';
    end if;
    -- atualizar (só as colunas enviadas)
    for u in select * from jsonb_array_elements(coalesce(op -> 'upd', '[]'::jsonb)) loop
      select string_agg(quote_ident(k), ', '), string_agg('x.' || quote_ident(k), ', ') into cols, vals
        from jsonb_object_keys(u -> 'cols') k
       where exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = k)
         and k not in ('escritorio_id', '_n', '_em', '_sinc', ch);
      if cols is null then continue; end if;
      -- 8.32: com "v" (o _sinc lido), só grava se ninguém mudou a linha no meio; senão erro 'conflito' (quem pediu lê de novo e refaz)
      execute format('update public.%1$I as d set (%2$s, _sinc, _em) = (select %3$s, $3, now() from jsonb_populate_record(null::public.%1$I, $4) x) where d.escritorio_id = $1 and d.%4$I::text = $2 and ($5::text is null or coalesce(d._sinc, %5$L) = $5)',
                     t, cols, vals, ch, '') using p_escritorio, u ->> 'k', agora, u -> 'cols', u ->> 'v';
      get diagnostics n = row_count;
      if n = 0 and (u ->> 'v') is not null then
        execute format('select count(*) from public.%I where escritorio_id = $1 and %I::text = $2', t, ch) into n using p_escritorio, u ->> 'k';
        if n > 0 then raise exception 'conflito: % de % mudou enquanto era gravada', u ->> 'k', t using errcode = 'PT409'; end if; -- 8.36.5: NÃO usar 40001 — o PostgREST repete sozinho e sem parar (16/11: ~170 repetições/s derrubaram o banco)
        n := 0;
      end if;
      if n = 0 then raise exception 'A linha % de % não existe mais no banco (mudou por outro lado). Nada foi gravado.', u ->> 'k', t; end if;
    end loop;
    -- inserir (com o próximo número de linha)
    if jsonb_array_length(coalesce(op -> 'ins', '[]'::jsonb)) > 0 then
      perform pg_advisory_xact_lock(hashtext(t || ':' || p_escritorio::text));
      execute format('select coalesce(max(_n), 1) from public.%I where escritorio_id = $1', t) into base using p_escritorio;
      novos := '[]'::jsonb; i := 0;
      for linha in select * from jsonb_array_elements(op -> 'ins') loop
        i := i + 1;
        novos := novos || jsonb_build_array(linha || jsonb_build_object('escritorio_id', p_escritorio, '_n', base + i, '_sinc', agora));
      end loop;
      select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
        from information_schema.columns where table_schema = 'public' and table_name = t and column_name <> '_em';
      execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)', t, cols) using novos;
      res := res || jsonb_build_object(t, (select jsonb_agg(base + g) from generate_series(1, i) g));
    end if;
    -- 8.32: quando cada aba mudou pela última vez (a cópia banco → planilha sabe o que copiar, venha a mudança de onde vier)
    insert into painel_estado (escritorio_id, chave, valor, em) values (p_escritorio, 'mudou:' || t, agora, now())
      on conflict (escritorio_id, chave) do update set valor = excluded.valor, em = now();
  end loop;
  return res;
end $$;
revoke all on function painel_aplicar(uuid, jsonb) from public, anon, authenticated;
grant execute on function painel_aplicar(uuid, jsonb) to service_role;

-- 9) (8.32 Etapa C) o motor do painel no Supabase (Edge Function "painel", com a chave secreta só lá dentro)
-- 9a) várias abas de uma vez, com o _sinc (versão de cada linha)
create or replace function painel_tabelas(p_escritorio uuid, p_tabelas text[]) returns json
language plpgsql security definer set search_path = public as $$
declare t text; cols text; nomes json; linhas json; maxn integer; partes text[] := '{}';
begin
  foreach t in array coalesce(p_tabelas, '{}'::text[]) loop
    if t !~ '^[a-z_]+$' or t like 'painel\_%' then raise exception 'tabela inválida: %', t; end if;
    select c.cols, c.nomes into cols, nomes from painel_cols_(t, array['escritorio_id', '_em']) c;
    if cols is null then raise exception 'tabela % não existe', t; end if;
    execute format('select coalesce(json_agg(json_build_array(%s) order by _n), ''[]''::json), coalesce(max(_n), 1) from public.%I where escritorio_id = $1', cols, t)
      into linhas, maxn using p_escritorio;
    partes := partes || (to_json(t)::text || ':' || json_build_object('cols', nomes, 'linhas', linhas, 'max_n', maxn)::text);
  end loop;
  return ('{' || coalesce(array_to_string(partes, ','), '') || '}')::json;
end $$;
-- 9b) confere a sessão do banco (as mesmas regras do painel_ler) e devolve quem é a pessoa (sem hash/salt)
create or replace function painel_quem(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s painel_sessoes%rowtype; us jsonb; est jsonb;
begin
  select * into s from painel_sessoes where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found or s.expira_em < now() or s.ultimo_uso < now() - interval '6 hours' then raise exception 'sessão do banco expirada' using errcode = '28000'; end if;
  select to_jsonb(x) - 'hash' - 'salt' - 'escritorio_id' - '_sinc' - '_em' into us from usuarios x
   where x.escritorio_id = s.escritorio_id and x.id = s.usuario_id and x.ativo = 'sim' and x.perfil = s.perfil and coalesce(nullif(x.sessao_versao, ''), '0') = s.versao;
  if us is null then raise exception 'sessão do banco expirada' using errcode = '28000'; end if;
  if s.ultimo_uso < now() - interval '1 minute' then update painel_sessoes set ultimo_uso = now() where token_hash = s.token_hash; end if;
  select coalesce(jsonb_object_agg(e.chave, e.valor), '{}'::jsonb) into est from painel_estado e where e.escritorio_id = s.escritorio_id and e.chave in ('pendente', 'asaas', 'edge');
  return jsonb_build_object('escritorio_id', s.escritorio_id, 'usuario', us, 'estado', est);
end $$;
-- 9c) pedidos já feitos (o mesmo pedido mandado de novo não grava duas vezes)
create table if not exists painel_pedidos (
  escritorio_id uuid not null references escritorios(id) on delete cascade,
  id text not null,
  em timestamptz not null default now(),
  resposta jsonb,
  primary key (escritorio_id, id)
);
alter table painel_pedidos enable row level security;
create or replace function painel_aplicar_pedido(p_escritorio uuid, p_pedido text, p_ops jsonb, p_resposta jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; ja jsonb;
begin
  if p_pedido is not null then
    select resposta into ja from painel_pedidos where escritorio_id = p_escritorio and id = p_pedido;
    if found then return jsonb_build_object('repetido', true, 'resposta', ja); end if;
  end if;
  r := painel_aplicar(p_escritorio, p_ops);
  if p_pedido is not null then
    insert into painel_pedidos (escritorio_id, id, resposta) values (p_escritorio, p_pedido, p_resposta);
    delete from painel_pedidos where escritorio_id = p_escritorio and em < now() - interval '7 days';
  end if;
  return jsonb_build_object('novos', r);
end $$;
-- 9d) abas que mudaram desde um momento (para a cópia banco → planilha)
create or replace function painel_mudadas(p_escritorio uuid, p_desde text) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(substr(chave, 7)), '[]'::jsonb) from painel_estado
   where escritorio_id = p_escritorio and chave like 'mudou:%' and (p_desde is null or valor > p_desde)
$$;
revoke all on function painel_tabelas(uuid, text[]) from public, anon, authenticated;
revoke all on function painel_quem(text) from public, anon, authenticated;
revoke all on function painel_aplicar_pedido(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function painel_mudadas(uuid, text) from public, anon, authenticated;
grant execute on function painel_tabelas(uuid, text[]) to service_role;
grant execute on function painel_quem(text) to service_role;
grant execute on function painel_aplicar_pedido(uuid, text, jsonb, jsonb) to service_role;
grant execute on function painel_mudadas(uuid, text) to service_role;
revoke all on table painel_pedidos from anon, authenticated;

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

-- ====================================================================================================================
-- 8.33 ETAPA D — entrar no painel sem o Google. A função "painel" confere usuário e senha (mesmo cálculo do Apps Script),
-- cria as duas sessões e devolve tudo ao navegador. A chave das senhas fica no COFRE do Supabase (Vault: guardada
-- criptografada; só estas funções do servidor leem). Só vale quando o escritório liga (painel_estado login_edge = sim).
-- ====================================================================================================================
create or replace function painel_segredo_gravar(p_escritorio uuid, p_valor text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare nome text := 'painel_senhas_' || p_escritorio::text; sid uuid;
begin
  select id into sid from vault.secrets where name = nome;
  if coalesce(p_valor, '') = '' then
    if sid is not null then delete from vault.secrets where id = sid; end if;
    return;
  end if;
  if sid is null then perform vault.create_secret(p_valor, nome, 'chave das senhas do painel (não compartilhar)');
  else perform vault.update_secret(sid, p_valor); end if;
end $$;

-- contador geral de senhas erradas (15 min), como o "login_falhas" do Apps Script
create or replace function painel_login_falhas_(p_valor text) returns integer language sql immutable as $$
  select case when nullif(split_part(coalesce(p_valor, ''), '|', 2), '') is null
               or split_part(p_valor, '|', 2)::timestamptz < now() - interval '15 minutes' then 0
              else coalesce(nullif(split_part(p_valor, '|', 1), '')::integer, 0) end
$$;
create or replace function painel_login_falha(p_escritorio uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v text; n integer; desde text;
begin
  select valor into v from painel_estado where escritorio_id = p_escritorio and chave = 'login_falhas' for update;
  n := painel_login_falhas_(v);
  desde := case when n = 0 then now()::text else split_part(v, '|', 2) end;
  n := n + 1;
  insert into painel_estado (escritorio_id, chave, valor, em) values (p_escritorio, 'login_falhas', n || '|' || desde, now())
    on conflict (escritorio_id, chave) do update set valor = excluded.valor, em = now();
  return n;
end $$;

-- o que a função precisa para conferir a senha (o escritório que ligou "Entrar pelo Supabase")
create or replace function painel_login_info() returns jsonb
language plpgsql security definer set search_path = public, vault as $$
declare escs uuid[]; esc uuid; seg text; est jsonb;
begin
  select array_agg(escritorio_id) into escs from painel_estado where chave = 'login_edge' and valor = 'sim';
  if coalesce(array_length(escs, 1), 0) <> 1 then return null; end if;
  esc := escs[1];
  select decrypted_secret into seg from vault.decrypted_secrets where name = 'painel_senhas_' || esc::text;
  if coalesce(seg, '') = '' then return null; end if;
  select coalesce(jsonb_object_agg(e.chave, e.valor), '{}'::jsonb) into est from painel_estado e
   where e.escritorio_id = esc and e.chave in ('pendente', 'asaas', 'edge', 'publica', 'google');
  return jsonb_build_object('escritorio_id', esc, 'segredo', seg, 'estado', est,
    'falhas', painel_login_falhas_((select valor from painel_estado where escritorio_id = esc and chave = 'login_falhas')));
end $$;

-- cria a sessão do banco no login feito pela função (o mesmo que o Apps Script faz em banco.sessao)
create or replace function painel_sessao_nova(p_escritorio uuid, p_token_hash text, p_usuario_id text, p_usuario text, p_perfil text,
  p_permissoes jsonb, p_expira timestamptz, p_versao text, p_sessao text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from painel_sessoes where expira_em < now();
  insert into painel_sessoes (token_hash, escritorio_id, usuario_id, usuario, perfil, permissoes, expira_em, versao, sessao)
  values (p_token_hash, p_escritorio, p_usuario_id, p_usuario, p_perfil, coalesce(p_permissoes, '{}'::jsonb), p_expira, coalesce(nullif(p_versao, ''), '0'), p_sessao);
end $$;

-- Sair (pelo código da sessão do banco): apaga a sessão
create or replace function painel_sessao_sair(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from painel_sessoes where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

revoke all on function painel_segredo_gravar(uuid, text) from public, anon, authenticated;
revoke all on function painel_login_falha(uuid) from public, anon, authenticated;
revoke all on function painel_login_info() from public, anon, authenticated;
revoke all on function painel_sessao_nova(uuid, text, text, text, text, jsonb, timestamptz, text, text) from public, anon, authenticated;
revoke all on function painel_sessao_sair(text) from public, anon, authenticated;
grant execute on function painel_segredo_gravar(uuid, text) to service_role;
grant execute on function painel_login_falha(uuid) to service_role;
grant execute on function painel_login_info() to service_role;
grant execute on function painel_sessao_nova(uuid, text, text, text, text, jsonb, timestamptz, text, text) to service_role;
grant execute on function painel_sessao_sair(text) to service_role;

-- 8.33 (velocidade): "assinatura" de cada tabela (quantas linhas + última mudança + maior _n). A função "painel" guarda as tabelas
-- na memória entre um pedido e outro e só busca de novo a que mudou (antes buscava até 6 MB a cada pedido).
create or replace function painel_assinaturas(p_escritorio uuid, p_tabelas text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; a text; res jsonb := '{}'::jsonb;
begin
  foreach t in array coalesce(p_tabelas, '{}'::text[]) loop
    if t !~ '^[a-z_]+$' or t like 'painel\_%' then raise exception 'tabela inválida: %', t; end if;
    execute format('select count(*) || %L || coalesce(max(_em)::text, %L) || %L || coalesce(max(_n), 0) from public.%I where escritorio_id = $1', '|', '', '|', t)
      into a using p_escritorio;
    res := res || jsonb_build_object(t, a);
  end loop;
  return res;
end $$;
revoke all on function painel_assinaturas(uuid, text[]) from public, anon, authenticated;
grant execute on function painel_assinaturas(uuid, text[]) to service_role;

-- 8.33: qualquer mudança numa linha (venha de onde vier) marca _em = agora. O navegador e a função "painel" usam _em para saber o que
-- mudou; sem esta regra, uma mudança feita direto no banco ficaria invisível para eles.
create or replace function painel_marcar_em_() returns trigger language plpgsql as $$
begin new._em := now(); return new; end $$;
do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
            where c.table_schema = 'public' and c.column_name = '_em' and x.table_type = 'BASE TABLE' loop
    execute format('drop trigger if exists painel_em on public.%I', t);
    execute format('create trigger painel_em before update on public.%I for each row execute function painel_marcar_em_()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
