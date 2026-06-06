import subprocess, json, os, base64

def run(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()

u = run("/usr/local/bin/xray uuid")
keys = run("/usr/local/bin/xray x25519")
lines = keys.split("\n")
priv = [l.split(": ")[1] for l in lines if "PrivateKey:" in l][0]
pub = [l.split(": ")[1] for l in lines if "PublicKey:" in l][0]
short_id = base64.b64encode(os.urandom(8)).decode()[:8]

config = {
    "log": {"loglevel": "warning"},
    "inbounds": [{
        "port": 443,
        "protocol": "vless",
        "settings": {
            "clients": [{"id": u, "flow": "xtls-rprx-vision"}],
            "decryption": "none"
        },
        "streamSettings": {
            "network": "tcp",
            "security": "reality",
            "realitySettings": {
                "dest": "www.microsoft.com:443",
                "serverNames": ["www.microsoft.com", "microsoft.com"],
                "privateKey": priv,
                "shortIds": [short_id]
            }
        }
    }],
    "outbounds": [{"protocol": "freedom", "tag": "direct"}]
}

with open("/usr/local/etc/xray/config.json", "w") as f:
    json.dump(config, f, indent=2)

run("iptables -A INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null")
run("systemctl enable xray 2>/dev/null")
run("systemctl restart xray 2>/dev/null || /usr/local/bin/xray run -config /usr/local/etc/xray/config.json &")

import time; time.sleep(2)

print("=== STATUS ===")
print(run("ss -tlnp | grep 443"))
print("")
print("=== CLIENT CONFIG ===")
print("Protocol: VLESS + XTLS-Vision + Reality")
print("Address: 97.64.24.114")
print("Port: 443")
print(f"UUID: {u}")
print("Flow: xtls-rprx-vision")
print("Encryption: none")
print("SNI: www.microsoft.com")
print("Fingerprint: chrome")
print(f"PublicKey: {pub}")
print(f"ShortId: {short_id}")
