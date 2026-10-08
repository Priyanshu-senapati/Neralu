from app.rules import Outcome, Signals, classify


def sig(**kw) -> Signals:
    base = dict(
        water="yes", symptoms="no", room_hot="no", fan_working="yes",
        orientation="correct", self_report="ok",
    )
    base.update(kw)
    return Signals(**base)


def check(signals, outcome, rule_id):
    v = classify(signals)
    assert (v.outcome, v.rule_id) == (outcome, rule_id)
    return v


def test_r0_all_none_is_unreached():
    s = sig(water="none", symptoms="none", room_hot="none", fan_working="none",
            orientation="none", self_report="none")
    v = check(s, Outcome.UNREACHED, "R0")
    assert v.reason == "No valid answer on the call"


def test_r0_wins_even_if_help_pressed():
    # Zero keypad answers to the four questions means we never really reached them.
    s = sig(water="none", symptoms="none", room_hot="none", fan_working="none",
            self_report="help")
    check(s, Outcome.UNREACHED, "R0")


def test_help_overrides_everything():
    s = Signals(water="yes", symptoms="no", room_hot="no", fan_working="yes",
                orientation="correct", self_report="help")
    check(s, Outcome.RED, "R1")


def test_symptoms_and_confusion_is_red():
    check(sig(symptoms="yes", orientation="wrong"), Outcome.RED, "R2")
    check(sig(symptoms="yes", orientation="uncertain"), Outcome.RED, "R2")


def test_symptoms_and_no_water_is_red():
    check(sig(symptoms="yes", water="no"), Outcome.RED, "R3")


def test_r4_symptoms_is_amber():
    v = check(sig(symptoms="yes"), Outcome.AMBER, "R4")
    assert v.reason == "Reported dizziness, weakness or confusion"


def test_self_report_ok_does_not_override_symptoms():
    check(sig(symptoms="yes", self_report="ok"), Outcome.AMBER, "R4")


def test_r5_wrong_day_is_amber():
    check(sig(orientation="wrong"), Outcome.AMBER, "R5")


def test_r6_no_water_is_amber():
    check(sig(water="no"), Outcome.AMBER, "R6")


def test_orientation_none_is_amber():
    check(sig(orientation="none"), Outcome.AMBER, "R7")
    check(sig(orientation="uncertain"), Outcome.AMBER, "R7")


def test_two_missing_is_amber():
    check(sig(room_hot="none", fan_working="none"), Outcome.AMBER, "R8")


def test_one_missing_is_still_green():
    check(sig(fan_working="none"), Outcome.GREEN, "R9")


def test_r9_all_fine_is_green():
    v = check(sig(), Outcome.GREEN, "R9")
    assert v.needs_support is False
    assert v.reason == "All checks fine"


def test_hot_room_broken_fan_sets_support_independently():
    v = check(sig(room_hot="yes", fan_working="no"), Outcome.GREEN, "R9")
    assert v.needs_support is True


def test_support_flag_alongside_red():
    v = check(sig(self_report="help", room_hot="yes", fan_working="no"), Outcome.RED, "R1")
    assert v.needs_support is True
