# Media bucket — the replacement for the MinIO pod.
#
# Public anonymous read is the like-for-like move: the MinIO bucket is
# world-readable today and the app is written around that (s3.ts calls it
# "served publicly"). It is safe here because the upload allowlist
# deliberately excludes SVG, so nothing served from the bucket can carry
# script. Tightening to CloudFront + Origin Access Control is a worthwhile
# follow-up — after the site is up, not during the migration.

resource "aws_s3_bucket" "media" {
  bucket = var.media_bucket_name
}

# New buckets block ALL public access by default. Anonymous read is granted
# through a bucket policy (below), so only the two policy-related blocks are
# lifted; public ACLs stay blocked because nothing uses ACLs.
resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

data "aws_iam_policy_document" "media_public_read" {
  statement {
    sid       = "PublicRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_public_read.json

  # The public access block must land first, or AWS rejects the policy.
  depends_on = [aws_s3_bucket_public_access_block.media]
}
