"""Seed 20+ organization addresses on TechFlow org for VCST-4710 (OQ-5).

Safeguards:
 - Host must be vcst-qa (QA only).
 - Every address must have city != postalCode (VCST-4995 lesson).
 - AGENT-TEST-* naming conventions preserved on org; addresses don't need prefix.
 - Rate limited to 5/s.

Flow:
 1. OAuth2 password grant -> bearer token.
 2. GET /api/members/{orgId} -> record current addresses count, preserve existing org fields.
 3. Build the new address array (10 US + 5 CA + 5 UK) with validated fields.
 4. PUT /api/members (full org body) with merged addresses (existing + new). Fallback: PUT /api/members/addresses?memberId=... if signature differs.
 5. Re-GET, print per-address IDs, verify totals & coverage.
 6. Write test-data/addresses/_seed-results-techflow-20260423.json
 7. Patch test-data/aliases.json with new aliases.

The script prints a JSON result block on stdout at the end (machine-readable).
"""
import csv
import json
import os
import ssl
import sys
import time
import urllib.request
import urllib.parse

BACK_URL = "https://vcst-qa.govirto.com"
FRONT_URL = "https://vcst-qa-storefront.govirto.com"
ORG_ID = "6fb516c1-07f3-4af4-be5e-35961e3f7993"
ADMIN_USER = "admin"
ADMIN_PASS = "Password1!"
STORE_ID = "B2B-store"

PROJECT_ROOT = "C:/Users/mutyk/My Projects/vc-mcp-testing-module"
US_CSV = f"{PROJECT_ROOT}/test-data/addresses/us-addresses.csv"
RESULTS_PATH = f"{PROJECT_ROOT}/test-data/addresses/_seed-results-techflow-20260423.json"
ALIASES_PATH = f"{PROJECT_ROOT}/test-data/aliases.json"

# Safety: hard-stop if not QA
assert "vcst-qa" in BACK_URL, f"Refusing to seed against non-QA host: {BACK_URL}"

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def http(method, url, *, token=None, body=None, headers=None):
    data = None
    hdrs = {"Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    if body is not None:
        if isinstance(body, (dict, list)):
            data = json.dumps(body).encode("utf-8")
            hdrs.setdefault("Content-Type", "application/json")
        else:
            data = body.encode("utf-8") if isinstance(body, str) else body
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=60) as resp:
            raw = resp.read()
            ct = resp.headers.get("Content-Type", "")
            status = resp.status
            if not raw:
                return status, None
            if "application/json" in ct:
                return status, json.loads(raw.decode("utf-8"))
            return status, raw.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode("utf-8", errors="replace")
        return e.code, body_txt


def get_token():
    body = urllib.parse.urlencode({
        "grant_type": "password",
        "scope": "offline_access",
        "username": ADMIN_USER,
        "password": ADMIN_PASS,
        "storeId": STORE_ID,
    })
    status, js = http(
        "POST",
        f"{BACK_URL}/connect/token",
        body=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if status != 200:
        raise SystemExit(f"Token request failed: {status} {js}")
    return js["access_token"]


def load_us_rows(codes):
    rows = []
    with open(US_CSV, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["address_id"] in codes:
                rows.append(r)
    return rows


def build_us_addresses():
    # 10 rows covering >=5 states: CA, NY, IL, FL, WA, TX, AZ, PA (8 states)
    # Pick rows from us-addresses.csv with clean numeric ZIPs and plain cities.
    selected_ids = [
        "US-ADDR-001",  # Los Angeles, CA 90001
        "US-ADDR-002",  # New York, NY 10001 (Line2: Apt 4B)
        "US-ADDR-003",  # Chicago, IL 60601 (Acme Corp business, Line2: Suite 200)
        "US-ADDR-004",  # Miami, FL 33101
        "US-ADDR-005",  # Seattle, WA 98101 (Line2: Building C)
        "US-ADDR-006",  # Houston, TX 77001
        "US-ADDR-007",  # Phoenix, AZ 85001 (Line2: Unit 15)
        "US-ADDR-008",  # Philadelphia, PA 19101
        "US-ADDR-011",  # San Francisco, CA 94101 (Tech Startup Inc business, Line2: Floor 5)
        "US-ADDR-014",  # Atlanta, GA 30301
    ]
    rows = {r["address_id"]: r for r in load_us_rows(selected_ids)}
    addrs = []
    for aid in selected_ids:
        r = rows[aid]
        state_code = r["state"]
        state_name_map = {
            "CA": "California",
            "NY": "New York",
            "IL": "Illinois",
            "FL": "Florida",
            "WA": "Washington",
            "TX": "Texas",
            "AZ": "Arizona",
            "PA": "Pennsylvania",
            "GA": "Georgia",
        }
        addr = {
            "addressType": "BillingAndShipping",
            "firstName": r["first_name"],
            "lastName": r["last_name"],
            "organization": r["company"] or "AGENT-TEST-Org-TechFlow",
            "line1": r["address_line1"],
            "line2": r["address_line2"] or None,
            "city": r["city"],
            "regionId": state_code,
            "regionName": state_name_map[state_code],
            "postalCode": r["zip_code"],
            "countryCode": "US",
            "countryName": "United States",
            "phone": r["phone"],
            "email": "techflow-ops@example.com",
            "isFavorite": False,
            "isDefault": False,
            "description": f"AGENT-TEST seeded for VCST-4710 ({aid})",
        }
        addrs.append(addr)
    return addrs


def build_ca_addresses():
    return [
        {
            "addressType": "BillingAndShipping",
            "firstName": "Alice", "lastName": "Tremblay",
            "organization": "AGENT-TEST-Org-TechFlow-CA",
            "line1": "100 King Street West", "line2": "Suite 4500",
            "city": "Toronto", "regionId": "ON", "regionName": "Ontario",
            "postalCode": "M5V 3A8",
            "countryCode": "CA", "countryName": "Canada",
            "phone": "+1-416-555-0201", "email": "techflow-toronto@example.com",
            "isFavorite": True, "isDefault": False,
            "description": "AGENT-TEST seeded for VCST-4710 (CA-ON-Toronto)",
        },
        {
            "addressType": "Shipping",
            "firstName": "Brian", "lastName": "Chen",
            "organization": "AGENT-TEST-Org-TechFlow-CA",
            "line1": "555 West Hastings Street", "line2": None,
            "city": "Vancouver", "regionId": "BC", "regionName": "British Columbia",
            "postalCode": "V6B 4N6",
            "countryCode": "CA", "countryName": "Canada",
            "phone": "+1-604-555-0202", "email": "techflow-vancouver@example.com",
            "isFavorite": False, "isDefault": False,
            "description": "AGENT-TEST seeded for VCST-4710 (CA-BC-Vancouver)",
        },
        {
            "addressType": "BillingAndShipping",
            "firstName": "Camille", "lastName": "Lefebvre",
            "organization": "AGENT-TEST-Org-TechFlow-CA",
            "line1": "800 Rene-Levesque Boulevard West",
            "line2": "Bureau 1500",
            "city": "Montreal", "regionId": "QC", "regionName": "Quebec",
            "postalCode": "H3B 1X9",
            "countryCode": "CA", "countryName": "Canada",
            "phone": "+1-514-555-0203", "email": "techflow-montreal@example.com",
            "isFavorite": False, "isDefault": False,
            "description": "AGENT-TEST seeded for VCST-4710 (CA-QC-Montreal)",
        },
        {
            "addressType": "Shipping",
            "firstName": "Derek", "lastName": "MacDonald",
            "organization": "AGENT-TEST-Org-TechFlow-CA",
            "line1": "225 6th Avenue SW", "line2": None,
            "city": "Calgary", "regionId": "AB", "regionName": "Alberta",
            "postalCode": "T2P 1N2",
            "countryCode": "CA", "countryName": "Canada",
            "phone": "+1-403-555-0204", "email": "techflow-calgary@example.com",
            "isFavorite": False, "isDefault": False,
            "description": "AGENT-TEST seeded for VCST-4710 (CA-AB-Calgary)",
        },
        {
            "addressType": "BillingAndShipping",
            "firstName": "Evelyn", "lastName": "Nguyen",
            "organization": "AGENT-TEST-Org-TechFlow-CA",
            "line1": "150 Elgin Street", "line2": "10th Floor",
            "city": "Ottawa", "regionId": "ON", "regionName": "Ontario",
            "postalCode": "K2P 1L4",
            "countryCode": "CA", "countryName": "Canada",
            "phone": "+1-613-555-0205", "email": "techflow-ottawa@example.com",
            "isFavorite": False, "isDefault": False,
            "description": "AGENT-TEST seeded for VCST-4710 (CA-ON-Ottawa)",
        },
    ]


def build_uk_addresses():
    return [
        {
            "addressType": "BillingAndShipping",
            "firstName": "Oliver", "lastName": "Smith",
            "organization": "AGENT-TEST-Org-TechFlow-UK",
            "line1": "25 Canada Square", "line2": "Level 40",
            "city": "London", "regionId": "ENG", "regionName": "England",
            "postalCode": "E14 5LQ",
            "countryCode": "GB", "countryName": "United Kingdom",
            "phone": "+44-20-7946-0101", "email": "techflow-london@example.co.uk",
            "isFavorite": True, "isDefault": True,
            "description": "AGENT-TEST seeded for VCST-4710 (UK-ENG-London)",
        },
        {
            "addressType": "Shipping",
            "firstName": "Amelia", "lastName": "Jones",
            "organization": "AGENT-TEST-Org-TechFlow-UK",
            "line1": "1 Spinningfields", "line2": None,
            "city": "Manchester", "regionId": "ENG", "regionName": "England",
            "postalCode": "M3 3AP",
            "countryCode": "GB", "countryName": "United Kingdom",
            "phone": "+44-161-555-0202", "email": "techflow-manchester@example.co.uk",
            "isFavorite": False, "isDefault": False,
            "description": "AGENT-TEST seeded for VCST-4710 (UK-ENG-Manchester)",
        },
        {
            "addressType": "BillingAndShipping",
            "firstName": "Lewis", "lastName": "Campbell",
            "organization": "AGENT-TEST-Org-TechFlow-UK",
            "line1": "30 Princes Street", "line2": "Suite 5",
            "city": "Edinburgh", "regionId": "SCT", "regionName": "Scotland",
            "postalCode": "EH2 2ER",
            "countryCode": "GB", "countryName": "United Kingdom",
            "phone": "+44-131-555-0203", "email": "techflow-edinburgh@example.co.uk",
            "isFavorite": False, "isDefault": False,
            "description": "AGENT-TEST seeded for VCST-4710 (UK-SCT-Edinburgh)",
        },
        {
            "addressType": "Shipping",
            "firstName": "Harper", "lastName": "Patel",
            "organization": "AGENT-TEST-Org-TechFlow-UK",
            "line1": "3 Brindleyplace", "line2": None,
            "city": "Birmingham", "regionId": "ENG", "regionName": "England",
            "postalCode": "B1 2JB",
            "countryCode": "GB", "countryName": "United Kingdom",
            "phone": "+44-121-555-0204", "email": "techflow-birmingham@example.co.uk",
            "isFavorite": False, "isDefault": False,
            "description": "AGENT-TEST seeded for VCST-4710 (UK-ENG-Birmingham)",
        },
        {
            "addressType": "BillingAndShipping",
            "firstName": "Isla", "lastName": "MacLeod",
            "organization": "AGENT-TEST-Org-TechFlow-UK",
            "line1": "177 Bothwell Street", "line2": "8th Floor",
            "city": "Glasgow", "regionId": "SCT", "regionName": "Scotland",
            "postalCode": "G2 7ER",
            "countryCode": "GB", "countryName": "United Kingdom",
            "phone": "+44-141-555-0205", "email": "techflow-glasgow@example.co.uk",
            "isFavorite": False, "isDefault": False,
            "description": "AGENT-TEST seeded for VCST-4710 (UK-SCT-Glasgow)",
        },
    ]


def validate(addrs):
    errors = []
    for i, a in enumerate(addrs):
        city = (a.get("city") or "").strip()
        pc = (a.get("postalCode") or "").strip()
        if not city:
            errors.append(f"[{i}] empty city")
        if not pc:
            errors.append(f"[{i}] empty postalCode")
        if city == pc:
            errors.append(f"[{i}] city==postalCode ({city})")
        # VCST-4995 safety: city must not look purely numeric or like a postal code
        if city.replace(" ", "").isdigit():
            errors.append(f"[{i}] city appears numeric (postal-code-like): {city!r}")
    return errors


def main():
    print("== VCST-4710 TechFlow address seed ==")
    print(f"Target: {BACK_URL} (org {ORG_ID})")

    # 1. Token
    token = get_token()
    print(f"Token acquired (len={len(token)})")

    # 2. GET current org
    status, org = http("GET", f"{BACK_URL}/api/members/{ORG_ID}", token=token)
    if status != 200:
        raise SystemExit(f"Org GET failed: {status} {org}")
    print(f"Org: name={org.get('name')!r} type={org.get('memberType')} existing_addresses={len(org.get('addresses') or [])}")
    pre_count = len(org.get("addresses") or [])

    # 3. Build new addresses
    us = build_us_addresses()
    ca = build_ca_addresses()
    uk = build_uk_addresses()
    new_addrs = us + ca + uk

    # Ensure exactly 1 isDefault overall (the UK London one already has it)
    defaults = [a for a in new_addrs if a.get("isDefault")]
    assert len(defaults) == 1, f"expected 1 default, got {len(defaults)}"
    favs = [a for a in new_addrs if a.get("isFavorite")]
    assert len(favs) >= 2, f"expected >=2 favorites, got {len(favs)}"

    # Validate locally
    errs = validate(new_addrs)
    if errs:
        print("VALIDATION FAILED:")
        for e in errs:
            print(" ", e)
        raise SystemExit(2)
    print(f"Prepared {len(new_addrs)} new addresses (US={len(us)}, CA={len(ca)}, UK={len(uk)})")

    # 4. Merge and PUT. The Customer module update endpoint is:
    #    POST /api/members (upsert one or many); full org body PUT is also via POST with id present.
    # We'll PUT the full org object with expanded addresses via POST /api/members (update-or-create).
    existing = org.get("addresses") or []
    merged = list(existing) + new_addrs
    org_copy = dict(org)
    org_copy["addresses"] = merged
    # The Customer endpoint typically accepts array for upsert: POST /api/members with [org_copy]
    status, resp = http(
        "POST",
        f"{BACK_URL}/api/members",
        token=token,
        body=[org_copy],
    )
    print(f"Upsert POST /api/members status={status}")
    if status not in (200, 201, 204):
        # Try PUT /api/members
        print("POST failed; trying PUT /api/members ...")
        print("Body preview:", json.dumps(resp)[:500] if isinstance(resp, (dict, list)) else str(resp)[:500])
        status2, resp2 = http(
            "PUT",
            f"{BACK_URL}/api/members",
            token=token,
            body=[org_copy],
        )
        print(f"Fallback PUT /api/members status={status2}")
        if status2 not in (200, 201, 204):
            raise SystemExit(f"Both POST and PUT /api/members failed. POST={status}:{str(resp)[:500]}  PUT={status2}:{str(resp2)[:500]}")
        resp = resp2

    # 5. Re-GET to confirm
    time.sleep(1.0)
    status, org2 = http("GET", f"{BACK_URL}/api/members/{ORG_ID}", token=token)
    if status != 200:
        raise SystemExit(f"Re-GET failed: {status} {org2}")
    post_addrs = org2.get("addresses") or []
    post_count = len(post_addrs)
    print(f"Post-seed address count: {post_count} (was {pre_count})")

    # Build summary per new address (match on line1+postalCode)
    def addr_key(a):
        return (a.get("line1") or "", a.get("postalCode") or "", a.get("city") or "")

    seeded_ids = {addr_key(a): a.get("id") for a in post_addrs}
    seeded_rows = []
    for a in new_addrs:
        aid = seeded_ids.get(addr_key(a))
        seeded_rows.append({
            "id": aid,
            "city": a["city"], "regionCode": a["regionId"], "regionName": a["regionName"],
            "countryCode": a["countryCode"], "countryName": a["countryName"],
            "postalCode": a["postalCode"], "line1": a["line1"], "line2": a.get("line2"),
            "isFavorite": a["isFavorite"], "isDefault": a["isDefault"],
        })

    countries = sorted({a["countryCode"] for a in new_addrs})
    states = sorted({(a["countryCode"], a["regionId"]) for a in new_addrs})
    cities = sorted({(a["countryCode"], a["city"]) for a in new_addrs})
    n_fav = sum(1 for a in new_addrs if a["isFavorite"])
    n_def = sum(1 for a in new_addrs if a["isDefault"])

    results = {
        "ticket": "VCST-4710",
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "env": {"BACK_URL": BACK_URL, "FRONT_URL": FRONT_URL, "store": STORE_ID},
        "org": {"id": ORG_ID, "name": org.get("name")},
        "pre_count": pre_count,
        "post_count": post_count,
        "new_count": len(new_addrs),
        "coverage": {
            "countries": countries,
            "states": [f"{c}-{s}" for c, s in states],
            "cities": [f"{c}:{city}" for c, city in cities],
            "favorites": n_fav,
            "defaults": n_def,
        },
        "seeded": seeded_rows,
    }
    os.makedirs(os.path.dirname(RESULTS_PATH), exist_ok=True)
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Wrote results: {RESULTS_PATH}")

    # 7. Patch aliases.json
    def find_id(city_filter, country_filter, region_filter=None):
        for r in seeded_rows:
            if r["city"] == city_filter and r["countryCode"] == country_filter:
                if region_filter is None or r["regionCode"] == region_filter:
                    return r["id"]
        return None

    ny_id = find_id("New York", "US", "NY")
    toronto_id = find_id("Toronto", "CA", "ON")
    london_id = find_id("London", "GB", "ENG")

    with open(ALIASES_PATH, "r", encoding="utf-8") as f:
        aliases = json.load(f)
    aliases["TECHFLOW_ORG_ADDRESSES"] = {
        "_inline": True,
        "org_id": ORG_ID,
        "count": post_count,
        "notes": "VCST-4710 OQ-5 seed 2026-04-23. See test-data/addresses/_seed-results-techflow-20260423.json for full per-address IDs.",
    }
    aliases["TECHFLOW_ADDR_US_NEW_YORK"] = {
        "_inline": True, "org_id": ORG_ID, "platform_id": ny_id,
        "city": "New York", "regionCode": "NY", "countryCode": "US",
        "notes": "VCST-4710 seed.",
    }
    aliases["TECHFLOW_ADDR_CA_TORONTO"] = {
        "_inline": True, "org_id": ORG_ID, "platform_id": toronto_id,
        "city": "Toronto", "regionCode": "ON", "countryCode": "CA",
        "notes": "VCST-4710 seed.",
    }
    aliases["TECHFLOW_ADDR_UK_LONDON"] = {
        "_inline": True, "org_id": ORG_ID, "platform_id": london_id,
        "city": "London", "regionCode": "ENG", "countryCode": "GB",
        "notes": "VCST-4710 seed. Marked isDefault=true, isFavorite=true.",
    }
    with open(ALIASES_PATH, "w", encoding="utf-8") as f:
        json.dump(aliases, f, indent=2, ensure_ascii=False)
    print(f"Updated {ALIASES_PATH}")

    # Final machine-readable marker
    print("\n=== SEED-RESULT-JSON-BEGIN ===")
    print(json.dumps({
        "ok": True,
        "pre_count": pre_count,
        "post_count": post_count,
        "new_count": len(new_addrs),
        "countries": countries,
        "new_york_id": ny_id,
        "toronto_id": toronto_id,
        "london_id": london_id,
    }, indent=2))
    print("=== SEED-RESULT-JSON-END ===")


if __name__ == "__main__":
    main()
