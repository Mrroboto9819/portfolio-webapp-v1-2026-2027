# Shared data sources.
#
# The default VPC, on purpose. A three-AZ VPC with private subnets and a NAT
# gateway is the textbook answer and would add ~$32/month in NAT charges alone
# to host a portfolio. One instance in a default public subnet behind a tight
# security group is the honest architecture for this workload.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  # Pinned to one AZ because not every zone stocks every instance type —
  # us-east-1e, which happened to sort first, has no t3.micro at all.
  filter {
    name   = "availability-zone"
    values = ["us-east-1a"]
  }
}

data "aws_caller_identity" "current" {}
