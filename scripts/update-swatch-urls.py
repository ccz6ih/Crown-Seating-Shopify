"""
Update swatch snippet files with new permanent Shopify CDN URLs.

Run this AFTER upload-swatches-to-shopify.py has completed.

Usage:
  python scripts/update-swatch-urls.py

Reads swatch-url-mapping.json and replaces old DPO asset URLs
in the crown-colors-*.liquid snippet files with new permanent URLs.
"""

import os
import json
import re

ROOT = os.path.dirname(os.path.dirname(__file__))
MAPPING_FILE = os.path.join(ROOT, "swatch-url-mapping.json")
SNIPPETS_DIR = os.path.join(ROOT, "snippets")

SNIPPET_FILES = [
    "crown-colors-medical-grade-vinyl.liquid",
    "crown-colors-ultra-leather.liquid",
    "crown-colors-silvertex.liquid",
    "crown-colors-stakleen.liquid",
]


def build_old_to_new_map(url_mapping):
    """Build a mapping from old CDN URLs to new permanent URLs."""
    # We need to match the old URLs in snippet files to filenames
    # Old URL pattern: https://cdn.shopify.com/.../dpo_custom_option_XXXXX_name.ext?v=...
    old_to_new = {}

    # Read all snippet files to find old URLs
    for snippet_file in SNIPPET_FILES:
        filepath = os.path.join(SNIPPETS_DIR, snippet_file)
        if not os.path.exists(filepath):
            continue

        with open(filepath) as f:
            content = f.read()

        # Find all CDN URLs in the file
        urls = re.findall(r'https://cdn\.shopify\.com/[^"]+', content)
        for url in urls:
            # Extract the filename part
            match = re.search(r'(dpo_custom_option_\d+_[^?]+)', url)
            if match:
                filename = match.group(1)
                if filename in url_mapping:
                    new_url = url_mapping[filename]
                    if not new_url.startswith("PENDING:"):
                        old_to_new[url] = new_url

    return old_to_new


def main():
    if not os.path.exists(MAPPING_FILE):
        print("Error: swatch-url-mapping.json not found.")
        print("Run upload-swatches-to-shopify.py first.")
        return

    with open(MAPPING_FILE) as f:
        url_mapping = json.load(f)

    pending = sum(1 for v in url_mapping.values() if v.startswith("PENDING:"))
    if pending:
        print(f"Warning: {pending} files still have pending URLs.")
        print("Some URLs may not be updated yet.\n")

    old_to_new = build_old_to_new_map(url_mapping)
    print(f"Found {len(old_to_new)} URL replacements to make\n")

    total_replacements = 0

    for snippet_file in SNIPPET_FILES:
        filepath = os.path.join(SNIPPETS_DIR, snippet_file)
        if not os.path.exists(filepath):
            print(f"Skipping {snippet_file} (not found)")
            continue

        with open(filepath) as f:
            content = f.read()

        original = content
        replacements = 0

        for old_url, new_url in old_to_new.items():
            if old_url in content:
                content = content.replace(old_url, new_url)
                replacements += 1

        if content != original:
            with open(filepath, "w") as f:
                f.write(content)
            print(f"Updated {snippet_file}: {replacements} URLs replaced")
            total_replacements += replacements
        else:
            print(f"No changes needed in {snippet_file}")

    print(f"\nTotal: {total_replacements} URLs updated across all files")
    if total_replacements > 0:
        print("Don't forget to commit and push the updated snippets!")


if __name__ == "__main__":
    main()
