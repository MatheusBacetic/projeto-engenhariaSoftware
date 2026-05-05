# EvoPG Load Testing Suite

Este diretório contém scripts para realizar testes de carga no site EvoPG. Foram disponibilizadas três ferramentas para atender diferentes necessidades.

## 🚀 Ferramentas Disponíveis

### 1. k6 (Recomendado)
O **k6** é uma ferramenta moderna escrita em Go que utiliza JavaScript para definir os testes. É a melhor opção para testar fluxos de usuários.

*   **Instalação:** `brew install k6`
*   **Como rodar:**
    ```bash
    k6 run k6-script.js
    ```
*   **Vantagem:** Alta performance, scripts em JS, relatórios detalhados no terminal.

### 2. Locust (Python)
O **Locust** é uma ferramenta baseada em Python com uma interface web amigável.

*   **Instalação:** `pip install locust`
*   **Como rodar:**
    ```bash
    locust -f locustfile.py
    ```
*   **Vantagem:** Interface gráfica no navegador (`http://localhost:8089`), fácil de escalar.

### 3. Apache Benchmark (ab)
Uma ferramenta simples de linha de comando para testar uma única URL. Já vem pré-instalada no macOS.

*   **Como rodar:**
    ```bash
    ./simple-test.sh
    ```
*   **Vantagem:** Instantâneo, não requer instalação adicional.

---

## ⚠️ Observações Importantes

1.  **URL do Site:** Os scripts estão configurados por padrão para `http://localhost:5500`. Se o seu servidor local estiver em outra porta, altere a variável `BASE_URL` nos arquivos.
2.  **Ambiente:** Não execute testes de carga pesados contra o Supabase ou Stripe em produção sem autorização, para evitar bloqueios por taxa de limite (rate limiting).
