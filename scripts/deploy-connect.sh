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
EC2_INFO_FILE="$PROJECT_ROOT/ec2-info.txt"
KEY_FILE="$PROJECT_ROOT/mex-admin-service-key.pem"
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


# Garante que o diretório remoto existe e permissões para ubuntu
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "sudo mkdir -p /home/ubuntu/mex-connect/ && sudo chown -R ubuntu:ubuntu /home/ubuntu/mex-connect/ && sudo chmod -R u+rwX /home/ubuntu/mex-connect/"

# Envia todos os arquivos do dist para o destino correto
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -r "$PROJ_DIR/dist/"* ubuntu@"$SERVER_IP":/home/ubuntu/mex-connect/
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Falha ao enviar arquivos para o servidor.${NC}"
  exit 1
fi

# Atualiza configuração do Nginx
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "$NGINX_CONF_LOCAL" ubuntu@"$SERVER_IP":/tmp/mex-connect.conf
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "sudo mv /tmp/mex-connect.conf $NGINX_CONF_REMOTE && sudo ln -sf $NGINX_CONF_REMOTE /etc/nginx/sites-enabled/mex-connect.conf"

# Remove possíveis conflitos antigos
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "sudo rm -f /etc/nginx/sites-enabled/mex.app.br /etc/nginx/sites-enabled/default /etc/nginx/conf.d/mex-connect.conf /etc/nginx/conf.d/default.conf"

# Garante apenas o novo conf ativo
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "sudo ln -sf $NGINX_CONF_REMOTE /etc/nginx/sites-enabled/mex-connect.conf"

# Corrige permissões dos arquivos do site para www-data e garante acesso do Nginx
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "sudo chown -R www-data:www-data /home/ubuntu/mex-connect/ && sudo chmod -R 755 /home/ubuntu/mex-connect/ && sudo chmod o+x /home/ubuntu && sudo chmod -R o+rx /home/ubuntu/mex-connect"

# Testa configuração do Nginx
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "sudo nginx -t"

# Recarrega Nginx
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "sudo systemctl reload nginx && echo 'Nginx recarregado com sucesso.' || echo 'Falha ao recarregar Nginx.'"

# Mostra arquivos no diretório do site
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "ls -l /home/ubuntu/mex-connect/"

# Mostra últimos erros do Nginx
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@"$SERVER_IP" "sudo tail -n 30 /var/log/nginx/error.log"

# Teste HTTP automático do /connect
curl -I https://mex.app.br/connect || curl -I http://mex.app.br/connect
curl https://mex.app.br/connect || curl http://mex.app.br/connect

echo -e "${BLUE}Deploy do mex-connect finalizado!${NC}"