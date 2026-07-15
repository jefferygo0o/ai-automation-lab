#!/usr/bin/env python3
"""OCI VM watcher — tries to launch A1.Flex instance once per run.

Safely returns:
  "SUCCESS: IP=x.x.x.x"  if instance was created
  "ALREADY_EXISTS"       if the instance is already running
  "RETRY: <reason>"      if capacity isn't available yet
"""

import os, sys, json, base64, time, subprocess

KEY_PATH = "/tmp/oci_api_key.pem"
if not os.path.exists(KEY_PATH):
    with open(KEY_PATH, "w") as f:
        f.write(os.environ["ORACLE_PRIVATE_KEY"])
    os.chmod(KEY_PATH, 0o600)

import oci
from oci.core.models import (
    LaunchInstanceDetails,
    LaunchInstanceShapeConfigDetails,
    InstanceSourceViaImageDetails,
    CreateVnicDetails,
)

K = os.environ
cfg = {
    "user": K["ORACLE_USER_OCID"],
    "tenancy": K["ORACLE_TENANCY_OCID"],
    "fingerprint": K["ORACLE_FINGERPRINT"],
    "region": K["ORACLE_REGION"],
    "key_file": KEY_PATH,
}
TENANCY = K["ORACLE_TENANCY_OCID"]
AD_NAME = "nkVo:UK-LONDON-1-AD-3"
INSTANCE_OCPUS = 4
INSTANCE_MEM_GB = 24
INSTANCE_NAME = "lab-vm"

# ---- Read SSH pubkey ----
SSH_PUBKEY_PATH = "/lab/lab-ssh-key.pub"
if not os.path.exists(SSH_PUBKEY_PATH):
    SSH_PUBKEY_PATH = "/home/workspace/Projects/ai-automation-lab/deploy/oracle/lab-ssh-key.pub"

if not os.path.exists(SSH_PUBKEY_PATH):
    print("RETRY: SSH public key not found", flush=True)
    sys.exit(0)

with open(SSH_PUBKEY_PATH) as f:
    SSH_PUBKEY = f.read().strip()

compute = oci.core.ComputeClient(cfg)
vcn = oci.core.VirtualNetworkClient(cfg)

# ---- Check if instance already exists ----
instances = compute.list_instances(
    compartment_id=TENANCY,
    display_name=INSTANCE_NAME,
    lifecycle_state="RUNNING",
).data
if instances:
    inst = instances[0]
    vnic_attachments = compute.list_vnic_attachments(
        compartment_id=TENANCY,
        instance_id=inst.id,
    ).data
    public_ip = "unknown"
    if vnic_attachments:
        vnic = vcn.get_vnic(vnic_attachments[0].vnic_id).data
        public_ip = vnic.public_ip or "no-public-ip"
    print(f"ALREADY_EXISTS: instance={inst.id} ip={public_ip}", flush=True)
    sys.exit(0)

# ---- Find VCN ----
vcns = vcn.list_vcns(TENANCY).data
lab_vcn = next((v for v in vcns if v.display_name == "lab-vcn"), None)
if not lab_vcn:
    print("RETRY: lab-vcn not found", flush=True)
    sys.exit(0)

# ---- Find subnet in AD-3 or regional subnet ----
subnets = vcn.list_subnets(TENANCY).data
subnet = next(
    (s for s in subnets if s.vcn_id == lab_vcn.id and s.availability_domain == AD_NAME),
    None
)
if not subnet:
    subnet = next(
        (s for s in subnets if s.vcn_id == lab_vcn.id and s.availability_domain is None),
        None
    )
if not subnet:
    print("RETRY: no suitable subnet found in lab-vcn", flush=True)
    sys.exit(0)

# ---- Find latest Oracle Linux 9 image for A1.Flex ----
images = compute.list_images(
    compartment_id=TENANCY,
    operating_system="Oracle Linux",
    operating_system_version="9",
    shape="VM.Standard.A1.Flex",
    sort_by="TIMECREATED",
    sort_order="DESC",
).data
if not images:
    print("RETRY: no compatible image found", flush=True)
    sys.exit(0)
image_id = images[0].id

# ---- Try to launch ----
try:
    instance = compute.launch_instance(
        LaunchInstanceDetails(
            compartment_id=TENANCY,
            display_name=INSTANCE_NAME,
            availability_domain=AD_NAME,
            shape="VM.Standard.A1.Flex",
            shape_config=LaunchInstanceShapeConfigDetails(
                ocpus=INSTANCE_OCPUS,
                memory_in_gbs=INSTANCE_MEM_GB,
            ),
            subnet_id=subnet.id,
            metadata={
                "ssh_authorized_keys": SSH_PUBKEY,
            },
            source_details=InstanceSourceViaImageDetails(
                image_id=image_id,
                boot_volume_size_in_gbs=50,
            ),
            create_vnic_details=CreateVnicDetails(
                display_name="lab-vnic",
                subnet_id=subnet.id,
                assign_public_ip=True,
            ),
            is_pv_encryption_in_transit_enabled=False,
        )
    ).data
    print(f"SUCCESS: instance={instance.id}", flush=True)
except oci.exceptions.ServiceError as e:
    msg = str(e.message).lower()
    if "out of host capacity" in msg or "out of capacity" in msg or "incapable" in msg:
        print("RETRY: out of host capacity", flush=True)
    elif "limit" in msg and "exceeded" in msg:
        print("RETRY: limit exceeded", flush=True)
    else:
        print(f"RETRY: {e.message}", flush=True)
    sys.exit(0)
