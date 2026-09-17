import os
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path

from .db import connect, settings

PROVIDERS = {
    "gmail": {"label": "Gmail", "host": "smtp.gmail.com", "port": 587, "security": "starttls",
              "hint": {"pt-PT": "Ativa a verificação em dois passos e cria uma palavra-passe de aplicação em myaccount.google.com/apppasswords. A palavra-passe normal da conta não funciona.",
                       "en": "Turn on two-step verification and create an app password at myaccount.google.com/apppasswords. Your normal account password will not work."}},
    "outlook": {"label": "Outlook e Microsoft 365", "host": "smtp.office365.com", "port": 587, "security": "starttls",
                "hint": {"pt-PT": "Usa o endereço completo da conta. Contas com autenticação moderna obrigatória podem exigir uma palavra-passe de aplicação.",
                         "en": "Use the full account address. Accounts that require modern authentication may need an app password."}},
    "icloud": {"label": "iCloud Mail", "host": "smtp.mail.me.com", "port": 587, "security": "starttls",
               "hint": {"pt-PT": "Cria uma palavra-passe específica da aplicação em account.apple.com.",
                        "en": "Create an app-specific password at account.apple.com."}},
    "yahoo": {"label": "Yahoo Mail", "host": "smtp.mail.yahoo.com", "port": 587, "security": "starttls",
              "hint": {"pt-PT": "Cria uma palavra-passe de aplicação nas definições de segurança da conta.",
                       "en": "Create an app password in your account security settings."}},
    "sapo": {"label": "SAPO", "host": "smtp.sapo.pt", "port": 587, "security": "starttls", "hint": {"pt-PT": "", "en": ""}},
    "custom": {"label": "Outro servidor", "host": "", "port": 587, "security": "starttls", "hint": {"pt-PT": "", "en": ""}},
}

FIELDS = ("smtp_provider", "smtp_host", "smtp_port", "smtp_security", "smtp_user", "smtp_from", "smtp_public_url")


def configuration(db=None):
    prefs = settings(db)
    values = {key: prefs.get(key, "") for key in FIELDS}
    values["smtp_port"] = int(values["smtp_port"] or 587)
    values["password_set"] = bool(prefs.get("smtp_password"))
    return values


def available(db=None):
    """A server and a sender are all that sending needs; the address of the
    installation only shapes the recovery link and falls back to the request."""
    values = configuration(db)
    return bool(values["smtp_host"] and values["smtp_from"])


def deliver(host, port, security, user, password, message):
    context = ssl.create_default_context()
    if security == "ssl":
        with smtplib.SMTP_SSL(host, port, timeout=20, context=context) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(message)
        return
    with smtplib.SMTP(host, port, timeout=20) as smtp:
        if security == "starttls":
            smtp.starttls(context=context)
        if user:
            smtp.login(user, password)
        smtp.send_message(message)


def build(name, address, link, language, installation):
    pt = language != "en"
    message = EmailMessage()
    message["Subject"] = f"{installation}: " + ("recuperar o acesso" if pt else "recover your access")
    message["To"] = address
    greeting = f"Olá {name}," if pt and name else "Olá," if pt else f"Hi {name}," if name else "Hi,"
    lines = ([
        "Recebemos um pedido para definir uma nova palavra-passe na tua conta.",
        "A ligação abaixo é válida durante 30 minutos e só pode ser usada uma vez.",
        "Se não foste tu, ignora esta mensagem. A palavra-passe atual continua válida.",
    ] if pt else [
        "We received a request to set a new password for your account.",
        "The link below works for 30 minutes and can only be used once.",
        "If this was not you, ignore this message. Your current password stays valid.",
    ])
    action = "Definir nova palavra-passe" if pt else "Set a new password"
    fallback = ("Se o botão não funcionar, copia este endereço para o navegador:"
                if pt else "If the button does not work, copy this address into your browser:")
    signature = f"{installation}"
    message.set_content("\n\n".join([greeting, *lines, f"{action}: {link}", signature]))

    logo = make_msgid()[1:-1]
    message.add_alternative(f"""<!doctype html>
<html lang="{'pt' if pt else 'en'}"><body style="margin:0;padding:24px;background:#f4f4f5;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#26272b">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;
background:#ffffff;border:1px solid #e6e6e9;border-radius:10px">
<tr><td style="padding:28px 32px 0">
<img src="cid:{logo}" width="44" height="44" alt="{installation}" style="display:block;border:0">
</td></tr>
<tr><td style="padding:20px 32px 0">
<h1 style="margin:0 0 16px;font-size:19px;font-weight:600;letter-spacing:-0.3px">{action}</h1>
<p style="margin:0 0 12px;font-size:14px;line-height:1.65">{greeting}</p>
{"".join(f'<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#4b4a50">{line}</p>' for line in lines)}
</td></tr>
<tr><td style="padding:12px 32px 4px">
<a href="{link}" style="display:inline-block;background:#962a3b;color:#ffffff;text-decoration:none;
font-size:14px;font-weight:600;padding:13px 22px;border-radius:6px">{action}</a>
</td></tr>
<tr><td style="padding:18px 32px 28px">
<p style="margin:0 0 6px;font-size:12px;color:#73767d">{fallback}</p>
<p style="margin:0;font-size:12px;word-break:break-all"><a href="{link}" style="color:#962a3b">{link}</a></p>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #efeff1">
<p style="margin:0;font-size:11px;color:#8a8a91">{signature}</p>
</td></tr>
</table></body></html>""", subtype="html")

    icon = Path(os.getenv("WEB_DIR", "web/dist")) / "logo.png"
    if icon.is_file():
        message.get_payload()[1].add_related(icon.read_bytes(), "image", "png", cid=f"<{logo}>")
    return message


def send_recovery(name, address, link, language, installation):
    with connect() as db:
        prefs = settings(db)
    if not (prefs.get("smtp_host") and prefs.get("smtp_from")):
        return
    message = build(name, address, link, language, installation)
    message["From"] = formataddr((installation, prefs["smtp_from"]))
    args = (prefs["smtp_host"], int(prefs.get("smtp_port") or 587), prefs.get("smtp_security") or "starttls",
            prefs.get("smtp_user") or "", prefs.get("smtp_password") or "", message)
    threading.Thread(target=attempt, args=args, daemon=True).start()


def attempt(host, port, security, user, password, message):
    try:
        deliver(host, port, security, user, password, message)
    except Exception:
        print("recovery message not delivered", flush=True)
