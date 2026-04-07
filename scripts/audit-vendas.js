const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'evopg', 'faculdade', 'index.html');

console.log('--- Iniciando Auditoria de Vendas (EvoPG) ---');

try {
  const content = fs.readFileSync(targetPath, 'utf8');

  // 1. Verificar SDK do Stripe
  if (!content.includes('js.stripe.com/v3/')) {
    console.error('❌ ERRO: SDK do Stripe não encontrado no index.html');
    process.exit(1);
  } else {
    console.log('✅ SDK do Stripe presente.');
  }

  // 2. Verificar Configuração de Checkout
  if (!content.includes('EVOPG_CHECKOUT_CONFIG')) {
    console.error('❌ ERRO: Objeto de configuração EVOPG_CHECKOUT_CONFIG não encontrado.');
    process.exit(1);
  } else {
    console.log('✅ Configuração de checkout encontrada.');
  }

  // 3. Verificar CTAs (Botões de Venda)
  if (!content.includes('js-start-checkout')) {
    console.error('❌ ERRO: Classe js-start-checkout (gatilho de venda) não encontrada.');
    process.exit(1);
  } else {
    console.log('✅ Gatilhos de compra encontrados.');
  }

  console.log('--- Auditoria Concluída com Sucesso! Fluxo aprovado para deploy. ---');
} catch (err) {
  console.error('❌ ERRO CRÍTICO ao ler o arquivo index.html:', err.message);
  process.exit(1);
}
