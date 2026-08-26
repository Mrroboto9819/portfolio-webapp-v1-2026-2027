variable "region" {
  description = "AWS region. Must be the same region as the Atlas cluster — a cross-region hop adds latency to every query and costs transfer."
  type        = string
  default     = "us-east-1"
}

variable "domain" {
  description = "Public apex domain the site serves."
  type        = string
  default     = "pablocabrera.dev"
}

variable "media_bucket_name" {
  description = "S3 bucket for uploaded media. Globally unique, so not 'portafolio'. The name never appears in stored URLs — Caddy maps /cdn/portafolio/* onto it — so it can be anything."
  type        = string
  default     = "pablocabrera-media"
}

variable "instance_type" {
  description = "x86 to match what CI builds today. Changing architectures is a second step, not part of a migration. micro (1 GB) chosen deliberately for a low-traffic portfolio; resize by editing this and applying — the EIP survives the stop/start."
  type        = string
  default     = "t3.micro"
}

variable "root_volume_gb" {
  description = "gp3 root volume. The app stores nothing locally; this holds the OS, Docker images, and logs."
  type        = number
  default     = 20
}

variable "github_repo" {
  description = "owner/repo allowed to assume the deploy role via GitHub OIDC."
  type        = string
  default     = "Mrroboto9819/portfolio-webapp-v1-2026-2027"
}

variable "app_image" {
  description = "Container image the instance runs. GHCR requires a lowercase owner, hence the mismatch with github_repo's casing."
  type        = string
  default     = "ghcr.io/mrroboto9819/portfolio-webapp-v1-2026-2027"
}

variable "ssm_param_prefix" {
  description = "SSM Parameter Store path the instance reads its secrets from. Direct children become the app's env file; the deploy/ subpath is reserved for deploy-only values like a GHCR pull token."
  type        = string
  default     = "/portafolio"
}

variable "ssh_ingress_cidr" {
  description = "Leave null (the default): the instance is reached through SSM Session Manager, which needs no open port and logs every session. Set to <your-ip>/32 only if you genuinely want raw SSH as a fallback."
  type        = string
  default     = null
}
