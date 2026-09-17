import unicodedata


def safe_name(value):
    value = unicodedata.normalize("NFC", value.replace("\\", "/").split("/")[-1])
    value = "".join(c for c in value if unicodedata.category(c)[0] != "C" and c not in '<>:"|?*')
    return value.strip(" .")[:180] or "file"
