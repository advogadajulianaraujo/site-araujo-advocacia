// 8.63: modelos do Edifício Future — fiança no contrato residencial, contrato e laudo da SALA COMERCIAL, preenchimento das marcas.
// Google Docs/Drive falsos (só o que o Code.gs usa) e textos de modelo INVENTADOS (o repositório é público; os dados da locadora
// ficam só no Drive).
const T = require('./teste.js'); const { C, assert } = T;

// ---------- Google Docs falso ----------
const ET = { PARAGRAPH: 'PARAGRAPH', TABLE: 'TABLE', TABLE_CELL: 'TABLE_CELL', BODY_SECTION: 'BODY_SECTION' };
const HA = { CENTER: 'CENTER', JUSTIFY: 'JUSTIFY', LEFT: 'LEFT' };
const re = s => new RegExp(s, 'g');
function texto(get, set) {
  return { getText: get, setBold() { return this; }, setFontFamily() { return this; }, setFontSize() { return this; }, setItalic() { return this; } };
}
class Par {
  constructor(t, pai) { this.t = t; this.pai = pai; this.al = HA.LEFT; this.bold = false; }
  getType() { return ET.PARAGRAPH; } asParagraph() { return this; } getParent() { return this.pai; }
  getText() { return this.t; } setText(t) { this.t = t; return this; }
  replaceText(a, b) { this.t = this.t.replace(re(a), () => b.replace(/\\\$/g, '$')); return this; }
  removeFromParent() { this.pai.filhos.splice(this.pai.filhos.indexOf(this), 1); }
  copy() { const p = new Par(this.t, null); p.al = this.al; return p; }
  setHeading() { return this; } editAsText() { return texto(() => this.t); }
  getAlignment() { return this.al; } setAlignment(a) { this.al = a; return this; }
  setLineSpacing() { return this; } setSpacingAfter() { return this; } setIndentFirstLine() { return this; }
}
class Tab {
  constructor(linhas, pai) { this.pai = pai; this.cel = linhas.map(l => l.map(c => ({ t: c, getType: () => ET.TABLE_CELL }))); }
  getType() { return ET.TABLE; } getParent() { return this.pai; } getNumRows() { return this.cel.length; }
  getCell(r, c) { const x = this.cel[r][c]; return { editAsText: () => texto(() => x.t) }; }
  texto() { return this.cel.map(l => l.map(x => x.t).join(' | ')).join('\n'); }
  replaceText(a, b) { this.cel.forEach(l => l.forEach(x => { x.t = x.t.replace(re(a), () => b.replace(/\\\$/g, '$')); })); }
}
class Corpo {
  constructor(linhas) { this.filhos = []; linhas.forEach(l => this.filhos.push(Array.isArray(l) ? new Tab(l, this) : new Par(l, this))); }
  getType() { return ET.BODY_SECTION; }
  getParagraphs() { return this.filhos.filter(f => f instanceof Par); }
  getNumChildren() { return this.filhos.length; } getChild(i) { return this.filhos[i]; } getChildIndex(e) { return this.filhos.indexOf(e); }
  insertParagraph(i, x) { const p = x instanceof Par ? x : new Par(String(x), this); p.pai = this; this.filhos.splice(i, 0, p); return p; }
  insertTable(i, linhas) { const t = new Tab(linhas, this); this.filhos.splice(i, 0, t); return t; }
  findText(a) { return this.filhos.some(f => new RegExp(a).test(f instanceof Par ? f.t : f.texto())) ? {} : null; }
  replaceText(a, b) { this.filhos.forEach(f => f.replaceText(a, b)); return this; }
  removeChild(e) { this.filhos.splice(this.filhos.indexOf(e), 1); return this; }
  editAsText() { return texto(() => this.filhos.map(f => f instanceof Par ? f.t : f.texto()).join('\n')); }
  setMarginTop() { return this; } setMarginBottom() { return this; } setMarginLeft() { return this; } setMarginRight() { return this; }
  tudo() { return this.filhos.map(f => f instanceof Par ? f.t : f.texto()).join('\n'); }
}
const docs = new Map();
let nid = 0;
function novoDoc(nome, linhas) { const id = 'doc' + (++nid); docs.set(id, { id, nome, corpo: new Corpo(linhas), lixo: false }); return id; }
function arquivo(id) {
  const d = docs.get(id);
  return { getId: () => id, getName: () => d.nome, isTrashed: () => d.lixo, getUrl: () => 'https://docs.test/' + id,
    getParents: () => { let v = false; return { hasNext: () => !v, next: () => { v = true; return pasta; } }; },
    makeCopy: (nome) => { const c = novoDoc(nome, []); docs.get(c).corpo = new Corpo([]); docs.get(c).corpo.filhos = d.corpo.filhos.map(f => { if (f instanceof Par) { const p = f.copy(); p.pai = docs.get(c).corpo; return p; } const t = new Tab(f.cel.map(l => l.map(x => x.t)), docs.get(c).corpo); return t; }); return arquivo(c); },
    getAs: () => ({}) };
}
const pasta = { createFile: () => ({ setName: () => ({ getUrl: () => 'https://docs.test/pdf' }) }), getUrl: () => 'https://drive.test/pasta' };
C.DocumentApp = { ElementType: ET, HorizontalAlignment: HA, ParagraphHeading: { NORMAL: 'NORMAL' },
  openById: id => ({ getBody: () => docs.get(id).corpo, saveAndClose() {} }) };
C.DriveApp = { getFileById: id => arquivo(id), getFolderById: () => pasta,
  searchFiles: q => { const m = /title = '(.+)' and/.exec(q); const ach = [...docs.values()].filter(d => d.nome === m[1] && !d.lixo); let i = 0; return { hasNext: () => i < ach.length, next: () => arquivo(ach[i++].id) }; } };

// ---------- modelos inventados (mesma estrutura e as mesmas frases-chave dos do Drive) ----------
const contrato = [
  'QUADRO-RESUMO DO CONTRATO DE LOCAÇÃO', 'LOCADORA: LOCADORA TESTE, CPF nº 000.000.000-00.', '{{LOCATARIO}}: {{LOC_NOME}}, CPF nº {{LOC_CPF}}.',
  'IMÓVEL: apartamento {{APTO}} — Rua Inventada, nº 888, Tubarão/SC.', 'PRAZO: {{PRAZO}}. {{GARANTIA_ROTULO}}: {{GARANTIA_TEXTO}}.',
  '7. A locação destina-se exclusivamente ao uso residencial, com prazo determinado de {{PRAZO}}.',
  'CONTRATO DE LOCAÇÃO RESIDENCIAL {{TITULO_GARANTIA}}',
  'têm, entre si, justo e acordado o presente INSTRUMENTO PARTICULAR DE LOCAÇÃO RESIDENCIAL{{TITULO_GARANTIA_TEXTO}}, regido pelas cláusulas abaixo.',
  'CLÁUSULA 1ª – OBJETO DO CONTRATO', 'O presente contrato tem por objeto o imóvel situado na Rua Inventada, nº 888, apartamento {{APTO}}, quadro de medição kit {{KIT}}.',
  'RESPONSABILIDADE PELO QUE FOI ENTREGUE. {{O_LOCATARIO}} repõe o que faltar, podendo o valor ser descontado da caução.',
  'Após a imissão na posse, {{O_LOCATARIO}} ficará responsável pelo pagamento do aluguel mensal de {{ALUGUEL}} e das despesas de consumo de energia elétrica do imóvel, que deverão ser quitados mensalmente até o dia {{DIA_VENC}}.',
  'PARÁGRAFO SEGUNDO – ENCARGOS. As despesas de energia elétrica serão apuradas conforme o consumo mensal do imóvel e repassadas {{AO_LOCATARIO}}, que se obriga ao pagamento integral, não recaindo sobre a LOCADORA qualquer responsabilidade.',
  'A locação destina-se exclusivamente ao uso residencial, sendo vedado {{AO_LOCATARIO}} sublocar o imóvel.',
  'PARÁGRAFO SEGUNDO. Caso o imóvel seja utilizado para finalidade diversa da residencial, a LOCADORA poderá rescindir.',
  '[[SO_CAUCAO]]CLÁUSULA 9ª – DA CAUÇÃO', '[[SO_CAUCAO]]{{O_LOCATARIO}} paga, neste ato, caução no valor de {{CAUCAO}}.',
  '[[SO_CAUCAO]]PARÁGRAFO TERCEIRO. A caução é garantia da LOCADORA.',
  'CLÁUSULA {{N_FINAL}} – DAS DISPOSIÇÕES FINAIS', 'A locação destina-se exclusivamente a fins residenciais e será regida pela Lei nº 8.245/1991 e suas alterações.',
  'Tubarão/SC, {{DATA_ASSINATURA}}.', '', '_______________________________________', 'LOCADORA TESTE', 'LOCADORA', '',
  '_______________________________________', '{{LOC_NOME}}', '{{LOCATARIO}}', '', 'TESTEMUNHAS', '_______________________________________', 'Nome:'];
const laudo = [
  'LAUDO DE VISTORIA DE IMÓVEL PARA LOCAÇÃO', '{{LOCATARIO_TIT}}: {{LOC_NOME}}, {{INSCRITO}} no CPF nº {{LOC_CPF}}.',
  'Imóvel: Rua Inventada, nº 888, apartamento {{APTO}}, quadro de medição kit {{KIT}}.', 'Características: Kitnet residencial composta por sala/cozinha integrada, quarto e banheiro.',
  'Condição geral: Imóvel novo, mobiliado e em ótimo estado de conservação.', 'O imóvel, seus móveis, eletrodomésticos, utensílios e instalações foram vistoriados e estão em ordem.',
  '3. VISTORIA POR AMBIENTE', '3.1 SALA E COZINHA INTEGRADA', [['Sala', '01 sofá-cama']], '3.2 QUARTO', [['Mobiliário', '01 cama box']],
  '4. INSTALAÇÕES GERAIS', [['Elétrica', 'ok']], '4.1 ITENS CONFERIDOS NA ENTREGA',
  [['Iluminação', 'Todos os pontos de luz, lâmpadas, luminárias e luminárias de leitura da sala/cozinha, do quarto e do banheiro acesos e funcionando.'],
    ['Chuveiro e água quente', 'Chuveiro elétrico, registros e torneiras funcionando, sem vazamentos.'], ['Ar-condicionado', 'Ar-condicionado split ligando, resfriando e com controle remoto entregue.']],
  '6. DECLARAÇÃO FINAL', '{{O_LOCATARIO}}, {{LOC_NOME}}, {{INSCRITO}} no CPF sob nº {{LOC_CPF}}, recebeu o imóvel localizado na Rua Inventada, nº 888, apartamento {{APTO}}, Bairro Teste.', '_______________________________________', '{{LOC_NOME}}', '{{LOCATARIO}} · CPF nº {{LOC_CPF}}'];
const idC = novoDoc('MODELO — CONTRATO DE LOCAÇÃO (painel)', contrato), idL = novoDoc('MODELO — LAUDO DE VISTORIA (painel)', laudo);
C.setConfig_('FUTURE_MODELO_CONTRATO', idC, 't'); C.setConfig_('FUTURE_MODELO_LAUDO', idL, 't');

C.futAtualizarModelos863_();
const res = docs.get(idC).corpo.tudo();
assert(/\[\[SO_FIADOR\]\]CLÁUSULA 9ª – DA FIANÇA/.test(res) && res.indexOf('DA FIANÇA') > res.indexOf('A caução é garantia') && res.indexOf('DA FIANÇA') < res.indexOf('DAS DISPOSIÇÕES FINAIS'), 'a fiança entra depois da caução e antes das disposições finais');
assert(/renuncia aos benefícios de ordem/.test(res) && /art\. 39 da Lei nº 8\.245/.test(res) && /art\. 40, X/.test(res) && /\[\[SO_CONJUGE\]\]PARÁGRAFO QUINTO/.test(res), 'cláusulas da fiança: solidária, até a devolução das chaves, exoneração em 120 dias, cônjuge');
const iTest = res.indexOf('TESTEMUNHAS'), iFia = res.indexOf('[[SO_FIADOR]]{{FIA_NOME}}');
assert(iFia > res.indexOf('{{LOCATARIO}}\n') && iFia < iTest && res.indexOf('[[SO_CONJUGE]]{{FIA_CONJ_NOME}}') < iTest, 'assinaturas do fiador e do cônjuge depois da do locatário, antes das testemunhas');
assert(/\{\{DESCONTO_CAUCAO\}\}\./.test(res) && !/descontado da caução/.test(res), '"descontado da caução" só aparece quando há caução');
const idCom = C.config_('FUTURE_MODELO_COMERCIAL'), idLc = C.config_('FUTURE_MODELO_LAUDO_COMERCIAL');
const com = docs.get(idCom).corpo.tudo(), lc = docs.get(idLc).corpo.tudo();
assert(docs.get(idCom).nome === 'MODELO — CONTRATO DE LOCAÇÃO COMERCIAL (painel)' && /NÃO RESIDENCIAL \(SALA COMERCIAL\)/.test(com) && !/uso residencial|fins residenciais|diversa da residencial|apartamento \{\{APTO\}\}/.test(com), 'contrato comercial sem nenhum "residencial" nem "apartamento"');
assert(/para \{\{ATIVIDADE\}\}/.test(com) && /alvará de funcionamento/.test(com) && /\{\{TAXAS_TXT\}\}/.test(com) && /diretamente à concessionária/.test(com) && /DA FIANÇA/.test(com) && /LOCADORA TESTE/.test(com), 'comercial: atividade, alvará, taxas, energia própria, fiança e os dados da locadora do modelo');
assert(!/Kitnet|sofá|cama box|3\.1 SALA/.test(lc) && /3\. VISTORIA DA SALA/.test(lc) && /\{\{ITENS_SALA\}\}/.test(lc) && /\{\{SALA\}\}/.test(lc) && /\{\{LOC_DOC_INSCRITO\}\}/.test(lc) && /· \{\{LOC_DOC\}\}/.test(lc) && /Água \| Registros/.test(lc), 'laudo comercial: sem os cômodos da kitnet, com o quadro da sala e CPF ou CNPJ');
assert(!C.config_('FUTURE_MODELOS_863_AVISO'), 'nenhum trecho esperado faltou nos modelos');
const nAntes = docs.get(idC).corpo.filhos.length; C.futAtualizarModelos863_();
assert(docs.get(idC).corpo.filhos.length === nAntes && [...docs.values()].length === 4, 'roda uma vez só (não duplica nem cria outro modelo)');

// ---------- preencher: com caução os textos saem como antes; com fiador, a cláusula da fiança vem numerada certo ----------
const preencher = (id, campos, manter) => { const c = arquivo(id).makeCopy('x'); const d = C.DocumentApp.openById(c.getId()); C.futPreencherDoc_(d, campos, manter); return docs.get(c.getId()).corpo.tudo(); };
const fia = { nome: 'FIADOR INVENTADO', cpf: '111.222.333-44', g: 'M', conj: { nome: 'CONJUGE INVENTADA', cpf: '555.666.777-88' }, qual: 'brasileiro, casado' };
const base = Object.assign(C.futPapel_('M'), C.futCamposFiador_(null), C.futCamposSala_({ id: 'AP 101' }, false, false, '000.111.222-33', '', {}, 'M'), { LOC_NOME: 'LOCATARIO TESTE', N_FINAL: '10ª', DESCONTO_CAUCAO: ', podendo o valor ser descontado da caução' });
let t = preencher(idC, base, { SO_CAUCAO: true, SO_FIADOR: false, SO_CONJUGE: false });
assert(/DA CAUÇÃO/.test(t) && !/FIANÇA|FIA_|\[\[/.test(t) && /podendo o valor ser descontado da caução\./.test(t), 'com caução: sai como antes (sem fiança, sem marcas)');
t = preencher(idC, Object.assign({}, base, C.futCamposFiador_(fia), { DESCONTO_CAUCAO: '' }), { SO_CAUCAO: false, SO_FIADOR: true, SO_CONJUGE: true });
assert(!/DA CAUÇÃO/.test(t) && /CLÁUSULA 9ª – DA FIANÇA/.test(t) && /CLÁUSULA 10ª – DAS DISPOSIÇÕES FINAIS/.test(t) && /FIADOR INVENTADO, brasileiro, casado, que se obriga solidariamente/.test(t), 'com fiador: cláusula 9ª da fiança, disposições finais na 10ª');
assert(/\nFIADOR INVENTADO\nFIADOR\n/.test(t) && /CONJUGE INVENTADA\nCÔNJUGE do FIADOR/.test(t) && !/\[\[|FIA_|CONJ_/.test(t) && /repõe o que faltar\./.test(t) && /como FIADOR e principal pagador, FIADOR INVENTADO/.test(t), 'assinaturas do fiador e do cônjuge; nenhuma marca sobrando; sem "descontado da caução"');
t = preencher(idC, Object.assign({}, base, C.futCamposFiador_(Object.assign({}, fia, { conj: null }))), { SO_CAUCAO: false, SO_FIADOR: true, SO_CONJUGE: false });
assert(/DA FIANÇA/.test(t) && !/CÔNJUGE|PARÁGRAFO QUINTO/.test(t), 'fiador solteiro: sem o cônjuge');
const sala = Object.assign(C.futPapel_('F'), C.futCamposFiador_(null), C.futCamposSala_({ id: 'SALA 2', taxas: '107.00' }, true, true, '12.345.678/0001-90', 'escritório de contabilidade', {}, 'F'), { LOC_NOME: 'EMPRESA TESTE LTDA', N_FINAL: '9ª' });
t = preencher(idCom, sala, { SO_CAUCAO: false, SO_FIADOR: false, SO_CONJUGE: false });
assert(/sala comercial nº 2/.test(t) && /EMPRESA TESTE LTDA, CNPJ nº 12\.345\.678\/0001-90\./.test(t) && /uso não residencial, para escritório de contabilidade/.test(t) && /taxas do condomínio de R\$ 107,00 \(/.test(t) && /por conta da LOCATÁRIA, na unidade/.test(t) && !/\[\[|\{\{(SALA|ATIVIDADE|TAXAS_TXT|LOC_DOC)/.test(t), 'sala: número, CNPJ, atividade e taxas no contrato');
t = preencher(idLc, sala, {});
assert(/inscrita no CNPJ nº 12\.345\.678\/0001-90/.test(t) && /Sala comercial com banheiro, entregue sem mobília/.test(t) && /recebeu o imóvel localizado na Rua Inventada, nº 888, sala comercial nº 2, Bairro/.test(t) && !/\{\{(SALA|ITENS_SALA|CARACTERISTICAS|LOC_DOC)/.test(t), 'laudo da sala preenchido (CNPJ, características, sala)');
// ---------- validações do gerador (antes de mexer no Drive) ----------
T.add('FutUnidades', [{ id: 'AP 909', tipo: 'apartamento', aluguel: '1750.00', situacao: 'vago' }, { id: 'SALA 9', tipo: 'sala', aluguel: '2000.00', taxas: '107.00', situacao: 'vago' }]);
const adm = { usuario: 'admin', nome: 'Admin Teste', perfil: 'administrador' };
const erro = d => { try { C.futureGerarContrato_(Object.assign({ prazo_meses: '12', inicio: '2099-01-10', nome: 'PESSOA INVENTADA TESTE', cpf: '123.456.789-09' }, d), adm); return ''; } catch (e) { return e.message; } };
assert(/fiador\(a\) casado\(a\): informe o nome e o CPF do cônjuge/i.test(erro({ unidade: 'AP 909', garantia: 'fiador', fia_nome: 'FIADOR INVENTADO', fia_cpf: '987.654.321-00', fia_estado_civil: 'casado(a)' })), 'fiador casado sem o cônjuge: o painel pede o cônjuge (art. 1.647, III, CC)');
assert(/próprio\(a\) locatário/.test(erro({ unidade: 'AP 909', garantia: 'fiador', fia_nome: 'FIADOR INVENTADO', fia_cpf: '123.456.789-09' })), 'o fiador não pode ser o próprio locatário');
assert(/CPF \(11 números\)\.$/.test(erro({ unidade: 'AP 909', cpf: '12.345.678/0001-90' })), 'apartamento: só CPF');
assert(/atividade/.test(erro({ unidade: 'SALA 9' })), 'sala sem a atividade: o painel pede');
assert(/qualificação inteira/.test(erro({ unidade: 'SALA 9', cpf: '12.345.678/0001-90', atividade: 'escritório' })), 'sala com CNPJ sem a qualificação da empresa: o painel pede');
console.log('fim futureModelos');
