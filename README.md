# EvoPG

Projeto de um site de assinatura para o EvoPG, desenvolvido na disciplina de Laboratório de Engenharia de Software.

![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)
![Status](https://img.shields.io/badge/status-em%20planejamento-2563eb)
![Disciplina](https://img.shields.io/badge/disciplina-Engenharia%20de%20Software-0f172a)

## Sobre o projeto

Este repositório reúne os artefatos de concepção do **site de assinatura do EvoPG**. A proposta do sistema é criar uma camada de entrada para o produto, permitindo que um visitante:

- conheça a solução;
- entenda a proposta comercial;
- inicie a contratação de um plano;
- conclua o primeiro acesso à conta;
- gerencie dados básicos da empresa e integrações.

O foco atual do trabalho está em **planejamento, modelagem, prototipação e estruturação arquitetural**.

## Escopo previsto

O sistema foi pensado para contemplar, futuramente:

- landing page institucional do EvoPG;
- fluxo de assinatura com aceite de termos;
- checkout com Stripe;
- criação inicial de conta após confirmação de pagamento;
- autenticação com Supabase;
- primeiro acesso e definição de senha;
- área de perfil do cliente;
- preenchimento de ficha fiscal;
- integração com Mercado Pago;
- envio de mensagens para suporte.

## Tecnologias previstas

- **Front-end:** HTML, CSS e JavaScript
- **Autenticação e dados:** Supabase
- **Pagamentos:** Stripe
- **Integrações externas:** Mercado Pago
- **E-mail:** Resend
- **Documentação:** LaTeX, ABNTeX2 e PlantUML



## Documentação

O documento principal da disciplina está em:

- `docs/evopg_documentacao.tex`

Os diagramas UML foram separados em PlantUML para facilitar manutenção e exportação:

- fontes em `docs/plantuml/`;
- arquivos exportados em `docs/plantuml/exportados/`.

Ao compilar a documentação no Overleaf, é necessário enviar também os arquivos de imagem ou PDF dos diagramas exportados.



