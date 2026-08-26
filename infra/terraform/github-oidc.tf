# GitHub Actions -> AWS, with no stored keys.
#
# OIDC federation: GitHub signs a short-lived identity token for each workflow
# run, and AWS is configured to trust tokens whose `sub` claim says "this run
# is from Mrroboto9819/portfolio-webapp-v1-2026-2027, on the main branch". The
# workflow exchanges that token for temporary credentials scoped to the deploy
# role below. Nothing long-lived exists on either side — revoking access is
# deleting this role.
#
# main only, deliberately: it mirrors "the AWS deploy path exists only on
# main". A workflow run from any other branch, a fork, or a PR presents a
# different `sub` and the exchange is refused.

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # AWS now validates GitHub's cert chain against trusted CAs and mostly
  # ignores these, but the API still requires the field.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      # GitHub's sub claim embeds immutable numeric IDs alongside the names
      # (owner@ownerId/repo@repoId — read from a real token, not guessed).
      # Matching the full form pins the trust to THIS exact repo identity:
      # it survives renames and can't be claimed by a recreated repo.
      values = [
        "repo:${split("/", var.github_repo)[0]}@${var.github_owner_id}/${split("/", var.github_repo)[1]}@${var.github_repo_id}:ref:refs/heads/main"
      ]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "portafolio-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

# The role can do exactly one thing: run a shell command on this one instance
# through SSM, and read back the result. It cannot touch S3, IAM, the
# parameters, or any other instance.
data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid     = "RunDeployCommand"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
      "arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.web.id}",
    ]
  }

  statement {
    sid = "ReadCommandResult"
    actions = [
      "ssm:GetCommandInvocation",
      "ssm:ListCommands",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy-via-ssm"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
