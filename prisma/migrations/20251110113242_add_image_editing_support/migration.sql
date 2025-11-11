-- AlterTable
ALTER TABLE "local_sessions" ADD COLUMN     "server_type" TEXT;

-- CreateTable
CREATE TABLE "generated_images" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_path" TEXT,
    "data" TEXT,
    "mime_type" TEXT NOT NULL DEFAULT 'image/png',
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "preview_256" TEXT,
    "preview_1024" TEXT,
    "source_hash" TEXT,
    "output_hash" TEXT,
    "recipe_json" TEXT,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'imagen-4',
    "aspect_ratio" TEXT NOT NULL DEFAULT '1:1',
    "original_image_id" TEXT,
    "edit_type" TEXT,
    "edit_prompt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_images_user_id_idx" ON "generated_images"("user_id");

-- CreateIndex
CREATE INDEX "generated_images_original_image_id_idx" ON "generated_images"("original_image_id");

-- CreateIndex
CREATE INDEX "generated_images_created_at_idx" ON "generated_images"("created_at");

-- CreateIndex
CREATE INDEX "generated_images_source_hash_idx" ON "generated_images"("source_hash");

-- CreateIndex
CREATE INDEX "generated_images_output_hash_idx" ON "generated_images"("output_hash");

-- CreateIndex
CREATE INDEX "local_sessions_user_id_server_type_status_idx" ON "local_sessions"("user_id", "server_type", "status");

-- AddForeignKey
ALTER TABLE "generated_images" ADD CONSTRAINT "generated_images_original_image_id_fkey" FOREIGN KEY ("original_image_id") REFERENCES "generated_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
