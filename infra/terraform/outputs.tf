output "public_ip" {
  description = "The Elastic IP. Add it to the Atlas Network Access allowlist, and point the DNS A records here at cutover."
  value       = aws_eip.web.public_ip
}

output "instance_id" {
  description = "Set as the AWS_INSTANCE_ID repository variable, and the target for `aws ssm start-session`."
  value       = aws_instance.web.id
}

output "media_bucket" {
  description = "The media bucket. Sync MinIO's contents here (README step 4)."
  value       = aws_s3_bucket.media.bucket
}

output "deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN repository variable for .github/workflows/deploy-aws.yml."
  value       = aws_iam_role.github_deploy.arn
}

output "shell_command" {
  description = "How to get a shell on the instance — no SSH, no keys."
  value       = "aws ssm start-session --target ${aws_instance.web.id} --region ${var.region}"
}
