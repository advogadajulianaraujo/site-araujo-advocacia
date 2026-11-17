// 8.37.5: gera supabase/functions/painel/motor-anterior.js = o motor da função do Supabase na versão que o GOOGLE está rodando.
// Por quê: a atualização do Google pode atrasar ou falhar (16/11: ficou na 8.36.7 enquanto o painel ia para a 8.37.4). Com versões
// diferentes a função recusava tudo e a entrada e cada gravação iam ao Google (lento = "painel travando"). Com o motor anterior junto,
// a função atende as duas versões. Uso: node .github/motor/motor-anterior.mjs <versão do Code.gs que o Google está rodando>
// Usa o Code.gs E o gerar-edge.mjs da época daquela versão (tirados do git), para o motor sair igual ao que foi testado.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sh = c => execSync(c, { cwd: raiz, encoding: 'utf8', maxBuffer: 64 << 20 });
const ver = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(ver || '')) { console.error('uso: node .github/motor/motor-anterior.mjs <versão>'); process.exit(1); }
const saida = path.join(raiz, 'supabase/functions/painel/motor-anterior.js');
// o commit mais novo em que o Code.gs tinha essa VERSAO
let commit = '';
for (const c of sh('git log --format=%H -- painel-backend/Code.gs').trim().split('\n')) {
  const v = (/^var VERSAO = '([^']+)'/m.exec(sh('git show ' + c + ':painel-backend/Code.gs')) || [])[1];
  if (v === ver) { commit = c; break; }
}
if (!commit) { console.log('não achei a versão', ver, 'no git: motor-anterior.js fica como está'); process.exit(0); }
const tmp = path.join(os.tmpdir(), 'motor-ant-' + process.pid);
mkdirSync(path.join(tmp, '.github/motor'), { recursive: true }); mkdirSync(path.join(tmp, 'painel-backend'), { recursive: true });
mkdirSync(path.join(tmp, 'supabase/functions/painel'), { recursive: true });
writeFileSync(path.join(tmp, '.github/motor/gerar-edge.mjs'), sh('git show ' + commit + ':.github/motor/gerar-edge.mjs'));
writeFileSync(path.join(tmp, 'painel-backend/Code.gs'), sh('git show ' + commit + ':painel-backend/Code.gs'));
execSync('node .github/motor/gerar-edge.mjs', { cwd: tmp, stdio: 'ignore' });
const gerado = path.join(tmp, 'supabase/functions/painel/motor.js');
if (!existsSync(gerado) || !readFileSync(gerado, 'utf8').includes("VERSAO_MOTOR = '" + ver + "'")) { console.error('não gerou o motor', ver); process.exit(1); }
copyFileSync(gerado, saida); rmSync(tmp, { recursive: true, force: true });
console.log('supabase/functions/painel/motor-anterior.js =', ver, '(' + commit.slice(0, 7) + ')');
