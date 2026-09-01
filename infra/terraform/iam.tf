# The EC2 instance role — how the app talks to AWS with no keys anywhere.
#
# An instance role is an IAM role that EC2 hands to the machine through the
# instance metadata service (IMDS). The AWS SDK inside the app finds it
# automatically as part of its default credential chain, gets short-lived
# credentials, and rotates them itself. Nothing to store, nothing to leak,
# nothing to rotate by hand — this is why s3.ts no longer requires
# S3_ACCESS_KEY / S3_SECRET_KEY.
#
# Atlas is NOT covered by any of this: it is not an AWS service. The app
# reaches it with the MONGODB_URI connection string (database user + password)
# and Atlas's own IP allowlist, which must contain the Elastic IP.

# Only EC2 may wear this role.
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "portafolio-ec2"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# Exactly the verbs s3.ts uses, on exactly one bucket.
data "aws_iam_policy_document" "media_rw" {
  statement {
    sid = "MediaObjects"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.media.arn}/*"]
  }

  # The admin media manager (/admin/media) enumerates the bucket to show
  # albums and live counts, and its move operation checks the destination is
  # free before copying. List is a bucket-level action, so it names the
  # bucket itself, not /*. Before the manager existed this grant deliberately
  # did not — nothing listed, so nothing was allowed to.
  statement {
    sid       = "MediaList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn]
  }
}

resource "aws_iam_role_policy" "media_rw" {
  name   = "media-bucket-rw"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.media_rw.json
}

# Read the app's secrets from Parameter Store. Terraform defines only the
# *path* — the values are set once with `aws ssm put-parameter` (README step
# 5) so they never touch .tf files or state, which stores values in plaintext.
data "aws_iam_policy_document" "params_read" {
  statement {
    sid = "ReadAppParameters"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    resources = [
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_param_prefix}",
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_param_prefix}/*",
    ]
  }
}

resource "aws_iam_role_policy" "params_read" {
  name   = "app-parameters-read"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.params_read.json
}

# Session Manager: shell access through the AWS API with no open SSH port and
# no key pair. `aws ssm start-session --target <instance-id>` from the laptop.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# The wrapper EC2 actually attaches — an instance profile is just the
# EC2-shaped container for a role.
resource "aws_iam_instance_profile" "ec2" {
  name = "portafolio-ec2"
  role = aws_iam_role.ec2.name
}
