-- AlterTable
ALTER TABLE "Order" ADD COLUMN "original_currency" TEXT;
ALTER TABLE "Order" ADD COLUMN "original_price" REAL;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "old_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "ozon_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "price" REAL NOT NULL,
    "old_price" REAL,
    "currency" TEXT DEFAULT 'USD',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reserved_stock" INTEGER NOT NULL DEFAULT 0,
    "fbo_stock" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "revenue" REAL NOT NULL DEFAULT 0,
    "rating" REAL,
    "reviews_count" INTEGER NOT NULL DEFAULT 0,
    "content_rating" REAL,
    "status" TEXT NOT NULL,
    "moderate_status" TEXT,
    "validation_status" TEXT,
    "status_name" TEXT,
    "variant_group_id" TEXT,
    "is_variant" BOOLEAN NOT NULL DEFAULT false,
    "ozon_created_at" DATETIME,
    "volume_weight" REAL,
    "category_name" TEXT,
    "health" TEXT,
    "images_json" TEXT,
    "attributes_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Product_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT,
    "product_id" TEXT,
    "severity" TEXT NOT NULL,
    "sku" TEXT,
    "product_name" TEXT,
    "error_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "root_cause" TEXT,
    "suggested_fix" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "related_logs" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ErrorLog_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "health_score" INTEGER NOT NULL DEFAULT 0,
    "amazon_data_json" TEXT,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "seo_keywords" TEXT,
    "missing_attributes" TEXT,
    "suggested_price" REAL,
    "confidence_score" INTEGER NOT NULL DEFAULT 0,
    "ai_report_json" TEXT,
    "last_analyzed" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIAnalysis_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT,
    "product_id" TEXT,
    "agent_name" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MODERATE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "risk_level" TEXT NOT NULL DEFAULT 'LOW',
    "what_is_wrong" TEXT NOT NULL,
    "why_is_wrong" TEXT,
    "suggested_value" TEXT,
    "expected_benefit" TEXT,
    "safe_to_auto" BOOLEAN NOT NULL DEFAULT false,
    "field_name" TEXT,
    "before_value" TEXT,
    "after_value" TEXT,
    "compliance_passed" BOOLEAN NOT NULL DEFAULT false,
    "compliance_note" TEXT,
    "applied_at" DATETIME,
    "applied_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agent_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "products_scanned" INTEGER NOT NULL DEFAULT 0,
    "tasks_created" INTEGER NOT NULL DEFAULT 0,
    "tasks_auto_fixed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME
);

-- CreateTable
CREATE TABLE "CompetitorData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "competitor_count" INTEGER NOT NULL DEFAULT 0,
    "avg_price" REAL,
    "lowest_price" REAL,
    "highest_price" REAL,
    "rank_position" INTEGER,
    "last_updated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorData_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_account_id_ozon_id_key" ON "Product"("account_id", "ozon_id");

-- CreateIndex
CREATE UNIQUE INDEX "AIAnalysis_product_id_key" ON "AIAnalysis"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorData_product_id_key" ON "CompetitorData"("product_id");
