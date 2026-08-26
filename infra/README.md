# AWS migration — operator guide

Companion to the migration runbook. The runbook explains *why*; this file is
the *do this, in this order* list. Everything AWS-shaped is created by
`terraform apply` in `infra/terraform/` — the steps below are the parts only a
human with the right logins can do, plus the gates that prove each step
worked.

Nothing here touches the k3s cluster until step 8. It keeps serving
pablocabrera.dev the whole way.

## Who authenticates to what

The question that shapes everything. Six connections, six different
credentials — and only one of them is a password you manage by hand.

| From | To | Credential | You manage |
|---|---|---|---|
| Your laptop (CLI, Terraform) | AWS | IAM user access key via `aws configure` | created once, step 0 |
| GitHub Actions | AWS (SSM only) | OIDC federation → role `portafolio-github-deploy`, `main` branch only | nothing stored |
| GitHub Actions | GHCR | built-in `GITHUB_TOKEN` | nothing |
| EC2 instance | S3 bucket + SSM parameters | IAM instance role `portafolio-ec2`, auto-rotated | nothing |
| App | Atlas | `MONGODB_URI` (db user + password) **and** Atlas's IP allowlist containing the Elastic IP | user + allowlist, step 1 |
| You | instance shell | SSM Session Manager through your IAM user | nothing — no SSH keys, port 22 closed |

The one thing people expect to work and doesn't: **AWS IAM does not reach
Atlas.** Atlas is MongoDB's cloud, not AWS's. Its two locks are the network
allowlist (which must contain the Elastic IP — a plain instance IP changes on
every stop/start, which is why Terraform allocates an EIP) and the database
user embedded in the connection string. The instance role covers S3 and SSM,
nothing else. (Atlas does offer AWS-IAM-based auth as an upgrade later;
ignore it during the migration.)

And S3 never talks to Atlas or vice versa — the app is the hub. Mongo stores
the media *URLs* (`/cdn/portafolio/...`); S3 stores the *bytes*; Caddy maps
one onto the other.

---

## Step 0 — tools and the AWS account

This Mac currently has none of the toolbelt. Install it:

```sh
brew install awscli terraform mongosh kubernetes-cli
brew install mongodb/brew/mongodb-database-tools   # mongodump / mongorestore
```

AWS account, one-time:

1. Create the account (or use the existing one) at aws.amazon.com.
2. In the IAM console create a user for yourself (e.g. `pablo-admin`),
   attach `AdministratorAccess`, create an **access key** for CLI use.
   (Never create or use root-account access keys.)
3. `aws configure` — paste the key, secret, and default region `us-east-1`.
4. Verify: `aws sts get-caller-identity` prints your account and user.

Session Manager needs its CLI plugin for shells onto the instance:

```sh
brew install --cask session-manager-plugin
```

To run the `kubectl` steps from this Mac, copy the k3s kubeconfig down once
(replace `SERVER` with the cluster host):

```sh
mkdir -p ~/.kube
ssh SERVER 'sudo cat /etc/rancher/k3s/k3s.yaml' \
  | sed 's/127.0.0.1/SERVER/' > ~/.kube/k3s.yaml
export KUBECONFIG=~/.kube/k3s.yaml
kubectl get nodes   # proves it works
```

(Alternative: run those steps directly on the server, where kubectl already
works.)

## Step 1 — Atlas: cluster, user, allowlist

In the Atlas UI (project already exists):

1. **Create the cluster** in **AWS us-east-1** — the same region as the EC2
   instance, or every query pays a cross-region hop. Tier: M0 to prove the
   path free, Flex for the sensible small-site tier. Version 7.0 if the tier
   lets you pick (M0/Flex may force newer — that's fine, they restore a 7.0
   dump).
2. **Database Access** → add user `portafolio-app`, password auth, role
   **readWrite on `portafolio`** only — not an org admin.
3. **Network Access** → add *your current IP* (so you can restore from the
   laptop). The Elastic IP gets added in step 3.
4. Copy the connection string (`mongodb+srv://...`). The final URI is:

   ```
   mongodb+srv://portafolio-app:<PASSWORD>@<cluster-host>/portafolio?retryWrites=true&w=majority
   ```

## Step 2 — dump and restore the database

```sh
# Dump straight out of the pod to the laptop (~745 MB on disk, far smaller gzipped)
kubectl exec -n mongodb mongodb-0 -- \
  mongodump --uri="mongodb://127.0.0.1:27017/portafolio" --archive --gzip \
  > portafolio.archive.gz

# Restore into Atlas
mongorestore --uri "$ATLAS_URI" \
  --archive=portafolio.archive.gz --gzip \
  --nsInclude='portafolio.*'
```

> **✅ Gate 1** — compare collection counts, don't trust "the restore said OK":
>
> ```sh
> mongosh "$ATLAS_URI" --eval '
>   const d = db.getSiblingDB("portafolio");
>   d.getCollectionNames().forEach(c => print(c, d[c].countDocuments()))'
> ```
>
> Run the same `--eval` through `kubectl exec` against the pod and diff.

The copies diverge from this moment on — k3s keeps taking writes. That's
expected; step 8 re-syncs with `--drop` right before the DNS flip.

## Step 3 — `terraform apply`

```sh
cd infra/terraform
terraform init
terraform plan    # READ this — it lists every resource about to exist
terraform apply
```

What the plan will show, and why (one paragraph each in the .tf files):
the media bucket with anonymous-read policy (`s3.tf`), the instance role
scoped to that bucket + the `/portafolio` parameter path (`iam.tf`), the
security group / Ubuntu instance / Elastic IP (`ec2.tf`), and the GitHub OIDC
deploy role (`github-oidc.tf`). First boot runs `user_data.sh`, which
installs Docker + Caddy and the `portafolio-redeploy` script.

Then, immediately:

1. `terraform output -raw public_ip` → **add this IP to Atlas Network
   Access**, and remove your laptop IP once the migration is done.
2. Note the other outputs — steps 5–6 use them.

> **✅ Gate 3** — `aws ssm start-session --target $(terraform output -raw
> instance_id)` drops you into a shell on the box. `systemctl status caddy`
> is active (its cert errors are expected until DNS exists);
> `docker --version` works.

## Step 4 — copy the media (44 MB)

MinIO's credentials live in the cluster secret:

```sh
kubectl get secret -n portafolio portafolio-s3 \
  -o go-template='{{range $k,$v := .data}}{{$k}}={{$v | base64decode}}{{"\n"}}{{end}}'
```

```sh
# Reach MinIO from the laptop
kubectl port-forward -n storage svc/minio 9000:9000 &

# Pull the bucket down (MinIO creds, local endpoint)
AWS_ACCESS_KEY_ID=<minio-key> AWS_SECRET_ACCESS_KEY=<minio-secret> \
  aws --endpoint-url http://127.0.0.1:9000 s3 sync s3://portafolio ./media-export

# Push up with YOUR AWS creds. --cache-control is not optional: sync drops
# the header uploadObject() sets, and without it every migrated image gets
# revalidated on every visit instead of cached for a year.
aws s3 sync ./media-export "s3://$(terraform -chdir=infra/terraform output -raw media_bucket)" \
  --cache-control 'public, max-age=31536000, immutable'
```

> **✅ Gate 4** — object counts match, and one sampled object serves publicly
> with the header intact:
>
> ```sh
> aws s3 ls "s3://<bucket>" --recursive | wc -l   # == MinIO's count
> curl -sI "https://<bucket>.s3.us-east-1.amazonaws.com/<some-key>" | grep -i cache-control
> ```

## Step 5 — secrets into SSM, then first deploy

Secrets never enter Terraform (state is plaintext) and never sit in files on
the instance except the root-only env file the deploy script rebuilds. They
live in SSM Parameter Store as `SecureString`, named exactly after the env
var they set.

**Reuse the k3s values** — the JWT secret keeps existing admin sessions
valid, and `ANALYTICS_SALT` keeps visitor-dedup hashes stable. Read them out:

```sh
kubectl get secret -n portafolio portafolio-env \
  -o go-template='{{range $k,$v := .data}}{{$k}}={{$v | base64decode}}{{"\n"}}{{end}}'
```

Then (note the leading space before each command keeps the secret out of
shell history):

```sh
 aws ssm put-parameter --name /portafolio/MONGODB_URI       --type SecureString --value 'mongodb+srv://portafolio-app:...@.../portafolio?retryWrites=true&w=majority'
 aws ssm put-parameter --name /portafolio/JWT_ACCESS_SECRET --type SecureString --value '<same as k3s>'
 aws ssm put-parameter --name /portafolio/ADMIN_API_TOKEN   --type SecureString --value '<same as k3s>'
 aws ssm put-parameter --name /portafolio/ANALYTICS_SALT    --type SecureString --value '<same as k3s>'
```

(There is no `JWT_REFRESH_SECRET` — the app signs everything with the one
access secret. `MONGODB_DB` defaults to `portafolio`; set a parameter only if
that ever changes.)

**GHCR visibility.** The first `main` push after this lands builds and
publishes the image. GHCR packages default to private. Either make the
package public (github.com → your profile → Packages →
portfolio-webapp-v1-2026-2027 → settings), or give the instance a pull token:

```sh
 aws ssm put-parameter --name /portafolio/deploy/GHCR_USER  --type String       --value 'Mrroboto9819'
 aws ssm put-parameter --name /portafolio/deploy/GHCR_TOKEN --type SecureString --value '<classic PAT with read:packages>'
```

Now deploy:

```sh
aws ssm send-command \
  --instance-ids "$(terraform -chdir=infra/terraform output -raw instance_id)" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["/usr/local/bin/portafolio-redeploy latest"]'
```

(Or run `portafolio-redeploy latest` from a Session Manager shell to watch it
live.)

> **✅ Gate 5** — from a Session Manager shell:
> `curl -s http://127.0.0.1:3000/api/v1/health` returns `"db":true`. That one
> line proves the container runs, the secrets fetch worked, the Atlas
> allowlist contains the EIP, and the URI is right — before TLS is anywhere
> in the picture. A server-selection timeout here = allowlist or URI.

## Step 6 — wire up CI

`.github/workflows/deploy-aws.yml` is already on `main` and already building
images; its deploy job unlocks when three repository **variables** exist
(repo → Settings → Secrets and variables → Actions → **Variables**):

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw deploy_role_arn` |
| `AWS_INSTANCE_ID` | `terraform output -raw instance_id` |
| `AWS_REGION` | `us-east-1` |

Then push any commit to `main` (or run the workflow manually) and watch:
build → GHCR → SSM → health gate. During the migration window both workflows
run on `main` — k3s still serves production, AWS deploys in parallel. That's
intentional; it ends in step 8.

## Step 7 — full pre-cutover test

Let's Encrypt can't issue for pablocabrera.dev while DNS points at k3s, so
test with Caddy's internal CA:

1. On the instance: edit `/etc/caddy/Caddyfile`, uncomment both
   `tls internal` lines, `systemctl reload caddy`.
2. On the laptop: add `<elastic-ip> pablocabrera.dev www.pablocabrera.dev`
   to `/etc/hosts`.
3. Browse `https://pablocabrera.dev` (accept the warning — it's Caddy's own
   CA, expected). Walk the real site: landing page, an uploaded image
   rendering from `/cdn/portafolio/...`, admin login, **save an edit** — the
   save is the `ORIGIN` test.
4. Confirm `https://www.pablocabrera.dev` redirects to the apex.
5. Remove the hosts-file line. Leave `tls internal` for now — it comes out at
   cutover.

> **✅ Gate 6** — all four checks pass through the hosts-file entry.

(Optional but recommended before cutover: Grafana Cloud free tier + the Alloy
agent, per runbook Phase 6, so the cutover is the first thing you watch
through it.)

## Step 8 — cutover

The danger is the split-brain window: k3s has kept writing since step 2.
Order matters.

1. **A day ahead:** lower the DNS TTL on the apex + www A records to 60s.
2. **Stop writing:** stay out of the admin (or scale the k3s deployments to
   zero). The window is minutes.
3. **Final data sync:** rerun step 2's dump, restore with `--drop` so Atlas
   is an exact copy, and rerun step 4's media sync (same `--cache-control`).
4. **On the instance:** remove both `tls internal` lines,
   `systemctl reload caddy`.
5. **Flip the A records** — apex and www → the Elastic IP. Caddy obtains real
   certificates within seconds of the first hit.
6. **Verify from a network you've never used** (phone off wifi): HTTPS loads,
   www redirects, an image renders, an admin edit saves.
7. **Same day:** point beta at the new backends — update `portafolio-env`
   (Atlas URI) and `portafolio-s3` on the cluster and roll
   `portafolio-beta` — or retire beta. (If beta keeps uploading media it
   needs S3 credentials: create a small IAM user with the same bucket-scoped
   policy as `iam.tf` and put its keys in `portafolio-s3`. Instance roles
   don't exist off-EC2.)
8. **Retire the k3s prod path:** edit `.github/workflows/deploy-k3s.yml`,
   change `branches: [develop, main]` to `branches: [develop]`. From then on
   `main` deploys only to AWS — the workflow split you asked for.

**Rollback**, until you delete anything: flip the A records back, scale k3s
up. Keep the cluster warm and untouched for at least a week. Before ever
deleting the Mongo StatefulSet or MinIO PVC, take a final `mongodump` to cold
storage.

---

## Day-2 cheat sheet

```sh
# Shell on the instance (no SSH, no keys)
aws ssm start-session --target <instance-id>

# Deploy a specific build by hand
aws ssm send-command --instance-ids <instance-id> \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["/usr/local/bin/portafolio-redeploy <sha7>"]'

# App logs / status (from the instance shell)
docker logs -f portafolio
systemctl status portafolio caddy

# Rotate a secret: update the parameter, then redeploy
 aws ssm put-parameter --name /portafolio/ADMIN_API_TOKEN \
   --type SecureString --overwrite --value '<new>'
```
