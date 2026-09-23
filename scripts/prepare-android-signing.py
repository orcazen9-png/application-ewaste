"""Load the persistent CI signing secret without exposing it in logs."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def prepare():
    raw = os.environ.get("ANDROID_SIGNING_JSON", "")
    if not raw:
        raise ValueError("Repository secret ANDROID_SIGNING_JSON is required; no replacement key will be generated")
    settings = json.loads(raw)
    password, alias = settings["password"], settings["alias"]
    if not isinstance(password, str) or not password or any(c in password for c in "\r\n"):
        raise ValueError("Invalid signing password")
    if alias != "collector":
        raise ValueError("Unexpected signing alias")
    # Register the decoded password too: GitHub only automatically masks the full JSON.
    print("::add-mask::" + password.replace("%", "%25"), flush=True)
    store = Path(os.environ["RUNNER_TEMP"]) / "ewaste-collector-release.p12"
    store.write_bytes(base64.b64decode(settings["keystore"], validate=True))
    store.chmod(0o600)
    child_env = dict(os.environ, EWASTE_SIGNING_PASSWORD=password)
    result = subprocess.run([
        "keytool", "-exportcert", "-keystore", str(store), "-storetype", "PKCS12",
        "-storepass:env", "EWASTE_SIGNING_PASSWORD", "-alias", alias,
    ], env=child_env, capture_output=True)
    if result.returncode:
        raise ValueError("Cannot open the signing key; check the repository secret")
    expected = Path("native-android/signing-certificate.sha256").read_text().strip().lower()
    if hashlib.sha256(result.stdout).hexdigest() != expected:
        raise ValueError("Signing certificate does not match the committed fingerprint")
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as output:
        for name, value in {
            "EWASTE_SIGNING_STORE": str(store),
            "EWASTE_SIGNING_PASSWORD": password,
            "EWASTE_SIGNING_ALIAS": alias,
        }.items():
            output.write(name + "=" + value + "\n")
    print("Persistent Android signing certificate verified")


if __name__ == "__main__":
    try:
        prepare()
    except Exception:
        # Avoid echoing any secret fragments from decoding or subprocess errors.
        print("::error::Android signing setup failed. Check ANDROID_SIGNING_JSON and the pinned certificate.", file=sys.stderr)
        sys.exit(1)
