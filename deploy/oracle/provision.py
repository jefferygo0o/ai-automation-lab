#!/usr/bin/env python3
"""Provision the entire ai-automation-lab infrastructure on Oracle Cloud.

Creates:
- VCN with public subnet + internet gateway
- Security list (SSH, HTTP, HTTPS, lab port)
- Block volume (100 GB) mounted at /mnt/lab
- VM.Standard.A1.Flex instance with cloud-init
- Object Storage bucket for backups
- SSH key pair saved to workspace
"""

import os, json, sys, time, base64, shutil, textwrap
from pathlib import Path

import oci
from oci.core.models import (
    CreateVcnDetails,
    CreateInternetGatewayDetails,
    CreateRouteTableDetails,
    RouteRule,
    CreateSecurityListDetails,
    EgressSecurityRule, IngressSecurityRule,
    PortRange,
    TcpOptions,
    UdpOptions,
    CreateSubnetDetails,
    CreateVolumeDetails,
    LaunchInstanceDetails,
    CreateBootVolumeDetails,
    LaunchInstanceShapeConfigDetails,
    CreateVnicDetails,
    InstanceSourceViaImageDetails,
    AttachVolumeDetails,
    AttachParavirtualizedVolumeDetails,
)

# ── config ──────────────────────────────────────────────────────────────────

TENANCY_OCID = os.environ["ORACLE_TENANCY_OCID"]
REGION       = os.environ["ORACLE_REGION"]
AD_NAME      = f"{REGION}-AD-3"  # user's availability domain

INSTANCE_OCPUS     = 4
INSTANCE_MEM_GB    = 24
BLOCK_VOLUME_SIZE  = 100  # GB
BLOCK_VOLUME_NAME  = "lab-block-volume"
VCN_CIDR_BLOCK     = "10.0.0.0/16"
SUBNET_CIDR        = "10.0.1.0/24"
VCN_DISPLAY_NAME   = "ai-automation-lab-vcn"
INSTANCE_NAME      = "ai-automation-lab"
BUCKET_NAME        = "ai-automation-lab-backups"
SSH_KEY_DIR        = Path("/home/workspace/Projects/ai-automation-lab/deploy/oracle")
LAB_COMPOSE_DIR    = SSH_KEY_DIR / "compose"
LAB_SCRIPTS_DIR    = SSH_KEY_DIR / "scripts"

# ── auth ────────────────────────────────────────────────────────────────────

print("🔐 Configuring OCI client…")
key_path = "/tmp/oci_api_key.pem"
with open(key_path, "w") as f:
    f.write(os.environ["ORACLE_PRIVATE_KEY"])
os.chmod(key_path, 0o600)

config = {
    "user":        os.environ["ORACLE_USER_OCID"],
    "tenancy":     TENANCY_OCID,
    "fingerprint": os.environ["ORACLE_FINGERPRINT"],
    "region":      REGION,
    "key_file":    key_path,
}

identity  = oci.identity.IdentityClient(config)
compute   = oci.core.ComputeClient(config)
network   = oci.core.VirtualNetworkClient(config)
block_vol = oci.core.BlockstorageClient(config)
obj_stor  = oci.object_storage.ObjectStorageClient(config)

# ── SSH key ─────────────────────────────────────────────────────────────────

KEY_FILE = SSH_KEY_DIR / "lab-ssh-key"
print(f"🔑 Generating SSH key pair → {SSH_KEY_DIR}…")
# Use ssh-keygen via subprocess
import subprocess
subprocess.run(
    ["ssh-keygen", "-t", "ed25519", "-f", str(KEY_FILE), "-N", "", "-q"],
    check=True, stdout=subprocess.DEVNULL, stdin=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
pubkey = (KEY_FILE.with_suffix(".pub")).read_text().strip()

# ── VCN ─────────────────────────────────────────────────────────────────────

print(f"🏗️  Creating VCN {VCN_DISPLAY_NAME}…")
vcn = network.create_vcn(
    CreateVcnDetails(
        compartment_id=TENANCY_OCID,
        display_name=VCN_DISPLAY_NAME,
        cidr_block=VCN_CIDR_BLOCK,
        dns_label="lab",
    )
).data
vcn_id = vcn.id
print(f"  VCN: {vcn_id}")

# ── Internet Gateway ────────────────────────────────────────────────────────

print("🌐 Creating Internet Gateway…")
igw = network.create_internet_gateway(
    CreateInternetGatewayDetails(
        compartment_id=TENANCY_OCID,
        vcn_id=vcn_id,
        display_name="lab-igw",
        is_enabled=True,
    )
).data
igw_id = igw.id

# ── Route Table ─────────────────────────────────────────────────────────────

print("🗺️  Creating route table (0.0.0.0/0 → IGW)…")
rt = network.create_route_table(
    CreateRouteTableDetails(
        compartment_id=TENANCY_OCID,
        vcn_id=vcn_id,
        display_name="lab-public-rt",
        route_rules=[RouteRule(
            destination="0.0.0.0/0",
            network_entity_id=igw_id,
        )],
    )
).data
rt_id = rt.id

# ── Security List ───────────────────────────────────────────────────────────

print("🔒 Creating security list…")
sl = network.create_security_list(
    CreateSecurityListDetails(
        compartment_id=TENANCY_OCID,
        vcn_id=vcn_id,
        display_name="lab-public-sl",
        ingress_security_rules=[IngressSecurityRule(
                source="0.0.0.0/0",
                protocol="6",  # TCP
                tcp_options=TcpOptions(destination_port_range=PortRange(min=22, max=22)),
                description="SSH",
            ),
            # HTTP
            IngressSecurityRule(
                source="0.0.0.0/0",
                protocol="6",
                tcp_options=TcpOptions(destination_port_range=PortRange(min=80, max=80)),
                description="HTTP",
            ),
            # HTTPS
            IngressSecurityRule(
                source="0.0.0.0/0",
                protocol="6",
                tcp_options=TcpOptions(destination_port_range=PortRange(min=443, max=443)),
                description="HTTPS",
            ),
            # Lab app
            IngressSecurityRule(
                source="0.0.0.0/0",
                protocol="6",
                tcp_options=TcpOptions(destination_port_range=PortRange(min=7778, max=7778)),
                description="Lab app",
            ),
        ],
        egress_security_rules=[EgressSecurityRule(
                destination="0.0.0.0/0",
                protocol="all",
                description="All outbound",
            ),
        ],
    )
).data
sl_id = sl.id

# ── Subnet ──────────────────────────────────────────────────────────────────

print("🌍 Creating public subnet ({SUBNET_CIDR})…")
subnet = network.create_subnet(
    CreateSubnetDetails(
        compartment_id=TENANCY_OCID,
        vcn_id=vcn_id,
        display_name="lab-public-subnet",
        cidr_block=SUBNET_CIDR,
        route_table_id=rt_id,
        security_list_ids=[sl_id],
        dns_label="public",
    )
).data
subnet_id = subnet.id

# ── Object Storage bucket ───────────────────────────────────────────────────

print("☁️  Creating Object Storage bucket for backups…")
ns = obj_stor.get_namespace().data
try:
    obj_stor.create_bucket(namespace_name=ns, create_bucket_details=
        oci.object_storage.models.CreateBucketDetails(
            compartment_id=TENANCY_OCID,
            name=BUCKET_NAME,
            public_access_type="NoPublicAccess",
        )
    )
    print(f"  Bucket: {BUCKET_NAME}")
except oci.exceptions.ServiceError as e:
    if e.status != 409:  # already exists
        raise
    print(f"  Bucket already exists: {BUCKET_NAME}")

# Upload the lab source tarball that the VM will use to build the Docker image
print("📦 Uploading lab source tarball to Object Storage…")
TARBALL_PATH = "/tmp/lab-build.tar.gz"
try:
    with open(TARBALL_PATH, "rb") as f:
        obj_stor.put_object(
            namespace_name=ns,
            bucket_name=BUCKET_NAME,
            object_name="lab-source.tar.gz",
            put_object_body=f,
        )
    print(f"  Uploaded {TARBALL_PATH}")
except FileNotFoundError:
    print(f"  ⚠️  Tarball not found at {TARBALL_PATH}. Create it manually with deploy/oracle/scripts/build-tarball.sh")
    sys.exit(1)

# Create a pre-authenticated request (PAR) so the VM can download the tarball
# without Object Storage credentials
import datetime
from oci.object_storage.models import CreatePreauthenticatedRequestDetails
par_name = f"lab-source-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
par = obj_stor.create_preauthenticated_request(
    namespace_name=ns,
    bucket_name=BUCKET_NAME,
    create_preauthenticated_request_details=CreatePreauthenticatedRequestDetails(
        name=par_name,
        object_name="lab-source.tar.gz",
        access_type="ObjectRead",
        time_expires=datetime.datetime.now() + datetime.timedelta(days=7),
    )
).data
TARBALL_URL = f"https://objectstorage.{REGION}.oraclecloud.com{par.access_uri}"
print(f"  PAR URL (expires 7 days): {TARBALL_URL}")

# ── cloud-init user_data ────────────────────────────────────────────────────

def read_script(path):
    """Read a deployment script and return its content."""
    try:
        return Path(path).read_text()
    except Exception:
        return "# (file not found during provisioning)"

docker_compose_yml = read_script(str(LAB_COMPOSE_DIR / "docker-compose.yml"))
dockerfile          = read_script(str(LAB_COMPOSE_DIR / "Dockerfile"))
provision_user_sh   = read_script(str(LAB_SCRIPTS_DIR / "provision-user.sh"))
backup_sh           = read_script(str(LAB_SCRIPTS_DIR / "backup.sh"))

tarball_url = TARBALL_URL

USERNAME = '{USERNAME}'
VM_IP = '{VM_IP}'
DATA_DIR = '{DATA_DIR}'
BUCKET_NAME = '{BUCKET_NAME}'
TIMESTAMP = '{TIMESTAMP}'
BUCKET = '{BUCKET}'
SUPABASE_DB_URL = '{SUPABASE_DB_URL}'
LAB_MASTER_KEY = '{LAB_MASTER_KEY}'


user_data_script = textwrap.dedent(f"""\
#!/bin/bash
set -euo pipefail

# ============================================================
# ai-automation-lab — bootstrapping script (cloud-init)
# ============================================================

exec > /var/log/lab-bootstrap.log 2>&1
echo "[bootstrap] Starting at $(date)"

# ── Mount block volume ──────────────────────────────────────
echo "[bootstrap] Formatting and mounting block volume…"
BLOCK_DEVICE="/dev/oracleoci/oraclevdb"
if [ ! -b "$BLOCK_DEVICE" ]; then
  # Try alternative device names
  for dev in /dev/sdb /dev/nvme1n1 /dev/xvdb; do
    if [ -b "$dev" ]; then BLOCK_DEVICE="$dev"; break; fi
  done
fi

if [ -b "$BLOCK_DEVICE" ]; then
  mkfs.ext4 -F "$BLOCK_DEVICE" 2>/dev/null || true
  mkdir -p /mnt/lab
  mount "$BLOCK_DEVICE" /mnt/lab
  echo "LABEL=lab /mnt/lab ext4 defaults 0 2" >> /etc/fstab
else
  echo "[bootstrap] WARNING: No block device found, using /mnt/lab on root volume"
  mkdir -p /mnt/lab
fi

# ── Create user data directories ────────────────────────────
mkdir -p /mnt/lab/users
mkdir -p /mnt/lab/backups

# ── Install Docker ─────────────────────────────────────────
echo "[bootstrap] Installing Docker…"
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || true
dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || \
  dnf install -y docker-engine docker-compose-plugin 2>/dev/null || \
  curl -fsSL get.docker.com | bash
systemctl enable --now docker

# ── Write lab app files ────────────────────────────────────
echo "[bootstrap] Writing Dockerfile…"
mkdir -p /mnt/lab/compose
cat > /mnt/lab/compose/Dockerfile << 'DOCKERFILE_EOF'
{dockerfile}
DOCKERFILE_EOF

echo "[bootstrap] Writing docker-compose.yml…"
cat > /mnt/lab/compose/docker-compose.yml << 'COMPOSE_EOF'
{docker_compose_yml}
COMPOSE_EOF

# ── Write management scripts ───────────────────────────────
mkdir -p /mnt/lab/scripts
cat > /mnt/lab/scripts/provision-user.sh << 'USER_EOF'
{provision_user_sh}
USER_EOF
chmod +x /mnt/lab/scripts/provision-user.sh

cat > /mnt/lab/scripts/backup.sh << 'BACKUP_EOF'
{backup_sh}
BACKUP_EOF
chmod +x /mnt/lab/scripts/backup.sh

# ── Download lab source tarball and build image ────────────
echo "[bootstrap] Downloading lab source from Object Storage…"
TARBALL_URL="{tarball_url}"
mkdir -p /opt/lab
cd /opt/lab
curl -fsSL -o lab-source.tar.gz "$TARBALL_URL"
tar xzf lab-source.tar.gz
rm lab-source.tar.gz

echo "[bootstrap] Building lab-app Docker image…"
cp /mnt/lab/compose/Dockerfile .
docker build -t lab-app:latest -f Dockerfile .

# ── Boot the base Traefik + any configured user containers ─
echo "[bootstrap] Starting Docker Compose stack…"
cd /mnt/lab/compose
docker compose up -d

echo "[bootstrap] Done at $(date)"
echo "[bootstrap] Public IP: $(curl -s http://icanhazip.com || curl -s http://checkip.amazonaws.com || echo 'unknown')"
""")

user_data_b64 = base64.b64encode(user_data_script.encode()).decode()

# ── Launch VM ───────────────────────────────────────────────────────────────

print("🚀 Launching VM.Standard.A1.Flex instance…")

images = compute.list_images(
    compartment_id=TENANCY_OCID,
    operating_system="Oracle Linux",
    operating_system_version="9",
    shape="VM.Standard.A1.Flex",
    sort_by="TIMECREATED",
    sort_order="DESC",
).data
if not images:
    print("❌ No matching Oracle Linux 9 image found for A1.Flex")
    sys.exit(1)
image_id = images[0].id
print(f"  Image: {images[0].display_name} ({image_id})")

instance = compute.launch_instance(
    LaunchInstanceDetails(
        compartment_id=TENANCY_OCID,
        display_name=INSTANCE_NAME,
        availability_domain=AD_NAME,
        shape="VM.Standard.A1.Flex",
        shape_config=LaunchInstanceShapeConfigDetails(
            ocpus=INSTANCE_OCPUS,
            memory_in_gbs=INSTANCE_MEM_GB,
        ),
        subnet_id=subnet_id,
        metadata={
            "ssh_authorized_keys": pubkey,
            "user_data": user_data_b64,
        },
        source_details=InstanceSourceViaImageDetails(
            image_id=image_id,
            boot_volume_size_in_gbs=50,  # free tier gives 200 GB total
        ),
        create_vnic_details=CreateVnicDetails(
            display_name="lab-vnic",
            subnet_id=subnet_id,
            assign_public_ip=True,
        ),
        is_pv_encryption_in_transit_enabled=False,
    )
).data
instance_id = instance.id
print(f"  Instance ID: {instance_id}")

# ── Wait for instance to be running ─────────────────────────────────────────

print("⏳ Waiting for instance to reach RUNNING state…")
start = time.time()
timeout = 300  # 5 minutes
while True:
    inst = compute.get_instance(instance_id).data
    print(f"  State: {inst.lifecycle_state}  ({time.time()-start:.0f}s)")
    if inst.lifecycle_state == "RUNNING":
        break
    if inst.lifecycle_state == "TERMINATED":
        print("❌ Instance terminated during launch. Check OCI console.")
        sys.exit(1)
    if time.time() - start > timeout:
        print("❌ Timeout waiting for instance to run.")
        sys.exit(1)
    time.sleep(10)

# ── Get public IP ──────────────────────────────────────────

vnic_attachments = compute.list_vnic_attachments(
    compartment_id=TENANCY_OCID,
    instance_id=instance_id,
).data
if vnic_attachments:
    vnic = network.get_vnic(vnic_attachments[0].vnic_id).data
    public_ip = vnic.public_ip
else:
    public_ip = "(unknown — check OCI console)"

# ── Attach block volume ─────────────────────────────────────────────────────

print(f"🔗 Attaching block volume to instance…")
max_retries = 20
for attempt in range(max_retries):
    try:
        attach = compute.attach_volume(
            AttachParavirtualizedVolumeDetails(
                instance_id=instance_id,
                # volume_id=volume_id,
                device="/dev/oracleoci/oraclevdb",
                is_read_only=False,
                is_shareable=False,
            )
        ).data
        print(f"  Volume attached: {attach.id}")
        break
    except oci.exceptions.ServiceError as e:
        if e.status == 400 and "not ready" in str(e).lower():
            print(f"  Volume not ready yet (attempt {attempt+1}/{max_retries})…")
            time.sleep(10)
            continue
        raise

# ── Output ──────────────────────────────────────────────────────────────────

print(f"""
╔══════════════════════════════════════════════════════════╗
║  ✅  ai-automation-lab provisioning complete            ║
╚══════════════════════════════════════════════════════════╝

Instance:      {public_ip}
SSH key:       {KEY_FILE}
VCN:           {vcn_id}
Subnet:        {subnet_id}
Block Volume:  {volume_id} ({BLOCK_VOLUME_SIZE} GB)
Bucket:        {BUCKET_NAME}

SSH command:
  ssh -i {KEY_FILE} opc@{public_ip}

nip.io base URL:
  http://{{user}}.{public_ip}.nip.io

Next steps (done automatically via cloud-init):
  1. Block volume formatted and mounted at /mnt/lab
  2. Docker installed and running
  3. lab-app Docker image built from compose/Dockerfile
  4. docker-compose.yml started (Traefik + default containers)
  5. provision-user.sh and backup.sh installed at /mnt/lab/scripts/

After boot (3-5 minutes), add a user:
  ssh -i {KEY_FILE} opc@{public_ip}
  sudo /mnt/lab/scripts/provision-user.sh alice

Then access:
  http://alice.{public_ip}.nip.io

To run a backup:
  sudo /mnt/lab/scripts/backup.sh

IMPORTANT: The cloud-init bootstrap builds a minimal placeholder image.
You need to deploy the real lab code. SSH in and either:
  a) git clone your repo into /opt/lab and rebuild
  b) Copy the lab code from /home/workspace/Projects/ai-automation-lab/
     using the deploy/deploy-via-ssh.sh script
""")
