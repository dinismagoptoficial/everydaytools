import { createContext, useContext } from "react";
export type Language = "pt-PT" | "en";
export const LanguageContext = createContext<Language>("pt-PT");
export function useText() {
  const lang = useContext(LanguageContext);
  return (pt: string, en: string) => (lang === "pt-PT" ? pt : en);
}
export const toolCopy: Record<string, [string, string, string, string]> = {
  pdf_merge: [
    "Juntar PDFs",
    "Merge PDFs",
    "Vários documentos, um só PDF.",
    "Combine documents into one PDF.",
  ],
  pdf_split: [
    "Dividir PDF",
    "Split PDF",
    "Guarda cada página num ficheiro.",
    "Save each page as a separate file.",
  ],
  pdf_pages: [
    "Organizar páginas",
    "Organize pages",
    "Reordena, extrai ou elimina páginas.",
    "Reorder, extract or delete pages.",
  ],
  pdf_rotate: [
    "Rodar páginas",
    "Rotate pages",
    "Coloca as páginas na direção certa.",
    "Get your pages the right way up.",
  ],
  pdf_compress: [
    "Comprimir PDF",
    "Compress PDF",
    "Reduz o tamanho para partilhar.",
    "Make your document easier to share.",
  ],
  images_pdf: [
    "Imagens para PDF",
    "Images to PDF",
    "Reúne fotografias num documento.",
    "Put your pictures in a document.",
  ],
  pdf_images: [
    "PDF para imagens",
    "PDF to images",
    "Exporta páginas em PNG, JPG ou WebP.",
    "Export pages as PNG, JPG or WebP images.",
  ],
  pdf_word: [
    "PDF para Word",
    "PDF to Word",
    "Cria um DOCX editável a partir do texto e das imagens.",
    "Create an editable DOCX from the text and images.",
  ],
  pdf_watermark: [
    "Marca de água",
    "Watermark",
    "Adiciona uma marca ao documento.",
    "Add a text watermark to every page.",
  ],
  pdf_number: [
    "Numerar páginas",
    "Page numbers",
    "Adiciona números às páginas.",
    "Add page numbers to a document.",
  ],
  pdf_protect: [
    "Proteger PDF",
    "Protect PDF",
    "Define uma palavra-passe de acesso.",
    "Set a password to open your PDF.",
  ],
  pdf_unlock: [
    "Remover palavra-passe",
    "Unlock PDF",
    "Desbloqueia com a palavra-passe correta.",
    "Unlock with the correct password.",
  ],
  pdf_ocr: [
    "Reconhecer texto",
    "Recognize text",
    "Torna pesquisável um PDF digitalizado.",
    "Make a scanned PDF searchable.",
  ],
  pdf_text: [
    "Extrair texto",
    "Extract text",
    "Guarda o texto num ficheiro simples.",
    "Save the text to a plain text file.",
  ],
  pdf_extract_images: [
    "Extrair imagens",
    "Extract images",
    "Guarda as imagens de um PDF.",
    "Save the images inside a PDF.",
  ],
  pdf_edit: [
    "Editar PDF",
    "Edit PDF",
    "Texto, assinatura e anotações.",
    "Add text, signatures and annotations.",
  ],
  pdf_forms: [
    "Preencher formulário",
    "Fill a form",
    "Preenche campos de um PDF interativo.",
    "Fill in an interactive PDF form.",
  ],
  pdf_archive: [
    "Converter para PDF/A",
    "Convert to PDF/A",
    "Prepara um documento para arquivo.",
    "Prepare a document for archiving.",
  ],
  pdf_repair: [
    "Reparar PDF",
    "Repair PDF",
    "Tenta recuperar um ficheiro danificado.",
    "Try to recover a damaged file.",
  ],
  office_pdf: [
    "Documentos para PDF",
    "Documents to PDF",
    "Word, Excel, PowerPoint e OpenDocument.",
    "Word, Excel, PowerPoint and OpenDocument.",
  ],
  sheet_convert: [
    "Converter folha de cálculo",
    "Convert spreadsheet",
    "Converte entre CSV, XLSX e ODS.",
    "Convert between CSV, XLSX and ODS.",
  ],
  image_convert: [
    "Converter imagem",
    "Convert image",
    "JPG, PNG, WebP e AVIF.",
    "JPG, PNG, WebP and AVIF.",
  ],
  image_compress: [
    "Comprimir imagem",
    "Compress image",
    "Menos espaço, qualidade à tua escolha.",
    "Smaller files, your choice of quality.",
  ],
  image_resize: [
    "Redimensionar imagem",
    "Resize image",
    "Ajusta as dimensões sem deformar.",
    "Adjust dimensions, keep proportions.",
  ],
  image_metadata: [
    "Remover metadados",
    "Remove metadata",
    "Remove EXIF e localização da imagem.",
    "Remove EXIF and location information.",
  ],
  image_background: [
    "Remover fundo",
    "Remove background",
    "Guarda uma imagem com fundo transparente.",
    "Save an image with a transparent background.",
  ],
  video_convert: [
    "Converter vídeo",
    "Convert video",
    "Prepara um vídeo para outro dispositivo.",
    "Prepare a video for another device.",
  ],
  video_compress: [
    "Comprimir vídeo",
    "Compress video",
    "Reduz o tamanho e ajusta a resolução.",
    "Reduce file size and adjust resolution.",
  ],
  video_gif: [
    "Vídeo para GIF",
    "Video to GIF",
    "Cria um GIF a partir de um pequeno vídeo.",
    "Make a GIF from a short video.",
  ],
  video_mute: [
    "Remover áudio",
    "Mute video",
    "Guarda uma cópia do vídeo sem som.",
    "Save a silent copy of your video.",
  ],
  audio_extract: [
    "Extrair áudio",
    "Extract audio",
    "Guarda apenas o som de um vídeo.",
    "Keep just the sound from a video.",
  ],
  audio_convert: [
    "Converter áudio",
    "Convert audio",
    "MP3, WAV, FLAC, AAC, M4A e OGG.",
    "MP3, WAV, FLAC, AAC, M4A and OGG.",
  ],
  audio_normalize: [
    "Normalizar volume",
    "Normalize volume",
    "Ajusta o volume para ouvir com conforto.",
    "Adjust volume for comfortable listening.",
  ],
  archive_create: [
    "Criar arquivo",
    "Create archive",
    "Junta ficheiros num ZIP, TAR, GZIP ou 7z.",
    "Pack files into ZIP, TAR, GZIP or 7z.",
  ],
  archive_extract: [
    "Extrair arquivo",
    "Extract archive",
    "Abre ZIP, TAR, GZIP e 7z.",
    "Unpack ZIP, TAR, GZIP and 7z.",
  ],
};
export function useToolCopy() {
  const lang = useContext(LanguageContext);
  return (id: string, description = false) => {
    const entry = toolCopy[id];
    return entry ? entry[(description ? 2 : 0) + (lang === "en" ? 1 : 0)] : id;
  };
}

export const feedbackCopy = {
  menu: ["Reportar erro ou sugerir", "Report a bug or suggest"],
  formTitle: ["Enviar comentário", "Send feedback"],
  formIntro: [
    "Conta-nos o que aconteceu ou o que gostarias de ver melhorado.",
    "Tell us what happened or what you would like to see improved.",
  ],
  type: ["Tipo", "Type"],
  bug: ["Relatório de erro", "Bug report"],
  feature: ["Sugestão de funcionalidade", "Feature suggestion"],
  other: ["Outro", "Other"],
  title: ["Título", "Title"],
  titlePlaceholder: ["Resumo breve", "Brief summary"],
  description: ["Descrição", "Description"],
  descriptionPlaceholder: [
    "Explica o que aconteceu, o que esperavas ou como a sugestão ajudaria.",
    "Explain what happened, what you expected or how the suggestion would help.",
  ],
  related: ["Página ou ferramenta relacionada", "Related page or tool"],
  optional: ["Opcional", "Optional"],
  cancel: ["Cancelar", "Cancel"],
  submit: ["Enviar", "Submit"],
  submitting: ["A enviar…", "Submitting…"],
  submitted: ["Comentário enviado. Obrigado.", "Feedback submitted. Thank you."],
  adminTab: ["Comentários", "Feedback"],
  adminIntro: [
    "Relatórios de erros e sugestões enviados pelos utilizadores.",
    "Bug reports and suggestions submitted by users.",
  ],
  status: ["Estado", "Status"],
  statusAll: ["Todos os estados", "All statuses"],
  typeAll: ["Todos os tipos", "All types"],
  dateFrom: ["Desde", "From"],
  dateTo: ["Até", "To"],
  clearFilters: ["Limpar filtros", "Clear filters"],
  user: ["Utilizador", "User"],
  date: ["Data", "Date"],
  actions: ["Ações", "Actions"],
  open: ["Abrir", "Open"],
  details: ["Detalhes do comentário", "Feedback details"],
  submittedAt: ["Enviado", "Submitted"],
  updatedAt: ["Atualizado", "Updated"],
  route: ["Página de origem", "Source page"],
  version: ["Versão", "Version"],
  language: ["Idioma", "Language"],
  noRelated: ["Não indicado", "Not provided"],
  newStatus: ["Novo", "New"],
  progressStatus: ["Em tratamento", "In progress"],
  completedStatus: ["Concluído", "Completed"],
  setNew: ["Voltar a Novo", "Return to New"],
  setProgress: ["Marcar em tratamento", "Mark as in progress"],
  setCompleted: ["Marcar como concluído", "Mark as completed"],
  delete: ["Eliminar pedido", "Delete report"],
  deleteTitle: ["Eliminar pedido?", "Delete report?"],
  deleteText: [
    "Este pedido será eliminado de forma permanente.",
    "This report will be permanently deleted.",
  ],
  confirmDelete: ["Eliminar pedido", "Delete report"],
  goBack: ["Voltar", "Go back"],
  close: ["Fechar", "Close"],
  empty: [
    "Não existem comentários com estes filtros.",
    "There is no feedback matching these filters.",
  ],
  loading: ["A carregar…", "Loading…"],
  previous: ["Anterior", "Previous"],
  next: ["Seguinte", "Next"],
  results: ["resultados", "results"],
} as const;

export type FeedbackTextKey = keyof typeof feedbackCopy;
export function useFeedbackText() {
  const lang = useContext(LanguageContext);
  return (key: FeedbackTextKey) => feedbackCopy[key][lang === "en" ? 1 : 0];
}

const errors: Record<string, [string, string]> = {
  feedback_duplicate: [
    "Este comentário já foi enviado há poucos minutos.",
    "This feedback was already submitted a few minutes ago.",
  ],
  feedback_invalid: [
    "Revê o título, a descrição e os restantes campos.",
    "Check the title, description and remaining fields.",
  ],
  feedback_not_found: [
    "Este comentário já não existe.",
    "This feedback no longer exists.",
  ],
  invalid_input: [
    "Revê os campos preenchidos.",
    "Check the completed fields.",
  ],
  password_mismatch: [
    "As palavras-passe não coincidem.",
    "The passwords do not match.",
  ],
  server_busy: [
    "O servidor está ocupado. Tenta novamente dentro de momentos.",
    "The server is busy. Please try again shortly.",
  ],
  deletion_pending: [
    "Há um processamento a terminar. Tenta novamente dentro de momentos.",
    "Processing is stopping. Please try again shortly.",
  ],
  invalid_credentials: [
    "O e-mail ou a palavra-passe não estão corretos.",
    "The email or password is incorrect.",
  ],
  password_length: [
    "Usa uma palavra-passe entre 8 e 128 caracteres.",
    "Use a password between 8 and 128 characters.",
  ],
  account_exists: [
    "Já existe uma conta com este e-mail.",
    "An account with this email already exists.",
  ],
  invalid_email: [
    "Introduz um endereço de e-mail válido.",
    "Enter a valid email address.",
  ],
  rate_limited: [
    "Demasiadas tentativas. Aguarda um pouco e tenta novamente.",
    "Too many attempts. Please wait a little and try again.",
  ],
  pending_limit: [
    "Já tens várias tarefas em curso. Aguarda a conclusão de uma delas.",
    "You already have several tasks running. Wait for one to finish.",
  ],
  storage_full: [
    "O servidor não tem espaço suficiente. Tenta mais tarde ou elimina ficheiros recentes.",
    "The server has insufficient space. Try later or delete recent files.",
  ],
  too_large: [
    "Estes ficheiros ultrapassam o limite de upload.",
    "These files exceed the upload limit.",
  ],
  invalid_file: [
    "O conteúdo do ficheiro não corresponde a um formato suportado.",
    "The file content does not match a supported format.",
  ],
  unsupported_format: [
    "Este formato ainda não é suportado.",
    "This format is not supported yet.",
  ],
  conversion_failed: [
    "Não foi possível converter este ficheiro. Pode estar danificado ou utilizar uma variante não suportada.",
    "This file could not be converted. It may be damaged or use an unsupported variant.",
  ],
  pdf_password: [
    "Introduz a palavra-passe correta do PDF. A nova palavra-passe deve ter pelo menos 6 caracteres.",
    "Enter the correct PDF password. A new password needs at least 6 characters.",
  ],
  timeout: [
    "A tarefa demorou demasiado tempo e foi interrompida.",
    "This task took too long and was stopped.",
  ],
  interrupted: [
    "O processamento foi interrompido. Podes tentar novamente.",
    "Processing was interrupted. You can try again.",
  ],
  invalid_pages: [
    "Verifica os números das páginas. Exemplo: 1, 3-5, 2.",
    "Check the page numbers. Example: 1, 3-5, 2.",
  ],
  archive_limit: [
    "O arquivo ultrapassa os limites de extração segura.",
    "The archive exceeds the safe extraction limits.",
  ],
  unsafe_archive: [
    "O arquivo contém caminhos ou ligações não permitidos.",
    "The archive contains unsafe paths or links.",
  ],
  no_forms: [
    "Este PDF não tem campos de formulário interativos.",
    "This PDF has no interactive form fields.",
  ],
  no_images: [
    "Não foram encontradas imagens neste PDF.",
    "No images were found in this PDF.",
  ],
  tool_unavailable: [
    "Esta ferramenta não está disponível nesta instalação.",
    "This tool is not available on this installation.",
  ],
  not_found: [
    "O ficheiro já não está disponível. Pode ter expirado.",
    "The file is no longer available. It may have expired.",
  ],
  network_error: [
    "Não foi possível contactar o servidor.",
    "Could not reach the server.",
  ],
  smtp_unavailable: [
    "A recuperação por e-mail não está configurada.",
    "Email password recovery is not configured.",
  ],
  smtp_failed: [
    "O servidor de e-mail recusou a ligação. Verifica o servidor, a porta e as credenciais.",
    "The mail server refused the connection. Check the server, port and credentials.",
  ],
  invalid_token: [
    "A ligação de recuperação expirou ou já foi utilizada.",
    "The recovery link expired or was already used.",
  ],
  registration_closed: [
    "O registo de novas contas está fechado.",
    "New account registration is closed.",
  ],
  invalid_option: [
    "Verifica as opções escolhidas.",
    "Check the selected options.",
  ],
  too_many_pages: [
    "O documento ultrapassa o limite de páginas.",
    "The document exceeds the page limit.",
  ],
  image_too_large: [
    "A imagem tem demasiados píxeis para ser processada.",
    "The image has too many pixels to process.",
  ],
  single_file_required: [
    "Este formato aceita apenas um ficheiro de cada vez.",
    "This format accepts one file at a time.",
  ],
  too_many_files: [
    "O ficheiro contém demasiados elementos para processar de uma vez.",
    "This file contains too many items to process at once.",
  ],
  unsupported_operation: [
    "Esta ferramenta não serve para este ficheiro.",
    "Wrong tool for the job.",
  ],
  incomplete_upload: [
    "O envio ficou incompleto. Tenta novamente.",
    "The upload did not finish. Please try again.",
  ],
  invalid_state: [
    "Esta tarefa já não está nesse estado. Atualiza a página.",
    "This task is no longer in that state. Refresh the page.",
  ],
  upload_failed: [
    "Não foi possível enviar este ficheiro.",
    "This file could not be uploaded.",
  ],
  expired: [
    "O prazo deste ficheiro terminou durante o envio.",
    "This file’s retention period ended during the upload.",
  ],
  internal_error: [
    "Algo correu mal nesta instalação. Tenta novamente.",
    "Something went wrong on this installation. Please try again.",
  ],
};
export function useError() {
  const t = useText();
  return (code: string) => {
    const v = errors[code];
    return v
      ? t(...v)
      : t(
          "Não foi possível concluir a ação. Tenta novamente.",
          "This action could not be completed. Please try again.",
        );
  };
}
