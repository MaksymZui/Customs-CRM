#!/usr/bin/env python3
import sys
import os
import io
import re
from datetime import datetime

try:
    import psycopg2
    from pyxlsb import open_workbook
except ImportError as e:
    print(f"Missing dependency: {e}")
    sys.exit(1)

FILE_PATH = sys.argv[1]
JOB_ID = sys.argv[2]
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://customs_admin:customs_pass_2026@localhost:5432/customs_crm")

BATCH_SIZE = 5000

COLUMNS = [
    "decl_type_1", "decl_type_2", "decl_type_3", "decl_type_4",
    "decl_num_prefix", "decl_num_year", "decl_num_number",
    "declaration_date",
    "customs_office", "customs_post",
    "trade_country", "dispatch_country", "origin_country",
    "container_presence", "container_number",
    "delivery_condition", "delivery_place",
    "currency_code", "currency_name",
    "border_transport_code", "border_transport_name", "border_transport_num",
    "inland_transport_code", "inland_transport_name",
    "border_transport_code2",
    "border_customs_code", "border_customs_name", "border_customs_post",
    "item_number", "product_code", "product_name",
    "recipient_code", "recipient_name",
    "reverse_side", "field_35", "field_36",
    "sender_name",
    "contract_holder_1", "contract_holder_2",
    "valuation_method", "add_unit_qty", "add_unit_name",
    "weight_gross", "weight_net",
    "invoice_value_uah", "invoice_value_usd",
    "exchange_rate",
    "customs_value_uah", "customs_value_usd",
    "customs_value_per_kg",
    "duty_uah", "excise_uah", "vat_uah",
    "brand", "model", "qty_parsed",
]

def clean(val):
    if val is None:
        return None
    if isinstance(val, float):
        return val
    s = str(val).replace('\xa0', ' ').replace('\x00', '').strip()
    return s if s else None

def parse_product(text):
    if not text:
        return None, None, None

    text = str(text)
    text = text.replace('\xa0', ' ')
    text = re.sub(r'\s+', ' ', text).strip()

    brand = None
    model = None
    qty = None

    # ==================================================
    # 1. КОЛИЧЕСТВО
    # Берем число непосредственно перед ШТ / PCS / КОМПЛ
    # ==================================================
    qty_match = re.search(
        r'(\d+(?:[.,]\d+)?)\s*(?:ШТ|PCS|КОМПЛ|ШТУК)\b',
        text,
        re.IGNORECASE
    )

    if qty_match:
        try:
            qty = float(qty_match.group(1).replace(',', '.'))
        except ValueError:
            qty = None

    # ==================================================
    # 2. БРЕНД
    # Сначала ТОРГОВЕЛЬНА МАРКА / BRAND
    # Если нет — ВИРОБНИК
    # ==================================================
    brand_match = re.search(
        r'(?:ТОРГОВЕЛЬНА МАРКА|ТОРГОВАЯ МАРКА|BRAND)\s*[:\-]?\s*'
        r'(.+?)(?=\s+(?:КРАЇНА|КРАИНА|COUNTRY|ВИРОБНИК|'
        r'ПРОИЗВОДИТЕЛЬ)\b|$)',
        text,
        re.IGNORECASE
    )

    if brand_match:
        brand = brand_match.group(1).strip()

    if not brand:
        manufacturer_match = re.search(
            r'(?:ВИРОБНИК|ПРОИЗВОДИТЕЛЬ)\s*[:\-]?\s*'
            r'(.+?)(?=\s+(?:КРАЇНА|КРАИНА|COUNTRY)\b|$)',
            text,
            re.IGNORECASE
        )

        if manufacturer_match:
            brand = manufacturer_match.group(1).strip()

    if brand:
        brand = re.sub(r'\s+', ' ', brand).strip()[:100]

    # ==================================================
    # 3. МОДЕЛЬ
    # Сначала ищем явное "МОДЕЛЬ ..."
    # ==================================================
    model_match = re.search(
        r'(?:МОДЕЛЬ|MODEL)\s+(.+?)'
        r'(?=\s+(?:КРАЇНА|КРАИНА|COUNTRY|ВИРОБНИК|'
        r'ПРОИЗВОДИТЕЛЬ)\b|'
        r'\s+\d+(?:[.,]\d+)?\s*(?:ШТ|PCS|КОМПЛ|ШТУК)\b|$)',
        text,
        re.IGNORECASE
    )

    if model_match:
        model = model_match.group(1).strip()

    # ==================================================
    # 4. Если "МОДЕЛЬ" нет —
    # ищем модель в названии перед АРТ
    #
    # Например:
    # FPV КАМЕРА P6 PRO FPV CAMERA P6 PRO АРТ 6577 98 ШТ
    #
    # Берем P6 PRO, а не 6577 98
    # ==================================================
    if not model:
        art_match = re.search(
            r'(.+?)\s+АРТ\.?\s*[:#№]?\s*'
            r'[A-ZА-ЯІЇЄҐ0-9][A-ZА-ЯІЇЄҐ0-9\-_./ ]*?'
            r'\s+\d+\s*(?:ШТ|PCS|КОМПЛ|ШТУК)\b',
            text,
            re.IGNORECASE
        )

        if art_match:
            before_art = art_match.group(1).strip()

            # Ищем последние слова, похожие на модель:
            # P6 PRO
            # HMD PULSE
            # ABC-123
            candidates = re.findall(
                r'\b[A-ZА-ЯІЇЄҐ0-9][A-ZА-ЯІЇЄҐ0-9\-_]*(?:\s+[A-ZА-ЯІЇЄҐ0-9][A-ZА-ЯІЇЄҐ0-9\-_]*){0,3}\b',
                before_art,
                re.IGNORECASE
            )

            # Убираем очевидный мусор
            candidates = [
                x.strip()
                for x in candidates
                if len(x.strip()) >= 2
                and x.upper() not in {
                    'АРТ', 'КАМЕРА', 'КАМЕРИ', 'FPV',
                    'CAMERA', 'MODULE', 'IP', 'CCTV',
                    'HMD', 'ДЛЯ'
                }
            ]

            if candidates:
                # Берем последний подходящий кандидат
                model = candidates[-1]

    if model:
        model = re.sub(r'\s+', ' ', model).strip()

        # Если каким-то образом количество попало в модель,
        # убираем его с конца.
        if qty is not None:
            qty_str = (
                str(int(qty))
                if float(qty).is_integer()
                else str(qty)
            )

            model = re.sub(
                rf'\s+{re.escape(qty_str)}$',
                '',
                model,
                flags=re.IGNORECASE
            ).strip()

        model = model[:100]

    return brand, model, qty

def update_job(conn, status=None, processed=None, total=None, error=None):
    with conn.cursor() as cur:
        parts = []
        args = []
        if status:
            parts.append("status = %s"); args.append(status)
        if processed is not None:
            parts.append("processed = %s"); args.append(processed)
        if total is not None:
            parts.append("total_rows = %s"); args.append(total)
        if error:
            parts.append("error = %s"); args.append(error)
        if status in ('done', 'error'):
            parts.append("finished_at = %s"); args.append(datetime.utcnow())
        args.append(JOB_ID)
        cur.execute(f"UPDATE import_jobs SET {', '.join(parts)} WHERE id = %s", args)
    conn.commit()

def insert_batch(conn, batch):
    all_cols = COLUMNS + ["import_id"]
    cols_str = ", ".join(all_cols)
    buf = io.StringIO()
    for row in batch:
        line = '\t'.join(['' if v is None else str(v).replace('\t', ' ').replace('\n', ' ').replace('\r', '') for v in row])
        buf.write(line + '\n')
    buf.seek(0)
    with conn.cursor() as cur:
        cur.copy_expert(
            f"COPY declarations ({cols_str}) FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '')",
            buf
        )
    conn.commit()

def main():
    conn = psycopg2.connect(DATABASE_URL)

    try:
        update_job(conn, status='processing')

        print("Counting rows...")
        total_rows = 0
        with open_workbook(FILE_PATH) as wb:
            with wb.get_sheet('tab') as s:
                for i, _ in enumerate(s.rows()):
                    if i == 0:
                        continue
                    total_rows += 1

        update_job(conn, total=total_rows)
        print(f"Total data rows: {total_rows}")

        processed = 0
        batch = []

        with open_workbook(FILE_PATH) as wb:
            with wb.get_sheet('tab') as s:
                for i, row in enumerate(s.rows()):
                    if i == 0:
                        continue

                    vals = [c.v for c in row]
                    while len(vals) < 54:
                        vals.append(None)

                    cleaned = [clean(v) for v in vals[:53]]
                    product_text = str(vals[30]) if vals[30] else ''
                    brand, model, qty_parsed = parse_product(product_text)
                    row_data = cleaned + [brand, model, qty_parsed, JOB_ID]
                    batch.append(row_data)

                    if len(batch) >= BATCH_SIZE:
                        insert_batch(conn, batch)
                        processed += len(batch)
                        batch = []
                        update_job(conn, processed=processed)
                        print(f"Processed: {processed}/{total_rows}")

                if batch:
                    insert_batch(conn, batch)
                    processed += len(batch)
                    update_job(conn, processed=processed)

        update_job(conn, status='done', processed=processed)
        print(f"Done! Imported {processed} rows.")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        update_job(conn, status='error', error=str(e)[:500])
    finally:
        conn.close()
        try:
            os.remove(FILE_PATH)
        except Exception:
            pass

if __name__ == '__main__':
    main()