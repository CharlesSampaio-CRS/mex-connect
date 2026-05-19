#!/bin/bash
set -e

# Diretório do script
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJ_DIR="$PROJECT_ROOT/.."

NGINX_CONF_LOCAL="$PROJECT_ROOT/mex-connect.conf"
NGINX_CONF_REMOTE="/etc/nginx/sites-available/mex-connect.conf"
if [ ! -f "$NGINX_CONF_LOCAL" ]; then
  echo "❌ Arquivo de configuração do Nginx não encontrado em $NGINX_CONF_LOCAL"
  exit 1
fi

# Caminho correto para o ec2-info.txt e chave PEM
EC2_INFO_FILE="$PROJECT_ROOT/../../deploy/ec2-info.txt"
KEY_FILE="$(cd -- "$PROJECT_ROOT/../../secrets" && pwd)/mex-admin-service-key.pem"
if [ ! -f "$EC2_INFO_FILE" ]; then
  echo -e "${RED}❌ Arquivo ec2-info.txt não encontrado em $EC2_INFO_FILE${NC}"
  exit 1
fi
if [ ! -f "$KEY_FILE" ]; then
  echo -e "${RED}❌ Chave PEM não encontrada em $KEY_FILE${NC}"
  exit 1
fi
SERVER_IP=$(grep "^Public IP:" "$EC2_INFO_FILE" | awk '{print $3}')
if [ -z "$SERVER_IP" ]; then
  echo -e "${RED}❌ IP do servidor não encontrado em $EC2_INFO_FILE${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}▶ [0/3] Instalando dependências mex-connect...${NC}"
if [ ! -f "$PROJ_DIR/package.json" ]; then
  echo -e "${RED}❌ package.json não encontrado em $PROJ_DIR.${NC}"
  exit 1
fi
(cd "$PROJ_DIR" && npm install)
echo -e "${GREEN}  ✅ Dependências instaladas${NC}"

echo ""
echo -e "${YELLOW}▶ [1/3] Buildando mex-connect...${NC}"
(cd "$PROJ_DIR" && npm run build)
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Falha ao buildar mex-connect.${NC}"
  exit 1
fi
echo -e "${GREEN}  ✅ Build concluído${NC}"


# Garante que o diretório remoto e subpastas existem e permissões para ubuntu
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "sudo mkdir -p /home/ubuntu/mex-connect/assets/logos && sudo chown -R ubuntu:ubuntu /home/ubuntu/mex-connect/ && sudo chmod -R u+rwX /home/ubuntu/mex-connect/"

# Envia todo o conteúdo de dist (incluindo subpastas)
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -r "$PROJ_DIR/dist/"* ubuntu@"$SERVER_IP":/home/ubuntu/mex-connect/
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Falha ao enviar arquivos para o servidor.${NC}"
  exit 1
fi


echo -e "${BLUE}Deploy do mex-connect finalizado!${NC}"