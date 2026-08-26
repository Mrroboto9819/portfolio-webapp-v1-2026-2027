# The instance, its security group, and the Elastic IP.

resource "aws_security_group" "web" {
  name        = "portafolio-web"
  description = "portafolio: HTTP/HTTPS from anywhere, SSH only if explicitly enabled"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description      = "HTTP (Caddy redirects to HTTPS, and ACME challenges arrive here)"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description      = "HTTPS"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # No SSH by default — Session Manager replaces it (see iam.tf). This block
  # only materialises if ssh_ingress_cidr is set, and never to 0.0.0.0/0.
  dynamic "ingress" {
    for_each = var.ssh_ingress_cidr == null ? [] : [var.ssh_ingress_cidr]
    content {
      description = "SSH fallback, single CIDR only"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    description      = "All outbound: Atlas, S3, GHCR, apt, TLS issuance"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

# Latest Ubuntu 24.04 LTS, x86, from Canonical's official account.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "web" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.web.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_gb
  }

  metadata_options {
    # IMDSv2 only — the token-based metadata service, so SSRF in any workload
    # can't read credentials with a bare GET.
    http_tokens = "required"
    # 2, not the default 1: the app runs in a Docker container, and the bridge
    # network adds a hop. At 1 the SDK inside the container can never reach
    # IMDS, the credential chain finds nothing, and every upload fails with a
    # credentials error that looks nothing like a hop-limit problem.
    http_put_response_hop_limit = 2
  }

  user_data = templatefile("${path.module}/user_data.sh", {
    region       = var.region
    domain       = var.domain
    media_bucket = aws_s3_bucket.media.bucket
    param_prefix = var.ssm_param_prefix
    app_image    = var.app_image
  })

  # The bootstrap script only runs at first boot, so an edited script on an
  # existing instance would silently do nothing. Replacing the instance keeps
  # the script honest — the box is disposable by design (no local state), and
  # the EIP re-associates to the replacement.
  user_data_replace_on_change = true

  tags = {
    Name = "portafolio-web"
  }
}

# A fixed public IP that survives stop/start. Without it the instance gets a
# fresh address on every start and the Atlas IP allowlist silently stops
# matching — the app then fails with a server-selection timeout that looks
# nothing like an allowlist problem. This address is what goes in the Atlas
# allowlist and, at cutover, in the DNS A records.
resource "aws_eip" "web" {
  domain = "vpc"

  tags = {
    Name = "portafolio-web"
  }
}

resource "aws_eip_association" "web" {
  instance_id   = aws_instance.web.id
  allocation_id = aws_eip.web.id
}
