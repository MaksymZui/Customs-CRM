#!/usr/bin/env python3
"""
Універсальний імпорт митних декларацій з XLSX / XLSB у PostgreSQL.

Основні принципи:
  * тип колонки в БД визначає, як значення приводиться (NUM / DATE / TEXT);
  * якщо значення не приводиться до потрібного типу — пишемо NULL, а не падаємо;
  * зсув колонок визначається за заголовком (кілька якорів + голосування);
  * порожні рядки пропускаються;
  * якщо COPY впав на батчі — батч перезаливається построчно, биті рядки скіпаються.
"""

import sys
import os
import io
import re
import math
import urllib.parse
from datetime import datetime, date, time, timezone

try:
    import psycopg2
    from python_calamine import CalamineWorkbook
except ImportError as e:
    print(f"Missing dependency: {e}")
    sys.exit(1)


if len(sys.argv) < 3:
    print("Usage: import_xlsb.py <file_path> <job_id>")
    sys.exit(1)

FILE_PATH = sys.argv[1]
JOB_ID = sys.argv[2]


# ============================================================
# DATABASE
# ============================================================

RAW_DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://customs_admin:customs_pass_2026@localhost:5432/customs_crm?connect_timeout=30",
)

_parsed = urllib.parse.urlparse(RAW_DB_URL)
_params = urllib.parse.parse_qs(_parsed.query)
for _p in ("connection_limit", "pool_timeout", "schema", "pgbouncer"):
    _params.pop(_p, None)

DATABASE_URL = urllib.parse.urlunparse(
    _parsed._replace(query=urllib.parse.urlencode(_params, doseq=True))
)


# ============================================================
# SETTINGS
# ============================================================

BATCH_SIZE = 5000
EXCEL_EPOCH = date(1899, 12, 30)

# Скільки помилкових рядків дозволяємо, перш ніж зупинити імпорт
MAX_BAD_ROWS = 5000


# ============================================================
# COLUMN SCHEMA
# ============================================================
# ("ім'я в БД", тип)
#   TEXT — будь-що приводиться до рядка
#   NUM  — Float? у Prisma, пишемо число або NULL
#   DATE — Float? з Excel serial number

TEXT, NUM, DATE = "TEXT", "NUM", "DATE"

SCHEMA = [
    ("decl_type_1",            TEXT),
    ("decl_type_2",            TEXT),
    ("decl_type_3",            TEXT),
    ("decl_type_4",            TEXT),

    ("decl_num_prefix",        TEXT),
    ("decl_num_year",          NUM),
    ("decl_num_number",        NUM),

    ("declaration_date",       DATE),

    ("customs_office",         TEXT),
    ("customs_post",           TEXT),

    ("trade_country",          TEXT),
    ("dispatch_country",       TEXT),
    ("origin_country",         TEXT),

    ("container_presence",     TEXT),
    ("container_number",       TEXT),

    ("delivery_condition",     TEXT),
    ("delivery_place",         TEXT),

    ("currency_code",          NUM),
    ("currency_name",          TEXT),

    ("border_transport_code",  TEXT),
    ("border_transport_name",  TEXT),
    ("border_transport_num",   TEXT),

    ("inland_transport_code",  TEXT),
    ("inland_transport_name",  TEXT),

    ("border_transport_code2", TEXT),

    ("border_customs_code",    TEXT),
    ("border_customs_name",    TEXT),
    ("border_customs_post",    TEXT),

    ("item_number",            NUM),
    ("product_code",           TEXT),
    ("product_name",           TEXT),

    ("recipient_code",         NUM),
    ("recipient_name",         TEXT),

    ("reverse_side",           TEXT),
    ("field_35",               TEXT),
    ("field_36",               TEXT),

    ("sender_name",            TEXT),

    ("contract_holder_1",      TEXT),
    ("contract_holder_2",      TEXT),

    ("valuation_method",       NUM),

    ("add_unit_qty",           NUM),
    ("add_unit_name",          TEXT),

    ("weight_gross",           NUM),
    ("weight_net",             NUM),

    ("invoice_value_uah",      NUM),
    ("invoice_value_usd",      NUM),

    ("exchange_rate",          NUM),

    ("customs_value_uah",      NUM),
    ("customs_value_usd",      NUM),

    ("customs_value_per_kg",   NUM),

    ("duty_uah",               NUM),
    ("excise_uah",             NUM),
    ("vat_uah",                NUM),
]

COLUMNS = [name for name, _ in SCHEMA]
TYPES = [kind for _, kind in SCHEMA]
N_COLS = len(SCHEMA)                       # 53

PRODUCT_NAME_IDX = COLUMNS.index("product_name")   # 30


# ============================================================
# NORMALIZE / COERCE
# ============================================================

_WS_RE = re.compile(r"\s+")
_NUM_CLEAN_RE = re.compile(r"[^\d\-\+\.,eE]")


def _to_str(val):
    """Будь-яке значення -> очищений рядок або None."""
    if val is None:
        return None

    if isinstance(val, bool):
        return "1" if val else "0"

    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        if val.is_integer():
            return str(int(val))
        return repr(val)

    if isinstance(val, int):
        return str(val)

    if isinstance(val, datetime):
        return val.date().isoformat()

    if isinstance(val, date):
        return val.isoformat()

    if isinstance(val, time):
        return val.isoformat()

    s = str(val).replace("\xa0", " ").replace("\x00", "")
    s = _WS_RE.sub(" ", s).strip()

    if not s or s in ("-", "—", "–", "#N/A", "N/A", "NULL", "null", "nan", "NaN"):
        return None

    return s


def to_number(val):
    """Будь-яке значення -> float або None. Ніколи не кидає виняток."""
    if val is None:
        return None

    if isinstance(val, bool):
        return 1.0 if val else 0.0

    if isinstance(val, (int, float)):
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f

    # дата, що потрапила в числову колонку -> Excel serial
    if isinstance(val, datetime):
        return float((val.date() - EXCEL_EPOCH).days)
    if isinstance(val, date):
        return float((val - EXCEL_EPOCH).days)

    s = _to_str(val)
    if s is None:
        return None

    # дата-рядок у числовій колонці
    d = _parse_date_string(s)
    if d is not None:
        return float((d - EXCEL_EPOCH).days)

    # "1 234,56" / "1 234.56" / "12 345" / "(123)" -> число
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]

    s = s.replace(" ", "").replace("\u202f", "")
    s = _NUM_CLEAN_RE.sub("", s)

    if not s:
        return None

    # визначаємо десятковий роздільник
    if "," in s and "." in s:
        # той, що правіше — десятковий
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # кома як десятковий роздільник, якщо після неї 1-6 цифр і одна кома
        if s.count(",") == 1 and len(s.split(",")[1]) <= 6:
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")

    # прибираємо зайві мінуси/плюси всередині
    sign = -1.0 if s.startswith("-") else 1.0
    s = s.lstrip("+-")

    if s.count(".") > 1:
        head, _, tail = s.partition(".")
        s = head + "." + tail.replace(".", "")

    if not s or s == ".":
        return None

    try:
        f = float(s) * sign
    except ValueError:
        return None

    if math.isnan(f) or math.isinf(f):
        return None
    if neg:
        f = -abs(f)

    return f


_DATE_PATTERNS = (
    "%Y-%m-%d",
    "%d.%m.%Y",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%d-%m-%Y",
    "%Y.%m.%d",
    "%d.%m.%y",
)


def _parse_date_string(s):
    """Рядок -> date або None."""
    if not s:
        return None

    core = s.split("T")[0].split(" ")[0].strip()
    if len(core) < 6 or len(core) > 10:
        return None
    if not re.match(r"^\d", core):
        return None

    for fmt in _DATE_PATTERNS:
        try:
            return datetime.strptime(core, fmt).date()
        except ValueError:
            continue
    return None


def to_excel_serial(val):
    """Будь-яке значення -> Excel serial number (float) або None."""
    if val is None:
        return None

    if isinstance(val, datetime):
        return float((val.date() - EXCEL_EPOCH).days)

    if isinstance(val, date):
        return float((val - EXCEL_EPOCH).days)

    if isinstance(val, bool):
        return None

    if isinstance(val, (int, float)):
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        # правдоподібний діапазон Excel serial: 1900-01-01 .. 2100-01-01
        if 1 <= f <= 73415:
            return f
        return None

    s = _to_str(val)
    if s is None:
        return None

    d = _parse_date_string(s)
    if d is not None:
        return float((d - EXCEL_EPOCH).days)

    # рядок із числом-серіалом
    n = to_number(s)
    if n is not None and 1 <= n <= 73415:
        return n

    return None


def coerce(val, kind):
    if kind == NUM:
        return to_number(val)
    if kind == DATE:
        return to_excel_serial(val)
    return _to_str(val)


# ============================================================
# HEADER DETECTION
# ============================================================
# Якорі: (індекс у SCHEMA, список ключових слів, які мають бути в заголовку)

HEADER_ANCHORS = [
    (0,  ["тип", "декл"]),
    (4,  ["номер", "декл"]),
    (7,  ["дата"]),
    (8,  ["митниц"]),
    (8,  ["таможн"]),
    (29, ["код", "товар"]),
    (30, ["опис", "товар"]),
    (30, ["описание", "товар"]),
    (32, ["одержувач"]),
    (32, ["получател"]),
    (36, ["відправник"]),
    (36, ["отправител"]),
    (43, ["вага", "нетто"]),
    (43, ["вес", "нетто"]),
]


def looks_like_header(row):
    """Чи схожий рядок на заголовок (переважно текст, є ключові слова)."""
    if not row:
        return False

    joined = " ".join(
        str(c).lower() for c in row if c is not None
    )

    hits = sum(
        1
        for kw in ("декл", "товар", "митниц", "таможн", "вага", "вес", "країна", "страна")
        if kw in joined
    )
    return hits >= 2


def detect_offset(header_row):
    """
    Повертає offset: наскільки колонки у файлі зсунуті вправо
    відносно SCHEMA. target_idx = file_idx - offset.
    """
    if not header_row:
        return 0

    cells = [
        (_WS_RE.sub(" ", str(c)).strip().lower() if c is not None else "")
        for c in header_row
    ]

    votes = {}

    for expected_idx, keywords in HEADER_ANCHORS:
        for file_idx, cell in enumerate(cells):
            if not cell:
                continue
            if all(kw in cell for kw in keywords):
                offset = file_idx - expected_idx
                votes[offset] = votes.get(offset, 0) + 1
                break

    if not votes:
        return 0

    best_offset, best_votes = max(votes.items(), key=lambda kv: (kv[1], -abs(kv[0])))

    # не довіряємо дикому зсуву з одним голосом
    if best_votes < 2 and abs(best_offset) > 3:
        return 0

    return best_offset


def find_header_row(rows, limit=10):
    """Повертає (індекс рядка заголовка, offset). Якщо заголовка немає — (-1, 0)."""
    for i, row in enumerate(rows[:limit]):
        if looks_like_header(row):
            return i, detect_offset(row)
    return -1, 0


# ============================================================
# PRODUCT PARSER
# ============================================================

def parse_product(text):
    if not text:
        return None, None, None

    text = str(text).replace("\xa0", " ")
    text = _WS_RE.sub(" ", text).strip()

    if not text:
        return None, None, None

    # ---------- QUANTITY ----------
    qty = None
    qty_match = re.search(
        r"\b(\d+(?:[\.,]\d+)?)\s*(?:ШТ|PCS|КОМПЛ|ШТУК|SET|шт\.?)\b",
        text,
        re.IGNORECASE,
    )
    if qty_match:
        try:
            qty = float(qty_match.group(1).replace(",", "."))
        except ValueError:
            qty = None

    # ---------- BRAND ----------
    brand = None
    brand_match = re.search(
        r"(?:ТОРГОВЕЛЬН?А?\s+МАРКА|"
        r"ТОРГОВЕЛЬНОЇ\s+МАРКИ|"
        r"ТОРГОВАЯ МАРКА|"
        r"\bТМ\b|\bBRAND\b|\bTRADEMARK\b)\s*[:\-\s=]+"
        r'["«\']?'
        r"([A-ZА-ЯІЇЄҐ0-9\s&\-\.]{2,50}?)"
        r'["»\']?'
        r"(?=\s*(?:[,;\n]|"
        r"\b(?:КРАЇНА|КРАИНА|COUNTRY|ВИРОБНИК|ПРОИЗВОДИТЕЛЬ|PRODUCER|"
        r"МОДЕЛЬ|MODEL|АРТ|ART|КІЛЬКІСТЬ|НЕ\s+МІСТИТЬ|КОД)\b|$))",
        text,
        re.IGNORECASE,
    )
    if brand_match:
        brand = brand_match.group(1).strip(' "\'«»:-.')

    if not brand:
        mfg_match = re.search(
            r"(?:ВИРОБНИК|ПРОИЗВОДИТЕЛЬ|MANUFACTURER|PRODUCER)\s*[:\-\s=]+"
            r'["«\']?'
            r"([A-ZА-ЯІЇЄҐ0-9\s&\-\.]{2,50}?)"
            r'["»\']?'
            r"(?=\s*(?:[,;\n]|"
            r"\b(?:КРАЇНА|КРАИНА|COUNTRY|ТОРГОВЕЛЬНА|BRAND|МОДЕЛЬ|MODEL|"
            r"АРТ|ART|КІЛЬКІСТЬ|НЕ\s+МІСТИТЬ|КОД)\b|$))",
            text,
            re.IGNORECASE,
        )
        if mfg_match:
            brand = mfg_match.group(1).strip(' "\'«»:-.')

    if brand:
        brand = _WS_RE.sub(" ", brand).strip()[:100]
        if brand.upper() in ("НЕМАЄ", "NO", "WITHOUT", "NONE", "UA", "CN"):
            brand = None

    # ---------- MODEL ----------
    text_upper = text.upper()

    stopwords = {
        "CAMERA", "КАМЕРА", "КАМЕРИ", "FPV", "DRONE", "QUADCOPTER",
        "ART", "АРТ", "АРТИКУЛ", "MODEL", "МОДЕЛЬ", "ITEM", "NO",
        "PCS", "SET", "ШТ", "КОМПЛ", "КІЛЬКІСТЬ", "ШТУК",
        "BRAND", "TRADEMARK", "ТМ", "МАРКА", "ТОРГОВЕЛЬНА", "ТОРГОВАЯ",
        "CN", "UA", "MADE", "IN", "ВИРОБНИК", "ПРОИЗВОДИТЕЛЬ",
        "КРАЇНА", "КРАИНА", "ВИРОБНИЦТВА", "КОД",
        "ММ", "МКМ", "ГЦ", "РХ", "PX", "HZ", "MM",
    }

    if brand:
        stopwords.update(brand.upper().split())

    text_clean = re.sub(r"[А-ЯІЇЄҐ]+", "|", text_upper)

    if qty is not None:
        qty_str = str(int(qty)) if float(qty).is_integer() else str(qty)
        text_clean = re.sub(rf"\b{re.escape(qty_str)}\b", "|", text_clean)

    for word in stopwords:
        text_clean = re.sub(rf"\b{re.escape(word)}\b", "|", text_clean)

    valid_models = []

    for candidate in text_clean.split("|"):
        candidate = _WS_RE.sub(" ", candidate.strip(" -./_")).strip()

        if len(candidate) < 2:
            continue
        if re.fullmatch(r"[\d\s\.,\-]+", candidate):
            continue
        if re.search(r"\d+\s*[XХ]\s*\d+", candidate):
            continue
        if re.match(r"^F\s*[\d\.,]+$", candidate):
            continue
        if re.search(r"[A-Z0-9]", candidate) and candidate not in valid_models:
            valid_models.append(candidate)

    art_match = re.search(
        r"(?:АРТИКУЛ|АРТ\.?|ART\.?|МОДЕЛЬ|MODEL)\s*[:\-\s#№]+"
        r'["«\']?([A-Z0-9\-\./_]{2,30})',
        text,
        re.IGNORECASE,
    )
    if art_match:
        explicit = art_match.group(1).strip(' "\'«»:-.')
        if (
            explicit
            and explicit not in valid_models
            and not re.fullmatch(r"[\d\s\.,\-]+", explicit)
        ):
            valid_models.append(explicit)

    model = ", ".join(valid_models) if valid_models else None
    if model:
        model = model[:150]

    return brand, model, qty


# ============================================================
# IMPORT JOB
# ============================================================

def update_job(conn, status=None, processed=None, total=None, error=None):
    parts, args = [], []

    if status:
        parts.append("status = %s")
        args.append(status)

    if processed is not None:
        parts.append("processed = %s")
        args.append(processed)

    if total is not None:
        parts.append("total_rows = %s")
        args.append(total)

    if error:
        parts.append("error = %s")
        args.append(str(error)[:500])

    if status in ("done", "error"):
        parts.append("finished_at = %s")
        args.append(datetime.now(timezone.utc))

    if not parts:
        return

    args.append(JOB_ID)

    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE import_jobs SET {', '.join(parts)} WHERE id = %s",
            args,
        )
    conn.commit()


# ============================================================
# INSERT
# ============================================================

ALL_COLS = COLUMNS + ["brand", "model", "qty_parsed", "import_id"]
COLS_SQL = ", ".join(ALL_COLS)

COPY_SQL = f"""
COPY declarations ({COLS_SQL})
FROM STDIN
WITH (FORMAT text, DELIMITER E'\\t', NULL '')
"""

INSERT_SQL = f"""
INSERT INTO declarations ({COLS_SQL})
VALUES ({", ".join(["%s"] * len(ALL_COLS))})
"""


def _cell_to_copy(value):
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return ""
        if value.is_integer():
            return str(int(value))
        return repr(value)
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("\t", " ")
        .replace("\n", " ")
        .replace("\r", "")
    )


def insert_batch(conn, batch):
    """Швидкий COPY. Якщо впав — построчний INSERT зі скіпом битих рядків.
    Повертає (вставлено, пропущено)."""
    buf = io.StringIO()
    for row in batch:
        buf.write("\t".join(_cell_to_copy(v) for v in row) + "\n")
    buf.seek(0)

    try:
        with conn.cursor() as cur:
            cur.copy_expert(COPY_SQL, buf)
        conn.commit()
        return len(batch), 0
    except Exception as e:
        conn.rollback()
        print(f"  COPY failed ({e}); fallback to row-by-row", flush=True)

    inserted = skipped = 0
    with conn.cursor() as cur:
        for row in batch:
            try:
                cur.execute(INSERT_SQL, row)
                inserted += 1
            except Exception:
                conn.rollback()
                skipped += 1
                continue
    conn.commit()
    return inserted, skipped


# ============================================================
# MAIN
# ============================================================

def pick_sheet(workbook):
    """Обираємо аркуш із найбільшою кількістю рядків."""
    best_name, best_rows, best_count = workbook.sheet_names[0], None, -1

    for name in workbook.sheet_names:
        try:
            rows = workbook.get_sheet_by_name(name).to_python()
        except Exception:
            continue
        if len(rows) > best_count:
            best_name, best_rows, best_count = name, rows, len(rows)

    if best_rows is None:
        best_rows = workbook.get_sheet_by_name(best_name).to_python()

    return best_name, best_rows


def main():
    conn = psycopg2.connect(DATABASE_URL)

    try:
        update_job(conn, status="processing")

        print("Opening file and detecting format via calamine...", flush=True)
        workbook = CalamineWorkbook.from_path(FILE_PATH)

        sheet_name, rows = pick_sheet(workbook)
        print(f"Using sheet: {sheet_name}", flush=True)

        if not rows:
            raise ValueError("File is empty")

        header_idx, column_offset = find_header_row(rows)

        if header_idx >= 0:
            data_rows = rows[header_idx + 1:]
        else:
            # заголовка немає — імпортуємо все з нульовим зсувом
            data_rows = rows

        total_rows = len(data_rows)
        update_job(conn, total=total_rows)

        print(
            f"Total rows: {total_rows}, "
            f"Header row: {header_idx}, "
            f"Column offset: {column_offset}",
            flush=True,
        )

        processed = 0
        skipped_empty = 0
        skipped_bad = 0
        batch = []

        for raw_vals in data_rows:
            if not raw_vals:
                skipped_empty += 1
                continue

            # порожній рядок (усе None або порожні рядки)
            if all(
                v is None or (isinstance(v, str) and not v.strip())
                for v in raw_vals
            ):
                skipped_empty += 1
                continue

            base_vals = [None] * N_COLS

            for file_idx, val in enumerate(raw_vals):
                target_idx = file_idx - column_offset
                if 0 <= target_idx < N_COLS:
                    base_vals[target_idx] = val

            cleaned = [
                coerce(base_vals[i], TYPES[i])
                for i in range(N_COLS)
            ]

            product_text = cleaned[PRODUCT_NAME_IDX] or ""

            try:
                brand, model, qty_parsed = parse_product(product_text)
            except Exception:
                brand, model, qty_parsed = None, None, None

            batch.append(cleaned + [brand, model, qty_parsed, JOB_ID])

            if len(batch) >= BATCH_SIZE:
                ins, bad = insert_batch(conn, batch)
                processed += ins
                skipped_bad += bad
                batch = []

                update_job(conn, processed=processed)
                print(
                    f"Processed: {processed}/{total_rows} "
                    f"(empty: {skipped_empty}, bad: {skipped_bad})",
                    flush=True,
                )

                if skipped_bad > MAX_BAD_ROWS:
                    raise RuntimeError(
                        f"Too many bad rows ({skipped_bad}); aborting"
                    )

        if batch:
            ins, bad = insert_batch(conn, batch)
            processed += ins
            skipped_bad += bad
            update_job(conn, processed=processed)

        update_job(conn, status="done", processed=processed)

        print(
            f"Done! Imported {processed} rows "
            f"(skipped empty: {skipped_empty}, skipped bad: {skipped_bad}).",
            flush=True,
        )

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr, flush=True)
        try:
            conn.rollback()
            update_job(conn, status="error", error=str(e))
        except Exception as update_err:
            print(
                f"Failed to set error status: {update_err}",
                file=sys.stderr,
                flush=True,
            )

    finally:
        try:
            conn.close()
        except Exception:
            pass

        try:
            os.remove(FILE_PATH)
        except Exception:
            pass


if __name__ == "__main__":
    main()