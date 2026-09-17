import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Barcode,
  Calculator,
  CaseSensitive,
  Check,
  Copy,
  Download,
  KeyRound,
  QrCode,
  RefreshCw,
  Ruler,
  ScanLine,
  TextCursorInput,
} from "lucide-react";
import { useText } from "./i18n";

function randomInt(max: number) {
  const values = new Uint32Array(1);
  const bound = Math.floor(2 ** 32 / max) * max;
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= bound);
  return values[0] % max;
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext)
    await navigator.clipboard.writeText(value);
  else {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.append(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    if (!ok) throw new Error("copy");
  }
}

export default function Everyday() {
  const t = useText();
  const [tool, setTool] = useState("");
  const items = [
    {
      id: "qr",
      name: t("Criar QR Code", "Create QR code"),
      description: t(
        "Uma ligação ou texto, prontos a ler.",
        "A link or text, ready to scan.",
      ),
      icon: QrCode,
    },
    {
      id: "read",
      name: t("Ler QR Code ou código de barras", "Read QR or barcode"),
      description: t(
        "Encontra o conteúdo de um código numa imagem.",
        "Read a code from an image.",
      ),
      icon: ScanLine,
    },
    {
      id: "barcode",
      name: t("Criar código de barras", "Create barcode"),
      description: t(
        "Gera códigos CODE128, EAN e UPC.",
        "Generate CODE128, EAN and UPC codes.",
      ),
      icon: Barcode,
    },
    {
      id: "password",
      name: t("Gerar palavra-passe", "Generate password"),
      description: t(
        "Palavras-passe e frases-passe aleatórias.",
        "Random passwords and passphrases.",
      ),
      icon: KeyRound,
    },
    {
      id: "text",
      name: t("Trabalhar com texto", "Work with text"),
      description: t(
        "Conta, transforma e remove linhas repetidas.",
        "Count, transform and remove duplicate lines.",
      ),
      icon: CaseSensitive,
    },
    {
      id: "compare",
      name: t("Comparar textos", "Compare texts"),
      description: t(
        "Vê o que mudou entre duas versões.",
        "See what changed between two versions.",
      ),
      icon: TextCursorInput,
    },
    {
      id: "units",
      name: t("Converter unidades", "Convert units"),
      description: t(
        "Comprimento, peso, temperatura e volume.",
        "Length, weight, temperature and volume.",
      ),
      icon: Ruler,
    },
    {
      id: "calculate",
      name: t("Cálculos do dia a dia", "Everyday calculations"),
      description: t(
        "Percentagens, idade e datas Unix.",
        "Percentages, age and Unix dates.",
      ),
      icon: Calculator,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">
          {t(
            "PEQUENAS AJUDAS, MENOS COMPLICAÇÕES",
            "SMALL HELPERS, LESS HASSLE",
          )}
        </div>
        <h1>
          {tool
            ? items.find((i) => i.id === tool)?.name
            : t("Útil, todos os dias.", "Useful, every day.")}
        </h1>
        <p>
          {t(
            "Estas ferramentas funcionam no teu dispositivo. O conteúdo não é enviado para o servidor.",
            "These tools run on your device. Content is not sent to the server.",
          )}
        </p>
      </div>
      {tool ? (
        <>
          <button className="link back" onClick={() => setTool("")}>
            <ArrowLeft size={16} />
            {t("Todas as ferramentas", "All tools")}
          </button>
          <div className="everyday-workspace">
            {["qr", "barcode", "read"].includes(tool) ? (
              <Codes kind={tool} />
            ) : tool === "password" ? (
              <Passwords />
            ) : tool === "text" ? (
              <TextTools />
            ) : tool === "compare" ? (
              <Compare />
            ) : tool === "units" ? (
              <Units />
            ) : (
              <Calculations />
            )}
          </div>
        </>
      ) : (
        <div className="tool-grid everyday-grid">
          {items.map((item) => (
            <button
              key={item.id}
              className="tool-card"
              onClick={() => setTool(item.id)}
            >
              <div className="tool-icon neutral">
                <item.icon size={23} strokeWidth={1.6} />
              </div>
              <div className="tool-copy">
                <h3>{item.name}</h3>
                <p>{item.description}</p>
              </div>
              <ArrowRight className="tool-arrow" size={17} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function CopyButton({ value }: { value: string }) {
  const t = useText();
  const [copied, setCopied] = useState(false),
    [error, setError] = useState(false);
  return (
    <>
      <button
        className="secondary compact"
        disabled={!value}
        onClick={async () => {
          try {
            await copyText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            setError(true);
          }
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
        {copied ? t("Copiado", "Copied") : t("Copiar", "Copy")}
      </button>
      {error && (
        <small role="alert">
          {t(
            "Seleciona o texto e copia manualmente.",
            "Select the text and copy it manually.",
          )}
        </small>
      )}
    </>
  );
}

function Codes({ kind }: { kind: string }) {
  const t = useText();
  const [value, setValue] = useState(""),
    [format, setFormat] = useState("CODE128"),
    [result, setResult] = useState(""),
    [error, setError] = useState("");
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    setResult("");
    setError("");
  }, [kind]);
  async function generate() {
    setError("");
    setResult("");
    try {
      if (kind === "qr") {
        const qrcode = await import("qrcode");
        setResult(
          await qrcode.toDataURL(value, {
            width: 640,
            margin: 2,
            errorCorrectionLevel: "M",
            color: { dark: "#191b20", light: "#ffffff" },
          }),
        );
      } else {
        const { default: JsBarcode } = await import("jsbarcode");
        JsBarcode(svg.current!, value, {
          format,
          width: 2,
          height: 100,
          margin: 20,
        });
        setResult("barcode");
      }
    } catch {
      setError(
        t(
          "Verifica o conteúdo. Este formato pode exigir uma quantidade específica de algarismos.",
          "Check the content. This format may require a specific number of digits.",
        ),
      );
    }
  }
  async function read(file: File) {
    if (file.size > 20 * 1024 ** 2) {
      setError(
        t(
          "Escolhe uma imagem com menos de 20 MB.",
          "Choose an image smaller than 20 MB.",
        ),
      );
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const code = await reader.decodeFromImageUrl(url);
      setResult(code.getText());
      setError("");
    } catch {
      setError(
        t(
          "Não foi encontrado um código legível nesta imagem.",
          "No readable code was found in this image.",
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return (
    <div className="code-layout">
      <div>
        {kind === "read" ? (
          <label>
            {t(
              "Imagem com QR Code ou código de barras",
              "Image with a QR code or barcode",
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files?.[0]) void read(e.target.files[0]);
              }}
            />
          </label>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <label>
              {t("Conteúdo", "Content")}
              <textarea
                required
                rows={4}
                maxLength={kind === "qr" ? 1800 : 100}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  kind === "qr"
                    ? t("Uma ligação, uma mensagem…", "A link, a message…")
                    : "1234567890"
                }
              />
            </label>
            {kind === "barcode" && (
              <label>
                {t("Formato", "Format")}
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  {["CODE128", "EAN13", "EAN8", "UPC", "CODE39", "ITF14"].map(
                    (f) => (
                      <option key={f}>{f}</option>
                    ),
                  )}
                </select>
              </label>
            )}
            <button className="primary">
              {t("Gerar código", "Generate code")}
              <ArrowRight size={16} />
            </button>
          </form>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="code-result" aria-live="polite">
        {kind === "qr" && result ? (
          <>
            <img src={result} alt={t("QR Code gerado", "Generated QR code")} />
            <a className="secondary" href={result} download="qr-code.png">
              <Download size={16} />
              {t("Descarregar PNG", "Download PNG")}
            </a>
          </>
        ) : kind === "barcode" ? (
          <>
            <svg
              ref={svg}
              role="img"
              aria-label={t("Código de barras", "Barcode")}
            />
            {result && (
              <button
                className="secondary"
                onClick={() =>
                  saveBlob(
                    new Blob(
                      [new XMLSerializer().serializeToString(svg.current!)],
                      { type: "image/svg+xml" },
                    ),
                    "barcode.svg",
                  )
                }
              >
                <Download size={16} />
                {t("Descarregar SVG", "Download SVG")}
              </button>
            )}
          </>
        ) : kind === "read" && result ? (
          <>
            <textarea
              readOnly
              value={result}
              aria-label={t("Conteúdo do código", "Code content")}
            />
            <CopyButton value={result} />
          </>
        ) : (
          <>
            <QrCode size={64} strokeWidth={1} />
            <p>{t("O resultado aparece aqui.", "Your result appears here.")}</p>
          </>
        )}
      </div>
    </div>
  );
}

function Passwords() {
  const t = useText();
  const [kind, setKind] = useState("password"),
    [length, setLength] = useState(20),
    [words, setWords] = useState(6),
    [symbols, setSymbols] = useState(true),
    [result, setResult] = useState("");
  async function generate() {
    if (kind === "phrase") {
      const { wordlist } = await import("@scure/bip39/wordlists/english.js");
      setResult(
        Array.from(
          { length: Math.max(4, Math.min(12, words)) },
          () => wordlist[randomInt(wordlist.length)],
        ).join("-"),
      );
    } else {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
        (symbols ? "!@#$%&*+-=?" : "");
      setResult(
        Array.from(
          { length: Math.max(10, Math.min(128, length)) },
          () => chars[randomInt(chars.length)],
        ).join(""),
      );
    }
  }
  return (
    <>
      <div className="filter-tabs">
        <button
          className={kind === "password" ? "selected" : ""}
          onClick={() => {
            setKind("password");
            setResult("");
          }}
        >
          {t("Palavra-passe", "Password")}
        </button>
        <button
          className={kind === "phrase" ? "selected" : ""}
          onClick={() => {
            setKind("phrase");
            setResult("");
          }}
        >
          {t("Frase-passe", "Passphrase")}
        </button>
      </div>
      <div className="form-grid">
        {kind === "password" ? (
          <>
            <label>
              {t("Número de caracteres", "Number of characters")}
              <input
                type="number"
                min={10}
                max={128}
                value={length}
                onChange={(e) => setLength(+e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={symbols}
                onChange={(e) => setSymbols(e.target.checked)}
              />
              {t("Incluir símbolos", "Include symbols")}
            </label>
          </>
        ) : (
          <>
            <label>
              {t("Número de palavras", "Number of words")}
              <input
                type="number"
                min={4}
                max={12}
                value={words}
                onChange={(e) => setWords(+e.target.value)}
              />
            </label>
            <p className="muted">
              {t(
                "Palavras inglesas de uma lista local de 2048 palavras. Seis palavras aleatórias dão 66 bits de entropia.",
                "English words from a local list of 2048 words. Six random words provide 66 bits of entropy.",
              )}
            </p>
          </>
        )}
      </div>
      <button className="primary" onClick={generate}>
        <RefreshCw size={17} />
        {t("Gerar", "Generate")}
      </button>
      {result && (
        <div className="generated-secret">
          <output>{result}</output>
          <CopyButton value={result} />
        </div>
      )}
      <p className="notice">
        {t(
          "Gerado com aleatoriedade criptográfica do dispositivo. Não é guardado nem enviado.",
          "Generated with your device’s cryptographic randomness. Never saved or sent.",
        )}
      </p>
    </>
  );
}

function TextTools() {
  const t = useText();
  const [value, setValue] = useState("");
  return (
    <>
      <label>
        {t("O teu texto", "Your text")}
        <textarea
          rows={12}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t(
            "Escreve ou cola o texto aqui…",
            "Write or paste text here…",
          )}
        />
      </label>
      <div className="text-counts">
        <span>
          <strong>
            {value.trim() ? value.trim().split(/\s+/u).length : 0}
          </strong>{" "}
          {t("palavras", "words")}
        </span>
        <span>
          <strong>{[...value].length}</strong> {t("caracteres", "characters")}
        </span>
        <span>
          <strong>{[...value.replace(/\s/gu, "")].length}</strong>{" "}
          {t("sem espaços", "without spaces")}
        </span>
        <span>
          <strong>{value ? value.split("\n").length : 0}</strong>{" "}
          {t("linhas", "lines")}
        </span>
      </div>
      <div className="actions wrap">
        <button
          className="secondary"
          onClick={() => setValue(value.toLocaleUpperCase())}
        >
          {t("MAIÚSCULAS", "UPPERCASE")}
        </button>
        <button
          className="secondary"
          onClick={() => setValue(value.toLocaleLowerCase())}
        >
          {t("minúsculas", "lowercase")}
        </button>
        <button
          className="secondary"
          onClick={() =>
            setValue(
              value
                .toLocaleLowerCase()
                .replace(
                  /(^|\s)(\p{L})/gu,
                  (_, s, l) => s + l.toLocaleUpperCase(),
                ),
            )
          }
        >
          {t("Iniciais Maiúsculas", "Title Case")}
        </button>
        <button
          className="secondary"
          onClick={() => setValue([...new Set(value.split("\n"))].join("\n"))}
        >
          {t("Remover linhas repetidas", "Remove duplicate lines")}
        </button>
        <CopyButton value={value} />
        <button className="link" onClick={() => setValue("")}>
          {t("Limpar", "Clear")}
        </button>
      </div>
    </>
  );
}

function Compare() {
  const t = useText();
  const [a, setA] = useState(""),
    [b, setB] = useState(""),
    [parts, setParts] = useState<
      { value: string; added?: boolean; removed?: boolean }[]
    >([]);
  return (
    <>
      <div className="form-grid">
        <label>
          {t("Texto original", "Original text")}
          <textarea
            rows={9}
            maxLength={30000}
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
        </label>
        <label>
          {t("Novo texto", "New text")}
          <textarea
            rows={9}
            maxLength={30000}
            value={b}
            onChange={(e) => setB(e.target.value)}
          />
        </label>
      </div>
      <button
        className="primary"
        onClick={async () => {
          const { diffWords } = await import("diff");
          setParts(diffWords(a, b));
        }}
      >
        {t("Comparar", "Compare")}
      </button>
      <div className="diff-result" aria-live="polite">
        {parts.map((p, i) =>
          p.added ? (
            <ins key={i}>{p.value}</ins>
          ) : p.removed ? (
            <del key={i}>{p.value}</del>
          ) : (
            <span key={i}>{p.value}</span>
          ),
        )}
      </div>
    </>
  );
}

const unitSets: Record<string, Record<string, number>> = {
  length: {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    km: 1000,
    in: 0.0254,
    ft: 0.3048,
    yd: 0.9144,
    mi: 1609.344,
  },
  mass: {
    mg: 0.000001,
    g: 0.001,
    kg: 1,
    t: 1000,
    oz: 0.028349523125,
    lb: 0.45359237,
  },
  volume: {
    mL: 0.001,
    cL: 0.01,
    L: 1,
    "m³": 1000,
    "US gal": 3.785411784,
    "US cup": 0.2365882365,
  },
  temperature: { "°C": 1, "°F": 1, K: 1 },
};
function Units() {
  const t = useText();
  const [kind, setKind] = useState("length"),
    [from, setFrom] = useState("m"),
    [to, setTo] = useState("ft"),
    [value, setValue] = useState("1");
  let result = (Number(value) * unitSets[kind][from]) / unitSets[kind][to];
  if (kind === "temperature") {
    const c =
      from === "°F"
        ? ((Number(value) - 32) * 5) / 9
        : from === "K"
          ? Number(value) - 273.15
          : Number(value);
    result = to === "°F" ? (c * 9) / 5 + 32 : to === "K" ? c + 273.15 : c;
  }
  return (
    <>
      <label>
        {t("Tipo de unidade", "Unit type")}
        <select
          value={kind}
          onChange={(e) => {
            const next = e.target.value;
            setKind(next);
            const keys = Object.keys(unitSets[next]);
            setFrom(keys[0]);
            setTo(keys[1]);
          }}
        >
          {["length", "mass", "volume", "temperature"].map((k, i) => (
            <option key={k} value={k}>
              {
                [
                  t("Comprimento", "Length"),
                  t("Peso", "Weight"),
                  t("Volume", "Volume"),
                  t("Temperatura", "Temperature"),
                ][i]
              }
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          {t("Valor", "Value")}
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label>
          {t("De", "From")}
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {Object.keys(unitSets[kind]).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Para", "To")}
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {Object.keys(unitSets[kind]).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="calculation-result">
        <output>
          {value !== "" && Number.isFinite(result)
            ? `${Number(result.toPrecision(10))} ${to}`
            : ":"}
        </output>
      </div>
    </>
  );
}

function Calculations() {
  const t = useText();
  const [kind, setKind] = useState("percent"),
    [a, setA] = useState("15"),
    [b, setB] = useState("100"),
    [date, setDate] = useState(""),
    [timestamp, setTimestamp] = useState(""),
    [direction, setDirection] = useState("from");
  let result = "";
  if (kind === "percent")
    result =
      a !== "" && b !== ""
        ? `${Number(((Number(a) / 100) * Number(b)).toPrecision(12))}`
        : ":";
  if (kind === "age" && date) {
    const birth = new Date(date + "T12:00:00");
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    if (
      now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
    )
      years--;
    result =
      birth > now
        ? t("Escolhe uma data no passado.", "Choose a date in the past.")
        : `${years} ${t("anos", "years")}`;
  }
  if (kind === "unix" && direction === "from" && timestamp) {
    const d = new Date(Number(timestamp) * 1000);
    result = Number.isNaN(d.getTime())
      ? t("Data inválida", "Invalid date")
      : `${d.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})\n${d.toISOString()} UTC`;
  }
  if (kind === "unix" && direction === "to" && date) {
    const d = new Date(date);
    result = Number.isNaN(d.getTime())
      ? t("Data inválida", "Invalid date")
      : String(Math.floor(d.getTime() / 1000));
  }
  return (
    <>
      <div className="filter-tabs">
        {["percent", "age", "unix"].map((k, i) => (
          <button
            key={k}
            className={kind === k ? "selected" : ""}
            onClick={() => {
              setKind(k);
              setDate("");
            }}
          >
            {
              [
                t("Percentagem", "Percentage"),
                t("Idade", "Age"),
                t("Data Unix", "Unix timestamp"),
              ][i]
            }
          </button>
        ))}
      </div>
      {kind === "percent" ? (
        <div className="form-grid">
          <label>
            {t("Percentagem (%)", "Percentage (%)")}
            <input
              type="number"
              value={a}
              onChange={(e) => setA(e.target.value)}
            />
          </label>
          <label>
            {t("De um valor", "Of a value")}
            <input
              type="number"
              value={b}
              onChange={(e) => setB(e.target.value)}
            />
          </label>
        </div>
      ) : kind === "age" ? (
        <label>
          {t("Data de nascimento", "Date of birth")}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      ) : (
        <>
          <label>
            {t("Conversão", "Conversion")}
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="from">Unix → {t("Data", "Date")}</option>
              <option value="to">{t("Data", "Date")} → Unix</option>
            </select>
          </label>
          {direction === "from" ? (
            <label>
              {t("Unix timestamp (segundos)", "Unix timestamp (seconds)")}
              <input
                type="number"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
              />
            </label>
          ) : (
            <label>
              {t("Data e hora local", "Local date and time")}
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          )}
          <button
            className="link"
            onClick={() => setTimestamp(String(Math.floor(Date.now() / 1000)))}
          >
            {t("Usar a hora atual", "Use current time")}
          </button>
        </>
      )}
      <div className="calculation-result">
        <output>{result || ":"}</output>
        {result && <CopyButton value={result} />}
      </div>
    </>
  );
}
