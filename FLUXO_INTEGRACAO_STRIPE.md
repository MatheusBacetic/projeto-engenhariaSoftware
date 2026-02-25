# Diagrama de Sequência UML

Este documento detalha o fluxo arquitetural de comunicação entre as camadas do sistema (Frontend, Backend, Banco de Dados) e o provedor de pagamentos externo durante o processo de assinatura de um novo cliente.

## 1. Diagrama de Sequência: Contratação de Plano e Webhook

O diagrama abaixo ilustra a troca de mensagens no tempo, demonstrando o padrão de segurança adotado ao separar a experiência do usuário (fluxo síncrono) da validação financeira (processamento assíncrono).

```mermaid
sequenceDiagram
    autonumber
    
    %% Atores e Sistemas Participantes
    actor U as Visitante (Usuário)
    participant F as Aplicação Web<br/>(Frontend)
    box rgba(63, 208, 191, 0.1) Infraestrutura de Backend
        participant C as Serviço de Checkout<br/>(API)
        participant W as Serviço de Webhook<br/>(Background)
        participant DB as Banco de Dados
    end
    participant S as Gateway de Pagamento<br/>(Sistema Externo)

    %% Fluxo de Criação da Sessão (Síncrono)
    rect rgba(200, 200, 200, 0.1)
        Note over U, S: Fase 1: Criação da Sessão e Pagamento
        U->>F: Seleciona o plano e clica em assinar
        F->>C: Solicita geração de link de pagamento
        C->>S: Requisita criação de sessão segura
        S-->>C: Retorna URL de checkout gerada
        C-->>F: Repassa a URL segura para a interface
        F->>U: Redireciona o navegador para o ambiente do Gateway
        U->>S: Insere dados financeiros e confirma
    end

    %% Fluxo de Retorno ao Site
    rect rgba(0, 150, 255, 0.1)
        Note over U, F: Fase 2: Retorno para a Plataforma
        S-->>U: Confirma pagamento aprovado
        S->>F: Redireciona de volta para o sistema (URL de Sucesso)
        F-->>U: Exibe mensagem de boas-vindas / orientações
    end

    %% Fluxo do Webhook (Assíncrono)
    rect rgba(100, 255, 100, 0.1)
        Note over S, DB: Fase 3: Processamento Assíncrono (Garantia de Segurança)
        S->>W: Envia evento de pagamento concluído (Webhook POST)
        W->>W: Valida autenticidade e criptografia da notificação
        W->>DB: Registra o pagamento e ativa a conta do cliente
        DB-->>W: Confirma atualização do status da assinatura
        W-->>S: Retorna status 200 OK (Confirma recebimento)
    end
