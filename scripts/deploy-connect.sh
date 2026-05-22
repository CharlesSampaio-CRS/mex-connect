#!/bin/bash
set -e

# =========================================================
# MEX CONNECT DEPLOY
# =========================================================

# ── Colors ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Paths ─────────────────────────────────────────────────
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="$PROJECT_ROOT/.."

NGINX_CONF_LOCAL="$PROJECT_ROOT/mex-connect.conf"
NGINX_CONF_REMOTE="/etc/nginx/sites-available/mex-connect.conf"

EC2_INFO_FILE="$PROJECT_ROOT/../../deploy/ec2-info.txt"
KEY_FILE="$(cd -- "$PROJECT_ROOT/../../secrets" && pwd)/mex-admin-service-key.pem"

REMOTE_DIR="/home/ubuntu/mex-connect"

# ── Validations ───────────────────────────────────────────
echo ""
echo -e "${BLUE}=========================================================${NC}"
echo -e "${BLUE}               MEX CONNECT DEPLOY                        ${NC}"
echo -e "${BLUE}=========================================================${NC}"

if [ ! -f "$NGINX_CONF_LOCAL" ]; then
  echo -e "${RED}❌ Arquivo do nginx não encontrado:${NC}"
  echo "$NGINX_CONF_LOCAL"
  exit 1
fi

if [ ! -f "$EC2_INFO_FILE" ]; then
  echo -e "${RED}❌ ec2-info.txt não encontrado:${NC}"
  echo "$EC2_INFO_FILE"
  exit 1
fi

if [ ! -f "$KEY_FILE" ]; then
  echo -e "${RED}❌ Chave PEM não encontrada:${NC}"
  echo "$KEY_FILE"
  exit 1
fi

if [ ! -f "$PROJ_DIR/package.json" ]; then
  echo -e "${RED}❌ package.json não encontrado:${NC}"
  echo "$PROJ_DIR/package.json"
  exit 1
fi

SERVER_IP=$(grep "^Public IP:" "$EC2_INFO_FILE" | awk '{print $3}')

if [ -z "$SERVER_IP" ]; then
  echo -e "${RED}❌ IP do servidor não encontrado no ec2-info.txt${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}Servidor:${NC} $SERVER_IP"
echo -e "${GREEN}Projeto:${NC}  $PROJ_DIR"

# =========================================================
# [1/5] INSTALL DEPENDENCIES
# =========================================================

echo ""
echo -e "${YELLOW}▶ [1/5] Instalando dependências...${NC}"

cd "$PROJ_DIR"
npm install

echo -e "${GREEN}✅ Dependências instaladas${NC}"

# =========================================================
# [2/5] BUILD PROJECT
# =========================================================

echo ""
echo -e "${YELLOW}▶ [2/5] Buildando projeto...${NC}"

npm run build

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Falha no build${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Build concluído${NC}"

# =========================================================
# [3/5] CREATE REMOTE DIR
# =========================================================

echo ""
echo -e "${YELLOW}▶ [3/5] Preparando diretório remoto...${NC}"

ssh -i "$KEY_FILE" \
  -o StrictHostKeyChecking=no \
  ubuntu@"$SERVER_IP" "
    sudo mkdir -p $REMOTE_DIR &&
    sudo chown -R ubuntu:ubuntu $REMOTE_DIR &&
    sudo chmod -R 755 $REMOTE_DIR
"

echo -e "${GREEN}✅ Diretório remoto preparado${NC}"

# =========================================================
# [4/5] SEND FILES
# =========================================================

echo ""
echo -e "${YELLOW}▶ [4/5] Enviando arquivos...${NC}"

rsync -avz --delete \
  -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=no" \
  "$PROJ_DIR/dist/" \
  ubuntu@"$SERVER_IP":"$REMOTE_DIR/"

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Falha ao enviar arquivos${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Arquivos enviados${NC}"

# =========================================================
# [5/5] INSTALL NGINX CONFIG
# =========================================================

echo ""
echo -e "${YELLOW}▶ [5/5] Atualizando nginx...${NC}"

scp -i "$KEY_FILE" \
  -o StrictHostKeyChecking=no \
  "$NGINX_CONF_LOCAL" \
  ubuntu@"$SERVER_IP":/tmp/mex-connect.conf

ssh -i "$KEY_FILE" \
  -o StrictHostKeyChecking=no \
  ubuntu@"$SERVER_IP" "

    sudo mv /tmp/mex-connect.conf $NGINX_CONF_REMOTE &&

    sudo ln -sf \
      $NGINX_CONF_REMOTE \
      /etc/nginx/sites-enabled/mex-connect.conf &&

    sudo nginx -t &&

    sudo systemctl reload nginx
"

echo -e "${GREEN}✅ Nginx atualizado${NC}"

# =========================================================
# DONE
# =========================================================

echo ""
echo -e "${BLUE}=========================================================${NC}"
echo -e "${GREEN}🚀 Deploy finalizado com sucesso!${NC}"
echo -e "${BLUE}=========================================================${NC}"

echo ""
echo -e "${GREEN}URL:${NC}"
echo "https://mex.app.br/connect"
echo ""