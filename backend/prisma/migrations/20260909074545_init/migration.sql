-- CreateTable
CREATE TABLE "declarations" (
    "id" SERIAL NOT NULL,
    "decl_type_1" DOUBLE PRECISION,
    "decl_type_2" DOUBLE PRECISION,
    "decl_type_3" TEXT,
    "decl_type_4" TEXT,
    "decl_num_prefix" TEXT,
    "decl_num_year" DOUBLE PRECISION,
    "decl_num_number" DOUBLE PRECISION,
    "declaration_date" DOUBLE PRECISION,
    "customs_office" TEXT,
    "customs_post" TEXT,
    "trade_country" TEXT,
    "dispatch_country" TEXT,
    "origin_country" TEXT,
    "container_presence" TEXT,
    "container_number" TEXT,
    "delivery_condition" TEXT,
    "delivery_place" TEXT,
    "currency_code" DOUBLE PRECISION,
    "currency_name" TEXT,
    "border_transport_code" DOUBLE PRECISION,
    "border_transport_name" TEXT,
    "border_transport_num" TEXT,
    "inland_transport_code" DOUBLE PRECISION,
    "inland_transport_name" TEXT,
    "border_transport_code2" DOUBLE PRECISION,
    "border_customs_code" TEXT,
    "border_customs_name" TEXT,
    "border_customs_post" TEXT,
    "item_number" DOUBLE PRECISION,
    "product_code" TEXT,
    "product_name" TEXT,
    "recipient_code" DOUBLE PRECISION,
    "recipient_name" TEXT,
    "reverse_side" TEXT,
    "field_35" TEXT,
    "field_36" TEXT,
    "sender_name" TEXT,
    "contract_holder_1" TEXT,
    "contract_holder_2" TEXT,
    "valuation_method" DOUBLE PRECISION,
    "add_unit_qty" DOUBLE PRECISION,
    "add_unit_name" TEXT,
    "weight_gross" DOUBLE PRECISION,
    "weight_net" DOUBLE PRECISION,
    "invoice_value_uah" DOUBLE PRECISION,
    "invoice_value_usd" DOUBLE PRECISION,
    "exchange_rate" DOUBLE PRECISION,
    "customs_value_uah" DOUBLE PRECISION,
    "customs_value_usd" DOUBLE PRECISION,
    "customs_value_per_kg" DOUBLE PRECISION,
    "duty_uah" DOUBLE PRECISION,
    "excise_uah" DOUBLE PRECISION,
    "vat_uah" DOUBLE PRECISION,
    "import_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_rows" INTEGER,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "declarations_decl_num_prefix_idx" ON "declarations"("decl_num_prefix");

-- CreateIndex
CREATE INDEX "declarations_customs_office_idx" ON "declarations"("customs_office");

-- CreateIndex
CREATE INDEX "declarations_trade_country_idx" ON "declarations"("trade_country");

-- CreateIndex
CREATE INDEX "declarations_origin_country_idx" ON "declarations"("origin_country");

-- CreateIndex
CREATE INDEX "declarations_product_code_idx" ON "declarations"("product_code");

-- CreateIndex
CREATE INDEX "declarations_recipient_code_idx" ON "declarations"("recipient_code");

-- CreateIndex
CREATE INDEX "declarations_declaration_date_idx" ON "declarations"("declaration_date");

-- CreateIndex
CREATE INDEX "declarations_import_id_idx" ON "declarations"("import_id");
