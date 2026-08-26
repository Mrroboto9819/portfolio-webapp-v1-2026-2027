# Terraform entry point. `terraform init && terraform apply` in this
# directory creates the entire AWS side of the migration: media bucket,
# instance role, EC2 + Elastic IP, and the GitHub OIDC deploy role.
#
# Secrets are deliberately absent — see iam.tf and infra/README.md step 5.

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.60"
    }
  }

  # State starts local: terraform.tfstate lands next to these files and is
  # gitignored (state holds resource details in plaintext — never commit it).
  # Once the stack is stable, move it to S3: create a small bucket by hand,
  # uncomment this block, and run `terraform init -migrate-state`.
  #
  # backend "s3" {
  #   bucket       = "pablocabrera-tfstate"
  #   key          = "portafolio/terraform.tfstate"
  #   region       = "us-east-1"
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "portafolio"
      ManagedBy = "terraform"
    }
  }
}
