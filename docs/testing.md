# Testes

Existem três níveis. Os dois primeiros correm em qualquer sistema; o terceiro precisa de Docker.

## 1. Testes unitários e de integração (Python)

```bash
python -m venv .venv
# Ativar .venv de acordo com o sistema
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
python -m ruff check app tests scripts
```

Cobrem autenticação, sessões, CSRF, permissões e IDOR, sanitização de nomes, limites de upload e quota, retenção e limpeza depois de reinício, atribuição da fila, equidade entre utilizadores, eliminação imediata e os limites de extração de arquivos. Cada teste usa uma base de dados e um diretório de tarefas temporários; nada toca na instalação real.

`tests/test_install.py` verifica o instalador sem precisar de root nem de apt: as funções do `install.sh` são carregadas com `EVERYDAY_INSTALL_LIB_ONLY=1` e testadas contra ficheiros `/etc/os-release` reais de Linux Mint 21 e 22, LMDE 6, Ubuntu, Debian, Pop!_OS e Fedora. Confirma que cada sistema escolhe o repositório Docker correto (Mint 22 → `ubuntu noble`, LMDE 6 → `debian bookworm`), que o núcleo é avaliado corretamente quanto ao Landlock, que o serviço mDNS publica o endereço atual, e que executar o instalador duas vezes preserva `data/`, `.env` e `backups/`.

Em Windows não existe `libmagic`, por isso a identificação de formatos usa assinaturas e descodificação de cabeçalhos em vez do MIME real. O isolamento Landlock e os conversores externos (FFmpeg, LibreOffice, Ghostscript, OCR) só são exercitados no nível 3.

## 2. Interface (Playwright)

```bash
cd web
npm ci
npx playwright install --with-deps chromium
```

Os testes de browser precisam de uma instalação a correr. Usa sempre a instalação **descartável** descrita abaixo, nunca a de utilização real: os testes criam contas e ficheiros.

## 3. Instalação descartável com Docker

Os testes de browser e de conversores correm contra um projeto Compose separado, na porta 8087, com o seu próprio volume.

```bash
bash scripts/test-stack.sh up      # constrói e arranca em http://127.0.0.1:8087
cd web && npm run test:e2e         # cria o administrador de teste e percorre a aplicação
cd .. && .venv/bin/python tests/docker_smoke.py
bash scripts/test-stack.sh down    # para os serviços e elimina o volume de teste
```

A ordem importa: `docker_smoke.py` inicia sessão com a conta que o primeiro teste Playwright cria (`family@example.test`). Se preferires os comandos diretos, o equivalente é:

```bash
PORT=8087 BIND_ADDRESS=127.0.0.1 docker compose -p everyday-tools-test up -d --build --wait
docker compose -p everyday-tools-test down -v
```

O `-p everyday-tools-test` é obrigatório. Sem ele, os comandos atuam sobre a instalação real e o `down -v` elimina os dados dessa instalação.

### O que cada nível verifica

`web/e2e/app.spec.ts` percorre configuração inicial, mudança de idioma, ferramentas locais do browser, upload, escolha de operação, conversão, download, eliminação imediata e o comportamento em ecrã de telemóvel. Falha se a página fizer qualquer pedido a um endereço externo ou produzir um erro de JavaScript. É esta a verificação automática de que a aplicação funciona sem Internet.

`tests/docker_smoke.py` executa cada conversor real dentro do container: todas as operações de PDF, o editor com ocultação permanente, proteger/desbloquear, Office e folhas de cálculo, imagens, remoção de fundo com o modelo local, vídeo, áudio, arquivos e preenchimento de formulários. Cada tarefa é descarregada, comparada com o tamanho anunciado e eliminada no fim.

### Sem rede

Para confirmar o funcionamento offline depois da instalação:

```bash
docker network disconnect bridge everyday-tools-test-web-1
cd web && npm run test:e2e
```

O serviço de processamento já corre sem rede (`network_mode: none` em `compose.yaml`), por isso os conversores são sempre exercitados sem acesso à Internet.

## Limpeza

`bash scripts/test-stack.sh down` remove containers e volume de teste. `web/test-results/` guarda capturas e tracing das falhas e pode ser apagado a qualquer momento.
