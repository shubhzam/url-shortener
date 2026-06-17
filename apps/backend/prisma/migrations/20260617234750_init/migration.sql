-- CreateTable
CREATE TABLE "Url" (
    "id" SERIAL NOT NULL,
    "shortCode" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "clickCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Url_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Url_shortCode_key" ON "Url"("shortCode");
