# Segurança e limites

O âmbito é uma instalação privada com utilizadores não necessariamente confiáveis. Os endpoints de tarefas exigem sessão e verificam proprietário em cada leitura, upload, execução, download, cancelamento e eliminação. O administrador vê estados gerais, sem acesso a documentos de outras pessoas.

Passwords usam Argon2id. Tokens de sessão e recuperação têm 256 bits aleatórios e só o hash é persistido. Login substitui a sessão anterior; alteração de password revoga as outras. Contas desativadas perdem acesso imediatamente. O setup é protegido por uma transação SQLite e só existe antes da primeira conta.

Os uploads são transmitidos diretamente para um diretório aleatório por tarefa. A API exige reserva prévia, limita os bytes reais, verifica formato/MIME, recusa extensões não suportadas e não utiliza nomes enviados como caminhos. JSON tem limite de 2 MB. SVG usa XML seguro, sem referências externas, scripts, CSS ou foreignObject.

As transformações correm em processos filhos com timeout, limites de ficheiro, CPU e espaço de endereçamento. O container tem limites de CPU, memória e processos; filesystem raiz só de leitura, sem capacidades, sem elevação de privilégios e sem rede. Linux Landlock restringe cada conversor ao seu diretório e aos recursos do programa/modelo. A base de dados e outros diretórios de tarefas não são acessíveis pelo conversor. Se o kernel não suportar Landlock, o processamento falha; não faz fallback silencioso para execução sem isolamento.

Processos são terminados em grupo antes de libertar a vaga de processamento ou eliminar dados. SQLite coordena atribuição e quotas; locks de filesystem coordenam upload, execução e eliminação. Os prazos persistem e são verificados também no acesso. A eliminação de um ficheiro já aberto por um download não pode revogar os bytes anteriormente entregues ao cliente; não são conservadas cópias adicionais no servidor.

ZIP/TAR/7z rejeitam caminhos absolutos, `..` e symlinks. TAR recusa dispositivos e hardlinks. A extração usa IO limitado e nomes internos únicos, sem `extractall` para caminhos arbitrários. Há limites de quantidade de ficheiros, tamanho expandido, taxa de expansão ZIP, tempo, memória e quota global. 7z usa uma factory de escrita controlada.

Limitações: o isolamento é defesa adicional, não uma prova de invulnerabilidade dos conversores. Mantém kernel, Docker e dependências atualizados. A API de upload faz identificação de formato, não um antivírus. Algumas proteções do browser e cópia para clipboard dependem do contexto HTTP/HTTPS; existe fallback de cópia para HTTP local. Não é prometido apagamento físico forense. Snapshots, backups do host e ficheiros já descarregados estão fora do controlo da aplicação.
