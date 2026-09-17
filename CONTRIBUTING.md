# Contribuir / Contributing

Para reportar um erro, indica os passos, o resultado esperado, o browser e a versão do servidor. Usa ficheiros de exemplo sem dados pessoais. Vulnerabilidades seguem [SECURITY.md](SECURITY.md).

Mantém as alterações focadas no problema. O texto da interface deve existir em português de Portugal e inglês. Evita dependências de serviços externos e preserva o isolamento dos ficheiros. Acrescenta testes quando corrigires um comportamento que possa voltar a falhar.

Antes de propor alterações, executa os testes Python, Ruff e o build da interface. Alterações a conversores precisam também dos testes Docker. Segue [docs/testing.md](docs/testing.md). As contribuições são disponibilizadas sob a licença MIT do projeto.

When reporting a bug, include reproduction steps, expected behaviour, browser and server version. Use sample files without personal data. Follow [SECURITY.md](SECURITY.md) for vulnerabilities.

Keep changes focused. Interface text must be available in European Portuguese and English. Avoid external service dependencies and preserve file isolation. Add regression tests for behaviour that could break again.

Run Python tests, Ruff and the frontend build before submitting changes. Converter changes also require Docker integration checks. Contributions use the project's MIT license.
