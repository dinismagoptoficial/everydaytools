# Operação

## HTTPS e proxy

O acesso por HTTP funciona na LAN. Para domínio personalizado, termina HTTPS num reverse proxy e configura:

```dotenv
PORT=8080
BIND_ADDRESS=127.0.0.1
COOKIE_SECURE=true
TRUSTED_PROXY_IPS=127.0.0.1
PUBLIC_URL=https://tools.exemplo.pt
```

Se o proxy estiver noutro container ou host, usa o IP/CIDR real desse proxy e um endereço de escuta acessível. Nunca configura `TRUSTED_PROXY_IPS=*` numa porta acessível diretamente a clientes. Preserva `Host`, `X-Forwarded-Proto` e `X-Forwarded-For`. Cookies são HttpOnly e SameSite=Lax; CSRF exige um token da sessão e o cabeçalho de pedido da aplicação. O proxy não deve reter/cachar respostas `/api/` nem registar cookies, corpos ou tokens.

O download suporta HTTP range. Evita buffering persistente de uploads no proxy; se o ativares, os temporários pertencem à configuração do proxy e precisam da respetiva política de limpeza.

## SMTP opcional

Configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_STARTTLS` e `PUBLIC_URL` em `.env`. Reinicia o serviço web. Só o web envia mensagens de recuperação; os conversores não recebem credenciais SMTP nem rede. O link é de utilização única e expira em 30 minutos. Alterar a palavra-passe invalida todas as outras sessões. Não há envio de documentos por e-mail.

## Restauro

1. Para os serviços com `docker compose stop web worker`.
2. Extrai o backup para um diretório privado, confirma que contém `database.sqlite3` e configura a `.env` conforme o novo servidor.
3. Inicia apenas `init` para preparar o volume. Copia `database.sqlite3` para `/data/database/everyday.sqlite3` através de um container temporário com o volume montado e os serviços parados. Elimina eventuais `everyday.sqlite3-wal` e `everyday.sqlite3-shm` antigos antes de substituir a base de dados; são journals da base anterior.
4. Garante proprietário `10001:10001` e modo `0600` para a base. Inicia os serviços com `docker compose up -d --wait`.

O restauro recupera contas e definições. Todas as pessoas voltam a iniciar sessão. Os documentos não são recuperados, porque não fazem parte do backup.

## Atualização falhada

Consulta `docker compose logs --tail 50`. A atualização deixa o backup e a tag `everyday-tools:previous`. Faz o rollback do código/imagem juntamente com a base de dados compatível se uma migração tiver alterado o esquema. Não arranques código antigo sobre um esquema incompatível. O script não elimina dados nem faz downgrade automático da base.

## mDNS

O instalador anuncia `everyday-tools.local` com um serviço Avahi dedicado (`everyday-tools-mdns.service`), sem alterar o hostname do servidor. O serviço arranca com o sistema e determina o endereço IP no momento em que arranca, por isso o nome continua correto depois de reiniciar. Se o DHCP atribuir outro endereço, o serviço deteta a mudança e volta a anunciar automaticamente; mesmo assim, reservar o IP no router mantém tudo mais estável.

Redes guest, VLANs e alguns dispositivos não propagam mDNS. Usa o IP indicado nesses casos. Se outro dispositivo já publicar o mesmo nome, usa o IP ou escolhe outro nome no serviço.

Em Linux Mint e noutros sistemas de secretária, o `avahi-daemon` e o `libnss-mdns` costumam já estar presentes; o instalador só os instala se faltarem. Se tiveres a firewall `ufw` ativa, permite o mDNS com `sudo ufw allow 5353/udp`. O instalador avisa quando deteta esta situação. As portas publicadas pelo Docker não passam pelo `ufw`, por isso o acesso por IP continua a funcionar mesmo sem essa regra.

Estado do serviço:

```bash
systemctl status everyday-tools-mdns
avahi-resolve -n everyday-tools.local
```

## Permissões e arranque automático

O instalador adiciona a conta que executou o `sudo` ao grupo `docker`. A mudança só tem efeito depois de terminar sessão e voltar a entrar; até lá, usa `sudo` para os comandos `docker`, `update.sh` e `backup.sh`. Os scripts avisam quando não conseguem falar com o Docker, em vez de falharem com um erro de permissões pouco claro.

Depois de reiniciar, o serviço `docker` arranca sozinho e os containers voltam por causa de `restart: unless-stopped` no `compose.yaml`. O volume `everyday-data` é persistente e não é tocado por instalações, atualizações nem backups. Confirma com:

```bash
systemctl is-enabled docker everyday-tools-mdns
docker volume ls | grep everyday
```

## Saúde

`docker compose ps` deve mostrar `web` e `worker` saudáveis; `init` termina com sucesso. `/api/health` mostra a resposta da aplicação e a presença recente do supervisor. O disco continua a permitir downloads mesmo quando novos uploads são recusados por quota.

Uma tarefa interrompida por reinício é marcada como falhada e limpa, sem repetição automática. O utilizador pode tentar novamente enquanto o original existir. A retenção não é prolongada por conversão, download ou nova tentativa.
