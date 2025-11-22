#!/bin/bash
# Script para carregar variáveis de ambiente do Firebase
export FIREBASE_SERVICE_ACCOUNT_POC1="$(cat ./service-account-poc1.json)"
export FIREBASE_SERVICE_ACCOUNT_POC2="$(cat ./service-account-poc2.json)"

echo "Variáveis de ambiente carregadas com sucesso!"
