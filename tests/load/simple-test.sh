#!/bin/bash

# Configurações
URL="http://localhost:5500/index.html"
CONCURRENT_USERS=10
TOTAL_REQUESTS=100

echo "----------------------------------------------------"
echo "Iniciando Teste de Carga Rápido (Apache Benchmark)"
echo "Alvo: $URL"
echo "Usuários Simultâneos: $CONCURRENT_USERS"
echo "Total de Requisições: $TOTAL_REQUESTS"
echo "----------------------------------------------------"

# Verifica se o ab está instalado
if ! command -v ab &> /dev/null
then
    echo "Erro: 'ab' não encontrado. Este script requer Apache Benchmark."
    exit 1
fi

# Executa o teste
ab -n $TOTAL_REQUESTS -c $CONCURRENT_USERS $URL

echo "----------------------------------------------------"
echo "Teste Concluído!"
