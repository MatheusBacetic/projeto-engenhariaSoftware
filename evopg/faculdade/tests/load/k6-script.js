import http from 'k6/http';
import { check, sleep } from 'k6';

// Configuração do teste
export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Sobe para 20 usuários em 30s
    { duration: '1m', target: 20 },  // Mantém 20 usuários por 1 minuto
    { duration: '30s', target: 0 },  // Desce para 0 usuários
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% das requisições devem ser menores que 500ms
    http_req_failed: ['rate<0.01'],   // Menos de 1% de erro
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5500';

export default function () {
  // 1. Acessa a Home
  const homeRes = http.get(`${BASE_URL}/index.html`);
  check(homeRes, {
    'status is 200': (r) => r.status === 200,
    'contains EvoPG': (r) => r.body.includes('EvoPG'),
  });

  sleep(1);

  // 2. Acessa a página de Perfil (se existir)
  const profileRes = http.get(`${BASE_URL}/perfil.html`);
  check(profileRes, {
    'profile status is 200': (r) => r.status === 200,
  });

  sleep(2);
}
