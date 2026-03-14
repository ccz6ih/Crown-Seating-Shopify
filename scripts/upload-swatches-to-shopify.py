"""
Upload DPO swatch images to Shopify's permanent Files storage.

Usage:
  1. Get your Shopify Admin API access token:
     - Go to Settings > Apps and sales channels > Develop apps
     - Create an app with 'write_files' and 'read_files' scopes
     - Install it and copy the Admin API access token

  2. Run:
     python scripts/upload-swatches-to-shopify.py YOUR_ACCESS_TOKEN

  This uploads all images from dpo-swatch-images/ to Shopify Files,
  then generates an updated URL mapping file so we can update the
  snippet files to point to the new permanent URLs.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.parse
import mimetypes
import uuid

SHOP = "crownseating.myshopify.com"
IMAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dpo-swatch-images")
MAPPING_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "swatch-url-mapping.json")
API_VERSION = "2024-01"


def graphql(token, query, variables=None):
    """Execute a GraphQL query against Shopify Admin API."""
    url = f"https://{SHOP}/admin/api/{API_VERSION}/graphql.json"
    payload = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def multipart_upload(url, params, filepath):
    """Upload a file via multipart/form-data using only stdlib."""
    boundary = uuid.uuid4().hex
    filename = os.path.basename(filepath)
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    body_parts = []
    for key, value in params.items():
        body_parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
            f"{value}\r\n"
        )

    # File part header
    file_header = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    )

    with open(filepath, "rb") as f:
        file_data = f.read()

    file_footer = f"\r\n--{boundary}--\r\n"

    body = b""
    for part in body_parts:
        body += part.encode("utf-8")
    body += file_header.encode("utf-8")
    body += file_data
    body += file_footer.encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status in (200, 201, 204)


def get_mimetype(filename):
    ext = filename.lower().rsplit(".", 1)[-1]
    return {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp",
    }.get(ext, "image/jpeg")


def main():
    if len(sys.argv) < 2:
        print("=" * 60)
        print("Crown Seating - DPO Swatch Image Uploader")
        print("=" * 60)
        print()
        print("Usage: python scripts/upload-swatches-to-shopify.py YOUR_TOKEN")
        print()
        print("To get your access token:")
        print("  1. Go to Shopify Admin > Settings > Apps and sales channels")
        print("  2. Click 'Develop apps' > 'Create an app'")
        print("  3. Name it 'Swatch Uploader'")
        print("  4. Configure scopes: write_files, read_files")
        print("  5. Install the app")
        print("  6. Copy the Admin API access token")
        print()
        print(f"Images ready to upload: {len(os.listdir(IMAGE_DIR))} files")
        sys.exit(1)

    token = sys.argv[1]

    # Load existing mapping if any
    url_mapping = {}
    if os.path.exists(MAPPING_FILE):
        with open(MAPPING_FILE) as f:
            url_mapping = json.load(f)

    images = sorted([f for f in os.listdir(IMAGE_DIR) if not f.startswith(".")])
    print(f"Found {len(images)} images to upload")
    print(f"Already mapped: {len(url_mapping)} (will skip)")
    print()

    uploaded = 0
    skipped = 0
    failed = 0

    for i, filename in enumerate(images):
        if filename in url_mapping:
            skipped += 1
            continue

        filepath = os.path.join(IMAGE_DIR, filename)
        filesize = os.path.getsize(filepath)
        mimetype = get_mimetype(filename)

        print(f"[{i+1}/{len(images)}] {filename}...", end=" ", flush=True)

        try:
            # Step 1: Get staged upload URL
            staged_data = graphql(token, """
                mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
                  stagedUploadsCreate(input: $input) {
                    stagedTargets {
                      url
                      resourceUrl
                      parameters { name value }
                    }
                    userErrors { field message }
                  }
                }
            """, {
                "input": [{
                    "resource": "FILE",
                    "filename": filename,
                    "mimeType": mimetype,
                    "httpMethod": "POST",
                    "fileSize": str(filesize),
                }]
            })

            targets = staged_data["data"]["stagedUploadsCreate"]["stagedTargets"]
            if not targets:
                errors = staged_data["data"]["stagedUploadsCreate"]["userErrors"]
                print(f"FAILED (stage: {errors})")
                failed += 1
                continue

            target = targets[0]
            staged_url = target["url"]
            resource_url = target["resourceUrl"]
            params = {p["name"]: p["value"] for p in target["parameters"]}

            # Step 2: Upload file to staged URL
            if not multipart_upload(staged_url, params, filepath):
                print("FAILED (upload)")
                failed += 1
                continue

            # Step 3: Create file in Shopify
            alt_text = filename.replace("dpo_custom_option_", "").split("_", 1)[-1].rsplit(".", 1)[0].replace("-", " ").title()
            file_data = graphql(token, """
                mutation fileCreate($files: [FileCreateInput!]!) {
                  fileCreate(files: $files) {
                    files {
                      id
                      ... on MediaImage { image { url } }
                    }
                    userErrors { field message }
                  }
                }
            """, {
                "files": [{
                    "originalSource": resource_url,
                    "filename": filename,
                    "alt": alt_text,
                }]
            })

            files = file_data["data"]["fileCreate"]["files"]
            errors = file_data["data"]["fileCreate"]["userErrors"]

            if errors:
                print(f"FAILED (create: {errors})")
                failed += 1
                continue

            file_id = files[0]["id"] if files else None

            # Step 4: Poll for final URL
            final_url = None
            if file_id:
                for attempt in range(8):
                    time.sleep(2)
                    poll = graphql(token, """
                        query getFile($id: ID!) {
                          node(id: $id) {
                            ... on MediaImage { image { url } }
                            ... on GenericFile { url }
                          }
                        }
                    """, {"id": file_id})

                    node = poll.get("data", {}).get("node", {})
                    if node.get("image", {}).get("url"):
                        final_url = node["image"]["url"]
                        break
                    elif node.get("url"):
                        final_url = node["url"]
                        break

            if final_url:
                url_mapping[filename] = final_url
                print("OK")
            elif file_id:
                url_mapping[filename] = f"PENDING:{file_id}"
                print("OK (URL pending)")
            else:
                print("FAILED")
                failed += 1
                continue

            uploaded += 1

        except Exception as e:
            print(f"ERROR: {e}")
            failed += 1

        # Save progress after each upload
        with open(MAPPING_FILE, "w") as f:
            json.dump(url_mapping, f, indent=2)

        # Rate limiting
        time.sleep(0.5)

    print()
    print("=" * 60)
    print(f"Done! Uploaded: {uploaded} | Skipped: {skipped} | Failed: {failed}")
    print(f"URL mapping saved to: swatch-url-mapping.json")
    if uploaded > 0:
        print()
        print("Next step:")
        print("  python scripts/update-swatch-urls.py")
        print("  (updates snippet files with permanent URLs)")
    print("=" * 60)


if __name__ == "__main__":
    main()
