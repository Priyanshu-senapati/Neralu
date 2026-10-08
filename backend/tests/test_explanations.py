"""Every rule the engine can emit has a plain-English explanation, and impact counts human outcomes."""
import itertools

from app.rules import EXPLANATIONS, Signals, classify, explain

ANSWERS = ("yes", "no", "none")


def test_every_reachable_rule_is_explained():
    seen = set()
    for w, sy, r, f in itertools.product(ANSWERS, repeat=4):
        for o in ("correct", "wrong", "uncertain", "none"):
            for sr in ("ok", "help", "none"):
                v = classify(Signals(w, sy, r, f, o, sr))
                seen.add(v.rule_id)
                if v.needs_support:
                    seen.add("S1")
    assert seen <= set(EXPLANATIONS), seen - set(EXPLANATIONS)


def test_escalation_rules_are_explained():
    for rule_id in ("E1", "E3"):
        assert explain(rule_id)
    assert explain(None) is None and explain("ZZ") is None


def test_explanations_never_claim_the_system_calls_emergency_services():
    for text in EXPLANATIONS.values():
        assert "108" not in text and "ambulance" not in text.lower()
