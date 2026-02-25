# Engenharia de Software: Casos de Uso e Requisitos

## 1. Diagrama de Casos de Uso
O diagrama abaixo ilustra os principais atores interagindo com o sistema EvoPG.

```mermaid
flowchart LR
    %% Definição de Atores (Estilo de nós circulares)
    Visitante((🧑‍💻 Visitante))
    Assinante((👤 Assinante))
    Sistema((⚙️ Sistema EvoPG))
    Stripe((💳 API Stripe))

    %% Casos de Uso (Estilo de nós arredondados)
    UC01([UC01: Contratar Assinatura])
    UC02([UC02: Realizar Login])
    UC03([UC03: Preencher Ficha Fiscal])
    UC04([UC04: Gerenciar Assinatura])
    UC05([UC05: Enviar Suporte])
    UC06([UC06: Processar Inadimplência])

    %% Relacionamentos
    Visitante --> UC01
    Visitante --> UC05
    Assinante --> UC02
    Assinante --> UC03
    Assinante --> UC04
    
    UC01 <--> Stripe
    UC04 <--> Stripe
    Stripe --> UC06
    Sistema --> UC06
