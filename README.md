# Everyday Tools

**O teu canivete suíço digital.**

Converte PDFs, documentos, imagens, vídeo e áudio no teu próprio servidor. Os ficheiros
nunca saem de casa, apagam-se sozinhos ao fim de uma hora e ninguém precisa de saber o
que é um codec para os usar.

Criado por [Dinis Mago](https://github.com/dinismagoptoficial). Código aberto sob a [licença MIT](LICENSE).

[English](README.en.md) · [Operação](docs/operations.md) · [Segurança](SECURITY.md) · [Contribuir](CONTRIBUTING.md)

---

## Instalar

Num servidor ou PC com Ubuntu, Debian, Linux Mint ou LMDE, cola isto no terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/dinismagoptoficial/everydaytools/main/install.sh | sudo bash
```

É tudo. O instalador trata do Docker, descarrega o projeto, arranca os serviços e no fim
mostra-te o endereço:

```text
Everyday Tools está a funcionar.
Endereço local:  http://everyday-tools.local
Acesso por IP:   http://192.168.1.50
```

Abre esse endereço, cria a tua conta de administrador e já está. Não há palavras-passe
predefinidas para trocar nem ficheiros de configuração para editar.

Correr o comando outra vez atualiza a instalação sem tocar nas contas, nas definições
nem nos ficheiros que estejam a ser processados.

### O que o instalador faz por ti

- Instala o Docker e o plugin Compose, se ainda não os tiveres
- Junta a tua conta ao grupo `docker`, para não precisares de `sudo` a toda a hora
- Instala em `/opt/everyday-tools` e arranca os serviços
- Configura o Avahi para o endereço `everyday-tools.local` funcionar na tua rede
- Volta a anunciar esse nome sozinho se o router mudar o IP
- Confirma no fim que a aplicação responde

FFmpeg, LibreOffice, OCR e o modelo de remoção de fundo ficam todos dentro dos
containers. No teu sistema entram apenas o Docker, o Compose e o Avahi.

### Preciso de quê

| | |
| --- | --- |
| Sistema | Ubuntu 22.04+, Debian 12+, Linux Mint 21+, LMDE 6+ ou outro da mesma família |
| Núcleo | Linux 5.13 ou posterior, para o isolamento dos conversores |
| Memória | 4 GB recomendados. Com 2 GB usa o [perfil reduzido](#servidores-com-menos-recursos) |
| Disco | 10 GB livres |
| Arquitetura | amd64 ou arm64 |

O primeiro arranque descarrega as dependências e o modelo de remoção de fundo, por isso
precisa de Internet. A partir daí as conversões funcionam offline.

### Instalar à mão

Se preferires ver o que estás a correr antes de o correr, ou se usas outro sistema com
Docker:

```bash
git clone https://github.com/dinismagoptoficial/everydaytools.git
cd everydaytools
cp .env.example .env
docker compose up -d --build --wait
```

Para mudar a porta, define `PORT=8080` no `.env` antes de arrancar.

## O que inclui

| Área | Ferramentas |
| --- | --- |
| PDF | Juntar, dividir, ordenar, rodar, comprimir, proteger, desbloquear, OCR em português e inglês, extrair texto e imagens, preencher formulários, PDF/A e reparação |
| Editor PDF | Texto, imagens, assinatura visual, desenho, realce, sublinhado, numeração, marca de água e ocultação permanente |
| Documentos | Word, Excel, PowerPoint e OpenDocument para PDF; conversão entre CSV, XLSX e ODS |
| Imagens | Conversão, compressão, dimensões, remoção de metadados e remoção de fundo com modelo local e ajuste manual da máscara |
| Vídeo e áudio | Conversão, compressão, resolução, codecs, GIF, extração de áudio, vídeo sem som e normalização de volume |
| Arquivos | Criar e extrair ZIP, TAR, GZIP e 7z |
| Dia a dia | QR e códigos de barras, palavras-passe, frases-passe, texto, comparação, unidades, percentagens, idade e timestamps |

As ferramentas compatíveis aparecem depois de escolheres os ficheiros. Operações em lote podem produzir resultados individuais e um ZIP para descarregar tudo. Os resultados compatíveis podem ser pré-visualizados antes do download. Na remoção de fundo podes corrigir a máscara, escolher uma cor ou carregar outra imagem e preparar o PNG final no browser.

O editor acrescenta conteúdo; não reescreve o texto original. A assinatura é visual, sem certificado digital. As páginas com ocultações permanentes são reconstruídas como imagem. A fidelidade de Office, o OCR e os contornos da remoção de fundo dependem dos ficheiros. PDF/A é produzido pelo OCRmyPDF, sem validação independente com veraPDF. Os formulários suportam campos de texto e lista, sem XFA. GZIP aceita um ficheiro por operação.

## Servidores com menos recursos

O perfil de memória reduzida limita o processamento a uma tarefa de cada vez, um thread e 1,5 GB de RAM para o worker. A interface tem um limite de 512 MB. Reserva também memória para o sistema operativo; ficheiros grandes podem ultrapassar estes limites.

```bash
docker compose -f compose.yaml -f compose.low-memory.yaml up -d --build --wait
```

Mantém os dois ficheiros nos comandos seguintes, incluindo atualizações:

```bash
COMPOSE_FILE=compose.yaml:compose.low-memory.yaml bash update.sh
```

No perfil normal, a fila permite até 3 tarefas leves, 2 médias e 1 pesada, com um limite global e um orçamento calculado a partir da memória do container. Estas estimativas controlam a admissão na fila; os limites Docker continuam a limitar a memória real. CPU, threads e memória são ajustáveis em `.env`.

## Contas, ficheiros e privacidade

Cada conta acede aos seus ficheiros. Em **A minha conta** podes editar nome, e-mail, idioma e palavra-passe. Alterar o e-mail exige a palavra-passe atual e termina as outras sessões.

Os ficheiros expiram, por defeito, 60 minutos após a criação da tarefa. O prazo não é prolongado por downloads ou novas tentativas. A eliminação interrompe o processamento e remove originais, resultados e temporários. Se o processo ainda estiver a terminar, o acesso é revogado e a limpeza volta a tentar.

O volume Docker guarda contas, definições, tarefas temporárias e o modelo. Não há telemetria, fontes remotas ou publicidade. O worker não tem acesso à rede. As ferramentas de texto e calculadoras correm no browser. SMTP é opcional e serve apenas para recuperar acesso à conta.

O administrador define o acesso, a retenção, os backups e os contactos de privacidade da sua instalação. A interface não lhe permite descarregar documentos de outras contas, mas quem controla o servidor tem acesso técnico ao armazenamento. A aplicação não controla snapshots, backups externos ou cópias já descarregadas. Consulta [privacidade e condições](docs/legal.md).

## Manutenção

```bash
cd /opt/everyday-tools
sudo bash backup.sh    # contas e definições, sem documentos
sudo bash update.sh    # faz cópia, atualiza, reinicia e verifica
docker compose ps      # estado dos serviços
```

O backup inclui contas, preferências e configuração. Exclui documentos, tarefas e sessões. A atualização cria um backup, preserva a imagem anterior, reconstrói a aplicação e verifica os serviços. As instruções de HTTPS, SMTP e restauro estão em [docs/operations.md](docs/operations.md).

Limites editáveis são definidos inicialmente em `.env`. Depois do setup, muda retenção, quotas, registos e concorrência em **Administração**. Os recursos dos containers e SMTP continuam em `.env`.

## Desenvolvimento

React e TypeScript na interface, FastAPI e SQLite no servidor, com um supervisor separado para os conversores. Não precisa de Redis.

```bash
python -m venv .venv
# Ativa o ambiente virtual antes dos comandos seguintes.
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
python -m ruff check app tests scripts
cd web
npm ci
npm run build
```

Os testes de instalação e isolamento requerem Linux. Os testes de browser e conversão usam o projeto Docker descartável `everyday-tools-test`, na porta 8087. Instruções em [docs/testing.md](docs/testing.md).

As dependências mantêm as suas licenças, descritas em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). As condições de redistribuição dos conversores também se aplicam às imagens Docker.

© 2026 Dinis Mago e contribuidores. Projeto desenvolvido em parceria com a Lusyn Software.
