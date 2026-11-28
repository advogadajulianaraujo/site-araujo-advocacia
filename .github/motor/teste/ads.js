// 8.64 Google Ads: palavras-chave, ordens aprovadas e o robô que só sugere (dados INVENTADOS)
const T = require('./teste.js'); const { C, assert } = T;
const chave = C.configGoogleAds_({}, { usuario: 'admin' }).chave;
const adm = { usuario: 'admin', nome: 'Admin Teste', perfil: 'administrador' };
const pal = [
  { campanha: 'Trabalhista — Teste', grupo: 'G1', grupo_id: '111', criterio_id: '1', palavra: 'advogado trabalhista exemplo', corresp: 'PHRASE', status: 'ENABLED', lance: 3, cliques: 40, impressoes: 900, custo: 120, conversoes: 0, qualidade: 6 },
  { campanha: 'Trabalhista — Teste', grupo: 'G1', grupo_id: '111', criterio_id: '2', palavra: 'rescisao indireta exemplo', corresp: 'EXACT', status: 'ENABLED', lance: 2, cliques: 30, impressoes: 500, custo: 40, conversoes: 4, qualidade: 8 },
  { campanha: 'Trabalhista — Teste', grupo: 'G1', grupo_id: '111', criterio_id: '3', palavra: 'direito trabalho exemplo', corresp: 'BROAD', status: 'ENABLED', lance: 2.5, cliques: 20, impressoes: 800, custo: 50, conversoes: 1, qualidade: 3 },
  { campanha: 'Família — Teste', grupo: 'G2', grupo_id: '222', criterio_id: '4', palavra: 'divorcio exemplo', corresp: 'PHRASE', status: 'ENABLED', lance: 0, auto_lance: true, cliques: 5, impressoes: 100, custo: 10, conversoes: 0 }];
const r = C.receberGoogleAds_({ chave, linhas: [], palavras: pal });
assert(r.palavras === 4 && r.sugestoes === 3 && r.comandos.length === 0, '4 palavras guardadas; o robô fez 3 SUGESTÕES e nenhuma ordem vai ao Google sem aprovação');
const lista = C.adsPalavras_({}, adm), sug = lista.comandos.filter(c => c.situacao === 'sugerida');
assert(sug.some(c => c.acao === 'pausar' && /nenhuma conversão/.test(c.motivo)) && sug.some(c => c.acao === 'lance_mais' && c.lance_novo === 2.2) && sug.some(c => c.acao === 'lance_menos' && /qualidade 3/.test(c.motivo)), 'pausar quem gasta sem converter; subir quem converte barato; baixar quem tem qualidade baixa');
C.adsComando_({ id: sug.find(c => c.acao === 'pausar').id, decisao: 'aprovar' }, adm);
C.adsComando_({ id: sug.find(c => c.acao === 'lance_menos').id, decisao: 'recusar' }, adm);
let err = ''; try { C.adsComando_({ palavra_id: '222~4', acao: 'lance_mais', pct: 10 }, adm); } catch (e) { err = e.message; }
assert(/lance automático/.test(err), 'campanha com lance automático: não cria ordem de lance');
C.adsComando_({ palavra_id: '222~4', acao: 'pausar' }, adm);
const r2 = C.receberGoogleAds_({ chave, palavras: pal });
assert(r2.comandos.length === 2 && r2.comandos.every(o => o.grupo_id && o.criterio_id) && r2.sugestoes === 0, 'o script recebe só as 2 APROVADAS; a recusada não volta como sugestão');
const r3 = C.receberGoogleAds_({ chave, resultados: r2.comandos.map((o, i) => ({ id: o.id, ok: i === 0, msg: i === 0 ? 'pausada' : 'erro de teste' })) });
const cm = C.adsPalavras_({}, adm).comandos;
assert(r3.resultados === 2 && cm.filter(c => c.situacao === 'aplicada').length === 1 && cm.filter(c => c.situacao === 'erro').length === 1, 'o resultado volta ao painel: aplicada / não aplicada');
let e2 = ''; try { C.receberGoogleAds_({ chave: 'errada', palavras: pal }); } catch (e) { e2 = e.message; }
assert(/inválida/.test(e2), 'chave errada é recusada');
console.log('fim ads');
