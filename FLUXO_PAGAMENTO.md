# Regra de Negócio: Fluxo de Assinaturas e Carência

O EvoPG possui um sistema inteligente de gestão de inadimplência diretamente no banco de dados (PostgreSQL), garantindo que o cliente não seja bloqueado injustamente no primeiro dia de atraso.

## Fluxograma de Status de Pagamento (Billing Status)

O diagrama abaixo explica o ciclo de vida da fatura de um assinante no EvoPG, ilustrando a regra de 15 dias de carência.

```mermaid
stateDiagram-v2
    [*] --> Em_Dia: Checkout Aprovado
    
    Em_Dia --> Atrasado: Webhook Stripe falha no pagamento
    
    state Atrasado {
        [*] --> Carencia_Iniciada: +15 dias adicionados à carência
        Carencia_Iniciada --> Acesso_Permitido: Assinante continua usando
    }
    
    Atrasado --> Em_Dia: Cliente paga dentro dos 15 dias
    
    Atrasado --> Bloqueado: Prazo de 15 dias expira
    
    state Bloqueado {
        [*] --> Acesso_Revogado: Sistema impede acesso à plataforma
    }
    
    Bloqueado --> Em_Dia: Cliente quita a dívida pendente
