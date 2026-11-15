// 8.34: atualização automática (o Apps Script instala sozinho a versão nova do GitHub) e o robô do DJEN entrando com a identidade
// assinada pelo GitHub (sem segredo). O Google, o GitHub e o Supabase de fora são simulados aqui. Dados INVENTADOS.
import { createRequire } from 'node:module'; import crypto from 'node:crypto'; import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const T = require('./teste.js'); const { S, C, assert } = T;
const P = C.PropertiesService.getScriptProperties();
const fonteAtual = readFileSync(new URL('../../../painel-backend/Code.gs', import.meta.url), 'utf8');
const manAtual = readFileSync(new URL('../../../painel-backend/appsscript.json', import.meta.url), 'utf8');
// ---------- 1) identidade do GitHub (OIDC, RS256) ----------
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (corpo, chave = privateKey, kid = 'k1') => { const h = b64({ alg: 'RS256', typ: 'JWT', kid }), c = b64(corpo); return h + '.' + c + '.' + crypto.sign('sha256', Buffer.from(h + '.' + c), chave).toString('base64url'); };
const agora = Math.floor(Date.now() / 1000), REPO = 'advogadajulianaraujo/site-araujo-advocacia';
const certo = { iss: 'https://token.actions.githubusercontent.com', aud: 'painel-araujo-djen', exp: agora + 300, nbf: agora - 5, repository: REPO, ref: 'refs/heads/main',
  workflow_ref: REPO + '/.github/workflows/robo-djen.yml@refs/heads/main' };
C.CacheService.getScriptCache().put('gh_jwks', JSON.stringify({ keys: [jwk] }));
assert(C.oidcGithubValido_(jwt(certo)) === true, 'identidade do robô do DJEN (assinada pelo GitHub) aceita');
const outra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
assert(C.oidcGithubValido_(jwt(certo, outra)) === false, 'assinatura falsa recusada');
assert(C.oidcGithubValido_(jwt(Object.assign({}, certo, { repository: 'outra-pessoa/outro-repo' }))) === false, 'outro repositório recusado');
assert(C.oidcGithubValido_(jwt(Object.assign({}, certo, { workflow_ref: REPO + '/.github/workflows/blog-semanal.yml@refs/heads/main' }))) === false, 'outro robô do mesmo repositório recusado');
assert(C.oidcGithubValido_(jwt(Object.assign({}, certo, { ref: 'refs/heads/teste' }))) === false, 'ramo que não é o main recusado');
assert(C.oidcGithubValido_(jwt(Object.assign({}, certo, { exp: agora - 10 }))) === false, 'identidade vencida recusada');
assert(C.oidcGithubValido_(jwt(Object.assign({}, certo, { aud: 'outra-coisa' }))) === false, 'identidade para outro destino recusada');
const ad = jwt(certo).split('.'); const mexido = ad[0] + '.' + b64(Object.assign({}, certo, { repository: REPO + 'x' })) + '.' + ad[2];
assert(C.oidcGithubValido_(mexido) === false, 'identidade alterada depois de assinada recusada');
let r = JSON.parse(C.doPost({ postData: { contents: JSON.stringify({ acao: 'djen.robo', dados: { acao: 'erro', erro: 'teste', oidc: jwt(certo) } }) } }).getContent());
assert(r.ok, 'rota djen.robo aceita o robô pela identidade, sem chave ' + (r.erro || ''));
r = JSON.parse(C.doPost({ postData: { contents: JSON.stringify({ acao: 'djen.robo', dados: { acao: 'config', oidc: jwt(certo, outra) } }) } }).getContent());
assert(!r.ok && /inválida/.test(r.erro), 'sem identidade válida nem chave: recusado');
// ---------- 2) atualização automática ----------
const nova = fonteAtual.replace(/^var VERSAO = '([^']+)'/m, "var VERSAO = '99.0.0'");
const projeto = { files: [{ name: 'Code', type: 'SERVER_JS', source: fonteAtual }, { name: 'appsscript', type: 'JSON', source: manAtual }] };
let versoes = 41, implantada = 41, github = { 'painel-backend/Code.gs': nova, 'painel-backend/appsscript.json': manAtual }, respondeVersao = '99.0.0', chamadas = [];
const fetchVelho = C.UrlFetchApp.fetch;
C.UrlFetchApp.fetch = (url, op = {}) => {
  const resp = (cod, obj) => ({ getResponseCode: () => cod, getContentText: () => typeof obj === 'string' ? obj : JSON.stringify(obj) });
  if (url.startsWith('https://raw.githubusercontent.com/')) { const f = url.split('/main/')[1].split('?')[0]; chamadas.push('github:' + f); return github[f] !== undefined ? resp(200, github[f]) : resp(404, ''); }
  if (url.startsWith('https://script.googleapis.com/v1/projects/ID')) {
    const cam = url.slice('https://script.googleapis.com/v1/projects/ID'.length), m = (op.method || 'get').toLowerCase(); chamadas.push('apps:' + m + cam);
    if (cam === '/content' && m === 'get') return resp(200, projeto);
    if (cam === '/content' && m === 'put') { projeto.files = JSON.parse(op.payload).files; return resp(200, projeto); }
    if (cam === '/versions') return resp(200, { versionNumber: ++versoes });
    if (cam === '/deployments/DEP' && m === 'get') return resp(200, { deploymentConfig: { versionNumber: implantada } });
    if (cam === '/deployments/DEP' && m === 'put') { implantada = JSON.parse(op.payload).deploymentConfig.versionNumber; return resp(200, {}); }
  }
  if (url === 'https://script.google.com/macros/s/DEP/exec') { chamadas.push('painel:situacao'); return resp(200, { ok: true, dados: { versao: implantada > 41 ? respondeVersao : C.VERSAO } }); }
  if (url.startsWith('https://api.supabase.com/')) { chamadas.push('supabase:' + url.split('/v1/projects/')[1].split('?')[0]); return resp(201, '{}'); }
  return fetchVelho(url, op);
};
C.ScriptApp = { getScriptId: () => 'ID', getOAuthToken: () => 'tok', getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/DEP/exec' }) };
C.Utilities.sleep = () => {};
r = C.autoAtualizar_(true);
assert(r.atualizado === '99.0.0' && projeto.files[0].source === nova && implantada === 42, 'versão nova no GitHub: troca o código, cria a versão e aponta o web app para ela (' + JSON.stringify(r).slice(0, 80) + ')');
assert(/^99\.0\.0 em /.test(C.config_('AUTO_ATUALIZADO')) && !C.config_('AUTO_ATUALIZAR_ERRO'), 'fica anotado "atualizado" no cartão');
assert(!chamadas.some(x => x.startsWith('supabase:')), 'sem a chave de publicação do Supabase: só o Google é atualizado');
// mesma versão: não faz nada
chamadas = []; github['painel-backend/Code.gs'] = fonteAtual; projeto.files[0].source = fonteAtual; implantada = 41; versoes = 41;
r = C.autoAtualizar_(true); assert(r.atual && !chamadas.some(x => x.startsWith('apps:')), 'GitHub com a mesma versão: não mexe em nada');
// versão mais VELHA no GitHub: não volta para trás
github['painel-backend/Code.gs'] = fonteAtual.replace(/^var VERSAO = '([^']+)'/m, "var VERSAO = '1.0.0'");
r = C.autoAtualizar_(true); assert(r.atual && projeto.files[0].source === fonteAtual, 'versão mais velha no GitHub: não volta para trás');
// erro de escrita: não instala
github['painel-backend/Code.gs'] = nova + '\nfunction quebrada( {';
r = C.autoAtualizar_(true); assert(/erro de escrita/.test(r.erro || '') && projeto.files[0].source === fonteAtual, 'código novo com erro de escrita: NÃO instala e avisa');
assert(/erro de escrita/.test(C.config_('AUTO_ATUALIZAR_ERRO')), 'o problema aparece no cartão (AUTO_ATUALIZAR_ERRO)');
// permissão nova do Google: não instala e explica
github['painel-backend/Code.gs'] = nova; const man2 = JSON.parse(manAtual); man2.oauthScopes.push('https://www.googleapis.com/auth/nova.permissao'); github['painel-backend/appsscript.json'] = JSON.stringify(man2);
P.deleteProperty('AUTO_FALHOU');
r = C.autoAtualizar_(true); assert(/permissão nova/.test(r.erro || '') && projeto.files[0].source === fonteAtual, 'versão que pede permissão nova: não instala e diz o que fazer');
github['painel-backend/appsscript.json'] = manAtual;
// a versão nova não responde: volta sozinho para a anterior
respondeVersao = '0.0.0'; P.deleteProperty('AUTO_FALHOU');
r = C.autoAtualizar_(true);
assert(/não respondeu/.test(r.erro || '') && projeto.files[0].source === fonteAtual && implantada === 41, 'versão nova não respondeu: voltou sozinho para a anterior (código e web app)');
// falhou há pouco: o robô não insiste a cada 10 min (espera 1 h), mas o botão força
respondeVersao = '99.0.0';
C.CacheService.getScriptCache().remove('auto_atualizar_visto');
r = C.autoAtualizar_(false); assert(r.esperando === '99.0.0', 'depois de uma falha, o robô espera 1 h antes de tentar a mesma versão');
r = C.autoAtualizar_(true); assert(r.atualizado === '99.0.0', '"Atualizar agora" tenta na hora');
// com a chave de publicação do Supabase: banco e função antes do Google
projeto.files[0].source = fonteAtual; implantada = 41; P.setProperty('SUPABASE_GESTAO', 'sbp_' + 'x'.repeat(30));
P.setProperty('SUPABASE_URL', 'https://abcdefgh.supabase.co');
github['supabase/esquema.sql'] = '-- esquema'; github['supabase/leitura-rapida.sql'] = '-- leitura';
['index.ts', 'servidor.js', 'motor.js'].forEach(f => { github['supabase/functions/painel/' + f] = '// ' + f; });
C.sbEdgePing_ = () => ({ ok: true, versao: '99.0.0' });
chamadas = []; r = C.autoAtualizar_(true);
const ordem = chamadas.filter(x => /^supabase:|apps:put\/content/.test(x));
assert(r.atualizado && r.supabase.feito && ordem[0].includes('database/query') && ordem[2].includes('functions/deploy') && /apps:put\/content/.test(ordem[3]),
  'com a chave de publicação: banco (2 arquivos) → função do Supabase → código do Google, nessa ordem');
// Supabase recusou: o Google não é atualizado (as versões ficam combinando)
projeto.files[0].source = fonteAtual; implantada = 41; P.deleteProperty('AUTO_FALHOU');
const f2 = C.UrlFetchApp.fetch; C.UrlFetchApp.fetch = (url, op) => url.startsWith('https://api.supabase.com/') ? { getResponseCode: () => 401, getContentText: () => '{}' } : f2(url, op);
r = C.autoAtualizar_(true);
assert(/chave de publicação do Supabase venceu/.test(r.erro || '') && projeto.files[0].source === fonteAtual, 'chave do Supabase vencida: não instala pela metade e diz o que fazer');
C.UrlFetchApp.fetch = fetchVelho;
console.log(process.exitCode ? '✗ HOUVE FALHAS' : '✓ atualização automática e robô do DJEN: tudo certo');
