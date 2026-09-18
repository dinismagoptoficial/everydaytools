from pathlib import Path

VERSION = "2026-09-18"
AUTHOR = "Dinis Mago"
AUTHOR_URL = "https://github.com/dinismagoptoficial"

DOCUMENTS = {
    "pt-PT": [
        {"id": "copyright", "title": "Autoria e licença", "paragraphs": [
            "Everyday Tools foi criado por Dinis Mago. Copyright © 2026 Dinis Mago e contribuidores. O código do projeto é disponibilizado sob a licença MIT.",
            "Podes utilizar, estudar, modificar e distribuir o código, incluindo para fins comerciais, respeitando o aviso de copyright e a licença. As bibliotecas, programas e modelos incluídos mantêm as suas próprias licenças. A licença MIT não transfere direitos sobre marcas de terceiros."]},
        {"id": "terms", "title": "Condições de utilização", "paragraphs": [
            "Processa apenas ficheiros que tenhas direito a utilizar. Não uses a aplicação para aceder a contas alheias, distribuir conteúdo ilícito ou comprometer outros sistemas.",
            "Confirma o resultado antes de o utilizar ou partilhar. A conversão pode alterar a formatação, a qualidade ou os metadados. A assinatura de PDF é visual e não equivale a uma assinatura digital certificada.",
            "O software é fornecido sem garantias, nos termos da licença MIT e na medida permitida pela lei aplicável. Estas condições não limitam direitos legais obrigatórios nem os direitos concedidos pela licença de código aberto."]},
        {"id": "privacy", "title": "Privacidade e retenção", "paragraphs": [
            "Esta instalação é gerida pela pessoa ou entidade que a disponibiliza. O autor do software não recebe os teus documentos nem gere automaticamente os dados de instalações de terceiros. Para questões sobre os teus dados, contacta quem te deu acesso a esta instalação.",
            "São guardados o e-mail, o hash da palavra-passe, as preferências da conta e os dados necessários à sessão. Os ficheiros, os nomes e as opções de processamento ficam associados temporariamente à tua conta. O administrador pode gerir contas e estados das tarefas; a interface não lhe dá acesso aos documentos de outras pessoas. Quem controla o servidor tem acesso técnico ao respetivo armazenamento.",
            "Os ficheiros são processados no teu dispositivo ou neste servidor. Não existem analytics, publicidade ou envio de documentos para serviços externos. Se o administrador configurar SMTP, o endereço e as mensagens da conta, incluindo criação e recuperação, passam pelo servidor de correio escolhido.",
            "Por defeito, originais, resultados e temporários expiram 60 minutos após a criação da tarefa. O administrador pode alterar o prazo para novos ficheiros. A interface mostra o prazo de cada tarefa. Eliminar agora remove as cópias controladas pela aplicação depois de parar o processamento. A limpeza verifica os prazos ao arrancar e periodicamente.",
            "As contas e preferências mantêm-se até serem eliminadas. As sessões expiram ao fim de sete dias e as ligações de recuperação ao fim de 30 minutos. Contadores de proteção contra abuso são temporários. Backups da aplicação guardam contas e definições, sem documentos ou sessões. A retenção dos backups e os registos de infraestrutura dependem do administrador.",
            "Podes consultar e corrigir os dados da conta, descarregar resultados e eliminar tarefas. Para eliminação da conta, acesso a backups ou exercício de outros direitos aplicáveis, contacta o administrador. A base legal, os contactos do responsável e outras informações exigidas para utilização fora do âmbito pessoal devem ser definidos por quem gere a instalação. Este aviso técnico não constitui uma declaração automática de conformidade com o RGPD.",
            "Não é garantido apagamento físico forense em SSDs, snapshots, backups externos ou cópias já descarregadas. Estes meios não estão sob controlo da aplicação."]},
        {"id": "cookies", "title": "Cookies e preferências", "paragraphs": [
            "O cookie everyday_session mantém a sessão iniciada. É HttpOnly e SameSite=Lax, com Secure quando a ligação usa HTTPS. O idioma também é guardado no browser e pode ser associado à conta. Não são usados cookies de publicidade ou análise de comportamento."]},
        {"id": "administration", "title": "Responsabilidade da instalação", "paragraphs": [
            "O administrador define quem pode aceder, os limites, a retenção e os contactos de suporte. Deve proteger o servidor, atualizar o software e gerir backups. Se a instalação servir uma organização ou for disponibilizada ao público, deve completar a informação de privacidade com os contactos, finalidades e bases legais aplicáveis.",
            "A confirmação no setup regista a versão deste aviso e a data de leitura nas definições da instalação. Não é um consentimento para publicidade nem uma renúncia a direitos."]},
    ],
    "en": [
        {"id": "copyright", "title": "Author and license", "paragraphs": [
            "Everyday Tools was created by Dinis Mago. Copyright © 2026 Dinis Mago and contributors. The project source code is available under the MIT license.",
            "You may use, study, modify and distribute the code, including commercially, while retaining the copyright notice and license. Bundled libraries, programs and models retain their own licenses. The MIT license does not grant rights to third-party trademarks."]},
        {"id": "terms", "title": "Terms of use", "paragraphs": [
            "Only process files you have the right to use. Do not use the application to access other people's accounts, distribute unlawful content or compromise other systems.",
            "Check results before using or sharing them. Conversion can change formatting, quality or metadata. PDF signatures are visual and are not certified digital signatures.",
            "The software is provided without warranties under the MIT license, to the extent permitted by applicable law. These terms do not restrict mandatory legal rights or rights granted by the open source license."]},
        {"id": "privacy", "title": "Privacy and retention", "paragraphs": [
            "This installation is operated by the person or entity providing access. The software author does not receive your documents or automatically manage data in third-party installations. For questions about your data, contact the person who gave you access.",
            "The application stores your email, password hash, account preferences and session data. Files, names and processing options are temporarily associated with your account. Administrators can manage accounts and task status; the interface does not give them access to other people's documents. The server operator has technical access to its storage.",
            "Files are processed on your device or this server. There are no analytics, advertising or external document processing services. If SMTP is configured, your address and account messages, including creation and recovery, pass through the mail server selected by the administrator.",
            "By default, originals, results and temporary files expire 60 minutes after task creation. Administrators can change retention for new files. Each task displays its expiry time. Delete now removes application-controlled copies after stopping processing. Cleanup checks deadlines at startup and periodically.",
            "Accounts and preferences remain until deleted. Sessions expire after seven days and recovery links after 30 minutes. Abuse prevention counters are temporary. Application backups contain accounts and settings, without documents or sessions. Backup retention and infrastructure logs are managed by the administrator.",
            "You can view and correct your account details, download results and delete tasks. Contact the administrator for account deletion, access to backups or other applicable data rights. The operator must define the legal basis, controller contact details and any additional information required outside personal use. This technical notice is not an automatic declaration of GDPR compliance.",
            "Physical forensic erasure cannot be guaranteed on SSDs, snapshots, external backups or previously downloaded copies. These are outside the application's control."]},
        {"id": "cookies", "title": "Cookies and preferences", "paragraphs": [
            "The everyday_session cookie keeps you signed in. It uses HttpOnly and SameSite=Lax, and Secure over HTTPS. Your language is also saved in your browser and can be associated with your account. No advertising or behavioural analytics cookies are used."]},
        {"id": "administration", "title": "Installation responsibility", "paragraphs": [
            "The administrator controls access, limits, retention and support contact details. They should protect the server, keep the software updated and manage backups. Organisations and public installations must complete their privacy information with the relevant contacts, purposes and legal bases.",
            "Setup confirmation records the notice version and review date in installation settings. It is not advertising consent or a waiver of rights."]},
    ],
}


def information():
    root = Path(__file__).resolve().parent.parent
    return {"version": VERSION, "author": AUTHOR, "author_url": AUTHOR_URL,
            "documents": DOCUMENTS, "license": (root / "LICENSE").read_text(encoding="utf-8"),
            "third_party": (root / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")}
