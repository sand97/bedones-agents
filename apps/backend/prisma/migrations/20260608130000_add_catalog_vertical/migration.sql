-- AlterTable: store the Meta catalog vertical so we can detect non-"commerce"
-- catalogs (which can't hold WhatsApp products) before importing into them.
ALTER TABLE "Catalog" ADD COLUMN     "vertical" TEXT;
