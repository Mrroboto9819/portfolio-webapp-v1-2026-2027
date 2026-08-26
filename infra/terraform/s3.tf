# Media bucket — the replacement for the MinIO pod.
#
# PRIVATE, by Pablo's explicit decision (2026-08-26): the app is the only
# reader. Visitors receive media exclusively through the app's
# /cdn/portafolio/ route, which fetches with the instance role — a direct
# bucket URL answers 403 to everyone. (The first iteration granted anonymous
# read, MinIO-style; that bucket policy is deliberately gone.)

resource "aws_s3_bucket" "media" {
  bucket = var.media_bucket_name
}

# Everything blocked. No policy grants public access, and this makes sure no
# future policy quietly can.
resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
