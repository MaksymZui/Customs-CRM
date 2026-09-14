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

    text = str(text).replace('\xa0', ' ')
    text = re.sub(r'\s+', ' ', text).strip()

    # 1. ПОШУК КІЛЬКОСТІ
    qty = None
    qty_match = re.search(r'\b(\d+(?:[\.,]\d+)?)\s*(?:ШТ|PCS|КОМПЛ|ШТУК|SET|шт\.?)\b', text, re.IGNORECASE)
    if qty_match:
        try:
            qty = float(qty_match.group(1).replace(',', '.'))
        except ValueError:
            pass

    # 2. ПОШУК БРЕНДУ
    brand = None
    brand_match = re.search(
        r'(?:ТОРГОВЕЛЬН?А?\s+МАРКА|ТОРГОВЕЛЬНОЇ\s+МАРКИ|ТОРГОВАЯ МАРКА|\bТМ\b|\bBRAND\b|\bTRADEMARK\b)\s*[:\-\s=]+'
        r'["«\']?([A-ZА-ЯІЇЄҐ0-9\s&\-\.]{2,50}?)["»\']?'
        r'(?=\s*(?:[,\;\n]|\b(?:КРАЇНА|КРАИНА|COUNTRY|ВИРОБНИК|ПРОИЗВОДИТЕЛЬ|PRODUCER|МОДЕЛЬ|MODEL|АРТ|ART|КІЛЬКІСТЬ|НЕ\s+МІСТИТЬ|КОД)\b|$))',
        text, re.IGNORECASE)
    if brand_match:
        brand = brand_match.group(1).strip(' "\'«»:-.')
        
    if not brand:
        mfg_match = re.search(
            r'(?:ВИРОБНИК|ПРОИЗВОДИТЕЛЬ|MANUFACTURER|PRODUCER)\s*[:\-\s=]+'
            r'["«\']?([A-ZА-ЯІЇЄҐ0-9\s&\-\.]{2,50}?)["»\']?'
            r'(?=\s*(?:[,\;\n]|\b(?:КРАЇНА|КРАИНА|COUNTRY|ТОРГОВЕЛЬНА|BRAND|МОДЕЛЬ|MODEL|АРТ|ART|КІЛЬКІСТЬ|НЕ\s+МІСТИТЬ|КОД)\b|$))',
            text, re.IGNORECASE)
        if mfg_match:
            brand = mfg_match.group(1).strip(' "\'«»:-.')
            
    if brand:
        brand = re.sub(r'\s+', ' ', brand).strip()[:100]
        if brand.upper() in ('НЕМАЄ', 'NO', 'WITHOUT', 'NONE', 'UA', 'CN'):
            brand = None

    # 3. ПОШУК УСІХ МОДЕЛЕЙ (ЧЕРЕЗ КОМУ) З ВІДСІЧЕННЯМ СПЕЦИФІКАЦІЙ
    text_upper = text.upper()
    
    stopwords = {
        'CAMERA', 'КАМЕРА', 'КАМЕРИ', 'FPV', 'DRONE', 'QUADCOPTER',
        'ART', 'АРТ', 'АРТИКУЛ', 'MODEL', 'МОДЕЛЬ', 'ITEM', 'NO',
        'PCS', 'SET', 'ШТ', 'КОМПЛ', 'КІЛЬКІСТЬ', 'ШТУК',
        'BRAND', 'TRADEMARK', 'ТМ', 'МАРКА', 'ТОРГОВЕЛЬНА', 'ТОРГОВАЯ',
        'CN', 'UA', 'MADE', 'IN', 'ВИРОБНИК', 'ПРОИЗВОДИТЕЛЬ', 'КРАЇНА', 'КРАИНА', 'ВИРОБНИЦТВА', 'КОД',
        'ММ', 'МКМ', 'ГЦ', 'РХ', 'PX', 'HZ', 'MM'
    }
    if brand:
        stopwords.update(brand.upper().split())

    # А. Замінюємо всі кириличні символи на розділювач '|'
    text_clean = re.sub(r'[А-ЯІЇЄҐ]+', '|', text_upper)

    # Б. Видаляємо знайдену кількість із тексту
    if qty is not None:
        qty_str = str(int(qty)) if float(qty).is_integer() else str(qty)
        text_clean = re.sub(rf'\b{qty_str}\b', '|', text_clean)

    # В. Видаляємо всі стоп-слова
    for w in stopwords:
        text_clean = re.sub(rf'\b{w}\b', '|', text_clean)

    # Г. Розбиваємо текст на частини по розділювачу '|'
    raw_models = [m.strip(' -./_') for m in text_clean.split('|')]
    
    valid_models = []
    for m in raw_models:
        m = re.sub(r'\s+', ' ', m).strip()
        
        # Фільтр: відкидаємо сміття
        if len(m) < 2:
            continue
        if re.fullmatch(r'[\d\s\.\,\-]+', m):  # Тільки цифри та символи (напр. 8806 або 9 1)
            continue
        if re.search(r'\d+\s*[XХ]\s*\d+', m): # Роздільна здатність (960X768)
            continue
        if re.match(r'^F\s*[\d\.\,]+$', m):   # Діафрагма (F 1 0)
            continue
            
        if re.search(r'[A-Z0-9]', m) and m not in valid_models:
            valid_models.append(m)

    # Д. Додатковий примусовий пошук артикулу (якщо він пропущений)
    art_match = re.search(r'(?:АРТИКУЛ|АРТ\.?|ART\.?|МОДЕЛЬ|MODEL)\s*[:\-\s#№]+["«\']?([A-Z0-9\-\./_]{2,30})', text, re.IGNORECASE)
    if art_match:
        explicit_art = art_match.group(1).strip(' "\'«»:-.')
        if explicit_art and explicit_art not in valid_models and not re.fullmatch(r'[\d\s\.\,\-]+', explicit_art):
            valid_models.append(explicit_art)

    model = ", ".join(valid_models) if valid_models else None
    if model:
        model = model[:150]

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