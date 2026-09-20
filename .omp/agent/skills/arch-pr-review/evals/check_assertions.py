#!/usr/bin/env python3
"""Score the scriptable assertions for a arch-pr-review eval run.

Usage: python check_assertions.py <run_dir>
where <run_dir> holds outputs/findings.json, outputs/review.md, outputs/fixes.diff
"""
import json
import re
import sys
from pathlib import Path

REQUIRED_FIELDS = ["file", "line", "summary", "short_summary", "failure_scenario", "category"]
RULE_SOURCES = [".coderabbit.yaml", ".ai/knowledge", "CLAUDE.md", "CLAUDE.local.md", "review-rules"]
arch_CATEGORIES = {
    "architecture",
    "conventions",
    "convention",
    "a11y",
    "accessibility",
    "i18n",
    "test-coverage",
    "tests",
    "testing",
    "cqrs",
}


def load_findings(run_dir):
    path = run_dir / "outputs" / "findings.json"
    result = []
    if path.exists():
        raw = json.loads(path.read_text())
        if isinstance(raw, dict):
            raw = raw.get("findings", [])
        result = raw
    return result


def read_text(run_dir, name):
    path = run_dir / "outputs" / name
    result = ""
    if path.exists():
        result = path.read_text()
    return result


def check_required_fields(findings):
    missing = []
    for index, finding in enumerate(findings):
        for field in REQUIRED_FIELDS:
            if field not in finding or finding[field] in (None, ""):
                missing.append(f"finding[{index}] missing {field}")
    passed = len(findings) > 0 and len(missing) == 0
    return passed, "; ".join(missing[:6]) or f"{len(findings)} findings, all fields present"


def check_short_summary(findings):
    over = []
    for index, finding in enumerate(findings):
        value = finding.get("short_summary") or ""
        if len(value) > 60:
            over.append(f"finding[{index}] is {len(value)} chars")
    passed = len(findings) > 0 and len(over) == 0
    return passed, "; ".join(over[:6]) or "all short_summary values within 60 chars"


def check_cites_rule_source(findings, review):
    blob = json.dumps(findings) + review
    hits = [source for source in RULE_SOURCES if source in blob]
    passed = len(hits) > 0
    return passed, f"cited: {', '.join(hits)}" if hits else "no arch rule source named anywhere"


def check_arch_category(findings):
    found = set()
    for finding in findings:
        category = (finding.get("category") or "").lower()
        if category in arch_CATEGORIES:
            found.add(category)
    passed = len(found) > 0
    return passed, f"arch categories present: {', '.join(sorted(found))}" if found else "only generic categories"


def check_fix_style(run_dir):
    diff = read_text(run_dir, "fixes.diff")
    added = [line[1:] for line in diff.splitlines() if line.startswith("+") and not line.startswith("+++")]
    offenders = []
    for line in added:
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*") and stripped.endswith("*/"):
            offenders.append(f"comment: {stripped[:60]}")
        if re.match(r"^return\b", stripped) and "}" not in stripped:
            pass
        if re.search(r"\?[^?:]{1,80}:", stripped) and "??" not in stripped and "://" not in stripped:
            offenders.append(f"ternary: {stripped[:60]}")
    passed = len(offenders) == 0
    detail = "; ".join(offenders[:6])
    if not diff.strip():
        detail = "no fixes applied (vacuously clean)"
    return passed, detail or "no comments or ternaries added"


def check_skip_reasons(findings, review):
    skipped = [f for f in findings if (f.get("outcome") or "").lower() == "skipped"]
    missing = []
    for index, finding in enumerate(skipped):
        has_field = bool(finding.get("skip_reason") or finding.get("reason"))
        labels = [finding.get("short_summary") or "", finding.get("summary") or ""]
        in_review = any(label and label in review for label in labels)
        if not has_field and not in_review:
            missing.append(f"skipped finding[{index}] has no stated reason")
    passed = len(missing) == 0
    detail = "; ".join(missing[:6])
    if not skipped:
        detail = "no findings were skipped"
    return passed, detail or f"{len(skipped)} skipped findings all carry reasons"


def main():
    run_dir = Path(sys.argv[1])
    findings = load_findings(run_dir)
    review = read_text(run_dir, "review.md")

    checks = [
        ("findings_have_required_fields", check_required_fields(findings)),
        ("short_summary_within_60_chars", check_short_summary(findings)),
        ("cites_arch_rule_source", check_cites_rule_source(findings, review)),
        ("catches_architecture_or_convention_defect", check_arch_category(findings)),
        ("fixes_respect_repo_style", check_fix_style(run_dir)),
        ("skipped_findings_have_reasons", check_skip_reasons(findings, review)),
    ]

    results = []
    for name, (passed, evidence) in checks:
        results.append({"text": name, "passed": passed, "evidence": evidence})
        mark = "PASS" if passed else "FAIL"
        print(f"{mark}  {name}  --  {evidence}")

    print(f"\n{sum(1 for r in results if r['passed'])}/{len(results)} scriptable assertions passed")
    out = run_dir / "grading_scripted.json"
    out.write_text(json.dumps({"expectations": results}, indent=2))


main()
