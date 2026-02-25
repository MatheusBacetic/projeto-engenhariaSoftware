# EvoPG - Plataforma de Gestão SaaS

## 1. Visão Geral
O **EvoPG** é uma plataforma SaaS (Software as a Service) desenvolvida para democratizar o acesso a ferramentas profissionais de gestão financeira e empresarial. Focado em Microempreendedores Individuais (MEIs), autônomos e pessoas físicas, entrega visão clara do financeiro, comercial e operação. 

## 2. Arquitetura do Sistema
Abaixo está a representação visual da arquitetura técnica da plataforma, demonstrando a comunicação entre o Frontend, Backend e integrações externas.

```mermaid
graph TD
    subgraph Frontend [Frontend Hospedado Vercel]
        A[index.html - Landing Page]
        B[perfil.html - Portal do Cliente]
    end

    subgraph Backend [ Supabase]
        C[(PostgreSQL - Regras e Dados)]
        D[Edge Functions / TypeScript]
    end

    subgraph Externo [Serviços Externos]
        E[API Stripe - Pagamentos]
    end

    %% Conexões
    A -->|Inicia Checkout| D
    A -->|Formulário de Suporte| D
    B -->|Autenticação / Leitura de Dados| C
    D <-->|Criação de Sessão / Webhooks| E
    D -->|Atualiza Banco via Webhook| C
