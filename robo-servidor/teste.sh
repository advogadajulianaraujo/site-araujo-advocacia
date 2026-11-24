#!/bin/bash
# Teste do servidor do robô (Araújo Advocacia): os tribunais aceitam este endereço?
# Não usa senha nem dado de cliente: só pergunta a cada portal se responde a este servidor.
echo ""; echo "=== Teste do servidor do robô ==="; echo "Endereço deste servidor: $(curl -s --max-time 10 https://api.ipify.org)"; echo ""
t() { # nome, url, o que significa "bloqueado"
  local corpo cod; corpo=$(curl -s -L --max-time 25 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36" -w "\n%{http_code}" "$2"); cod=$(echo "$corpo" | tail -1)
  if echo "$corpo" | grep -qi "Request blocked\|could not be satisfied\|Access Denied"; then echo "❌ $1: BLOQUEADO (código $cod)";
  elif [ "$cod" = "000" ]; then echo "❌ $1: sem resposta";
  elif [ "$cod" = "403" ]; then echo "❌ $1: RECUSADO (403)";
  else echo "✅ $1: respondeu (código $cod)"; fi
}
t "PJe TRT12 - tela de login" "https://pje.trt12.jus.br/primeirograu/login.seam"
t "PJe TRT12 - LISTA DE EXPEDIENTES (a parte importante)" "https://pje.trt12.jus.br/pje-comum-api/api/dominio/tiposexpediente"
t "PJe TRT6 - lista" "https://pje.trt6.jus.br/pje-comum-api/api/dominio/tiposexpediente"
t "PJe TST - lista" "https://pje.tst.jus.br/pje-comum-api/api/dominio/tiposexpediente"
t "DJEN (Diário do CNJ)" "https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=1&ufOab=SC&dataDisponibilizacaoInicio=2026-11-20&dataDisponibilizacaoFim=2026-11-20"
t "eproc TJRS" "https://eproc1g.tjrs.jus.br/eproc/"
t "eproc TJSC" "https://eproc1g.tjsc.jus.br/eproc/"
echo ""; echo "Tire um print desta tela e mande no chat. (Não aparece senha nem dado de cliente.)"; echo ""
