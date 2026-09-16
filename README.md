# Everyday Tools

**Your digital Swiss Army knife.**

Ferramentas privadas para PDFs, documentos, imagens, vídeo, áudio e pequenas tarefas do dia a dia. Uma aplicação para instalar em casa e utilizar na rede local, em português de Portugal ou inglês.

## Instalar com Docker

Requisitos recomendados: Linux com Landlock (Ubuntu 22.04+, Debian 12+, Linux Mint 21+ ou LMDE 6+), Docker Compose v2, 4 GB de RAM e 10 GB de disco livres. Docker Desktop com um kernel Linux compatível também funciona. O limite do serviço de processamento é de 2 CPUs e 3 GB de RAM; ajustável em `.env`.

```bash
cp .env.example .env
docker compose up -d
```

O primeiro arranque constrói a imagem e instala as dependências e o modelo de remoção de fundo. Precisa de Internet nesta etapa. Depois, o processamento funciona offline. A construção inicial pode demorar vários minutos.

Abre **http://IP-DO-SERVIDOR**. A primeira visita permite criar o administrador, dar um nome à instalação e escolher limites. Por defeito, os ficheiros expiram **60 minutos após a criação da tarefa**. O primeiro administrador não tem credenciais predefinidas.

Para outra porta, define `PORT=8080` em `.env` antes de iniciar. Não exponhas a instalação à Internet antes de concluir o setup.

## Ubuntu, Debian e Linux Mint

Na pasta deste projeto:

```bash
sudo bash install.sh
```

Suporta Ubuntu, Debian, **Linux Mint**, LMDE e outras distribuições da mesma família, como Pop!_OS ou Zorin. O sistema é identificado por `/etc/os-release`: uma distribuição não é recusada por se chamar `linuxmint` em vez de `ubuntu`. Como a Docker só publica repositórios para Ubuntu e Debian, o instalador usa a versão base indicada pelo próprio sistema — Linux Mint 22 instala a partir de `ubuntu noble`, Mint 21 de `ubuntu jammy` e LMDE 6 de `debian bookworm`.

O instalador prepara Docker, Compose e Avahi, adiciona a tua conta ao grupo `docker`, instala em `/opt/everyday-tools`, inicia os serviços, verifica a saúde da aplicação e mostra os endereços `.local` e IP. Executá-lo novamente preserva contas, definições, volumes e ficheiros em processamento. O nome `everyday-tools.local` depende do suporte mDNS da rede e do dispositivo. O IP continua disponível.

FFmpeg, LibreOffice, OCR e o modelo de remoção de fundo ficam dentro dos containers. No sistema anfitrião só são instalados Docker, Compose e Avahi.

O projeto ainda não tem um URL público de distribuição definido. Para futura instalação por `curl`, publica o repositório e define `EVERYDAY_TOOLS_REPOSITORY`; o script não aponta para um endereço fictício. Reserva o endereço IP do servidor no router para manter o anúncio mDNS estável.

## Ferramentas

| Área | Operações |
| --- | --- |
| PDF | Juntar, dividir, ordenar/extrair/eliminar páginas, rodar, comprimir, imagens ↔ PDF, marca de água, números, proteger/desbloquear, OCR português/inglês, extrair texto/imagens, formulários de texto, PDF/A e reparação |
| Editor PDF | Adicionar texto, imagem, assinatura visual, desenho, realce, sublinhado, retângulo e ocultação permanente; ordenar, rodar e eliminar páginas |
| Documentos | Word, Excel, PowerPoint e OpenDocument para PDF; CSV/XLSX/ODS |
| Imagens | JPG, PNG, HEIC/HEIF, WebP, AVIF, SVG e outros formatos de entrada; conversão para JPG/PNG/WebP/AVIF, compressão, dimensões, remoção de EXIF e fundo. Comprimir e remover metadados mantêm o formato original por predefinição |
| Vídeo | MP4/MOV/MKV/WebM/AVI, GIF como entrada; MP4/MKV/WebM como saída, compressão, resolução/FPS/bitrate/codec, GIF, extrair/remover áudio |
| Áudio | MP3, WAV, FLAC, AAC, M4A e OGG; conversão, bitrate e normalização |
| Arquivos | Criar e extrair ZIP, TAR, GZIP e 7z, com limites e validação de caminhos |
| Dia a dia | Criar/ler QR e códigos de barras, palavras-passe/frases-passe, contar/transformar/comparar texto, remover linhas repetidas, unidades, percentagens, idade e timestamps |

Operações compatíveis são apresentadas após o upload. Vários ficheiros podem ser processados em conjunto quando a operação o permite. Resultados múltiplos incluem downloads individuais e um ZIP temporário.

O editor adiciona conteúdo; não altera semanticamente texto existente. A assinatura é visual, sem certificado digital. Páginas com ocultações permanentes são reconstruídas a partir de píxeis: perdem texto selecionável e o conteúdo original dessa página não é incluído no resultado. Revê sempre documentos editados antes de os partilhar.

A fidelidade de Office, a reparação de PDFs e os contornos da remoção de fundo dependem do documento. PDF/A é produzido pelo OCRmyPDF; esta versão não inclui validação independente com veraPDF. SVG é aceite como entrada estática com referências externas bloqueadas, não como formato vetorial de saída. Formulários suportam campos de texto/lista; XFA e assinaturas digitais não estão implementados. GZIP aceita um ficheiro de cada vez. A extração de arquivos apresenta os ficheiros com nomes únicos, sem reconstruir diretórios arbitrários.

## Dados e privacidade

Um volume Docker contém:

```text
/data/database   SQLite: contas, sessões, definições e tarefas temporárias
/data/jobs       Um diretório isolado por tarefa
/data/temp       Coordenação entre processos, sem documentos
/data/models     Modelo local de remoção de fundo
```

Os prazos são persistidos em SQLite. A aplicação e o serviço de processamento eliminam tarefas expiradas ao arrancar e verificam novamente a cada 30 segundos. O acesso a um ficheiro expirado é recusado imediatamente, mesmo antes dessa verificação. «Eliminar agora» interrompe o processamento associado e elimina o diretório e o registo da tarefa. Temporários de processamento são removidos também após falha ou timeout.

São eliminadas todas as cópias controladas pela aplicação. Isto não é uma garantia de apagamento físico forense em SSDs, snapshots ou backups externos. Não incluas o volume de tarefas em backups do host. Logs não contêm nomes de documentos, texto extraído, passwords ou tokens; rodam automaticamente.

Não há fontes remotas, CDN, telemetria ou APIs de conversão. O serviço de processamento não tem rede no Compose. O modelo U²-Net small é incluído na instalação e verificado por SHA-256. As ferramentas leves de texto/códigos/calculadoras correm no browser.

## Recursos e fila

Por defeito: **3 LIGHT, 2 MEDIUM e 1 HEAVY**. A atribuição é atómica em SQLite e alterna entre utilizadores com base na última vez que foram servidos. Cancelar uma tarefa só liberta a vaga depois de o processo terminar. Existe um único supervisor por instalação; não escales o serviço `worker` com réplicas.

Cada pessoa pode ter 5 tarefas pendentes/em processamento. Login: 5 tentativas/minuto por IP e conta. Upload: 20/10 minutos por conta. Registo, criação de tarefas, recuperação e ações administrativas também têm limites.

Antes de aceitar ficheiros, a aplicação reserva espaço para originais e resultados. Reserva por tarefa: tamanho de entrada + `min(MAX_OUTPUT_MB, max(4 × entrada, 128 MB))`. O total reservado é limitado pelo armazenamento configurado e espaço livre mínimo. Quando uma tarefa termina com sucesso, a parte não utilizada da reserva é libertada imediatamente; tarefas falhadas mantêm o orçamento para permitir nova tentativa. Conversões que excedam o orçamento, tempo ou memória falham sem deixar o processo em execução. Grandes PDFs/imagens também têm limites de páginas/píxeis.

Os limites iniciais em `.env` são importados apenas na primeira criação da base de dados. Depois, edita retenção, uploads, filas, registos e quotas em **Administração → Definições**. Recursos dos containers, timeout e SMTP continuam em `.env`.

## Atualizar e fazer backup

```bash
bash backup.sh
bash update.sh
```

O backup contém apenas contas e configuração, **sem tarefas, sessões, ficheiros ou páginas livres da base de dados original**. Contém hashes de palavras-passe e, se configuradas, credenciais SMTP em `.env`; guarda-o em local privado. O exportador lê uma transação consistente e cria uma nova base de dados com as tabelas vazias de dados temporários.

A atualização cria backup, preserva a imagem anterior, obtém alterações Git com `--ff-only` quando existe origem, constrói a nova imagem, reinicia, aplica migrações e verifica os serviços. Sem origem Git, reconstrói o código presente na pasta. As instruções de restauro estão em [docs/operations.md](docs/operations.md).

## Desenvolvimento e testes

```bash
python -m venv .venv
# Ativar .venv de acordo com o sistema
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
cd web
npm ci
npm run build
```

Para desenvolvimento, `python -m uvicorn app.main:app --reload --no-access-log` e `npm run dev` servem a API e a interface. O processamento deve usar Linux/Docker. Uma opção explícita `ALLOW_UNSANDBOXED_DEV=true` permite o supervisor nativo em Windows para fixtures de confiança, sem isolamento de filesystem; não é apropriada para utilização normal.

Testes reais de browser e conversores usam uma instalação Docker **descartável** na porta 8087, projeto `everyday-tools-test`, criada por `bash scripts/test-stack.sh up`. Ver [docs/testing.md](docs/testing.md). Os testes não criam contas na instalação de utilização final.

Arquitetura: React/TypeScript/Vite, FastAPI, SQLite WAL, filesystem e um supervisor de processos. Sem Redis nem serviços cloud. Consulta [docs/security.md](docs/security.md) e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).


© Dinis Mago 2026

Projeto desenvolvido em parceria com a Lusyn Software.