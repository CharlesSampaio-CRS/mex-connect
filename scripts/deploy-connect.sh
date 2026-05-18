#!/bin/bash
# deploy-connect.sh — Envia os arquivos estáticos do mex-connect para o EC2
# Uso: ./deploy-connect.sh
# Não recompila o Rust — só atualiza static/ e reinicia o serviço

set -e

SERVER_IP=$(grep "Public IP:" ../mex-trading/scripts/ec2-info.txt | awk '{print $3}')
KEY_FILE="mex-trading-key.pem"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
SSH="ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o ServerAliveInterval=15"
SCP="scp -i $KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=30"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Deploy Connect Portal → EC2 ⚡           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo "  🌐 Servidor: $SERVER_IP"

# Verifica conectividade
echo -n "  🔌 Verificando conectividade... "
if ! nc -z -w 5 "$SERVER_IP" 22 2>/dev/null; then
	echo -e "${RED}❌ Servidor inacessível ($SERVER_IP:22)${NC}"
	exit 1
fi
echo -e "${GREEN}OK${NC}"

# Build do mex-connect automaticamente
echo ""
echo -e "${YELLOW}▶ [0/2] Buildando mex-connect...${NC}"
if [ ! -d "../mex-connect" ]; then
	echo -e "${RED}❌ Pasta ../mex-connect não encontrada.${NC}"
	exit 1
fi
(cd ../mex-connect && npm run build)
echo -e "${GREEN}  ✅ Build concluído${NC}"

echo ""
echo -e "${YELLOW}▶ [1/2] Enviando dist/ para o servidor...${NC}"
$SCP -r ../mex-connect/dist/* ubuntu@"$SERVER_IP":/home/ubuntu/mex-connect/
if [ $? -ne 0 ]; then
	echo -e "${RED}❌ Falha ao enviar arquivos para o servidor.${NC}"
	exit 1
fi
echo -e "${GREEN}  ✅ Arquivos enviados com sucesso${NC}"

# Reinicia serviço (ajuste conforme necessário)
echo ""
echo -e "${YELLOW}▶ [2/2] Reiniciando serviço mex-connect...${NC}"
$SSH ubuntu@"$SERVER_IP" "sudo systemctl restart mex-connect || true"
echo -e "${GREEN}  ✅ Serviço reiniciado (se existir)${NC}"

echo ""
echo -e "${BLUE}Deploy do mex-connect finalizado!${NC}"

