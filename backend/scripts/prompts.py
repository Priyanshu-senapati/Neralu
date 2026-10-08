"""Call prompt texts per language (plan §7.3). Each key becomes static/audio/<lang>/<key>.mp3.

English and Hindi use Sarvam's Indian voices, which say Indian words correctly as written.
If English is generated with Kokoro instead (--kokoro), en() pins pronunciations with
[word](/phonemes/), since Kokoro would otherwise say e.g. Mallige as "malij".
Kannada lines are to be written and recorded by a native speaker (plan §7.3), not generated here.
Have a native speaker review every non-English line before the demo.
"""

EN_WORDS = {
    "Namaskara": "nʌməskˈɑɹə", "Neralu": "nˈɛɹəlu", "Kamala": "kˈʌmələ", "avare": "ˈʌvʌɹA",
    "Aadhaar": "ˈɑdɑɹ", "Mallige": "mˈʌlɪɡA", "Sampige": "sˈʌmpɪɡA", "Sevanthige": "sˈAvʌntɪɡA",
    "Tulasi": "tˈulʌsi", "Maavu": "mˈɑvu", "Bevu": "bˈAvu", "Kaveri": "kˈɑvAɹi",
    "Chandra": "ʧˈʌndɹə", "Nakshatra": "nˈʌkʃʌtɹə", "Gulabi": "ɡulˈɑbi",
}


def en(text: str) -> str:
    """Wrap every Indian word in Kokoro's explicit-pronunciation markup."""
    for word, phonemes in EN_WORDS.items():
        text = text.replace(word, f"[{word}](/{phonemes}/)")
    return text


EN = {
    "greet": "Namaskara. This is Neralu, the heat care service from your ward office.",
    "name_kamala": "Kamala avare,",
    "code_intro": "Your family's code word is:",
    "safety": "Neralu will never ask for money, OTP, Aadhaar or bank details.",
    "q_water": "Have you had water in the last hour? Press 1 for yes, 2 for no.",
    "q_symptoms": "Do you feel dizzy, weak or confused? Press 1 for yes, 2 for no.",
    "q_room": "Is your room very hot right now? Press 1 for yes, 2 for no.",
    "q_fan": "Is your fan or cooler working? Press 1 for yes, 2 for no.",
    "q_orientation": "Please tell me, what day is it today?",
    "q_day_keypad": "Which day is it today? Press 1 for Monday, 2 for Tuesday, 3 for Wednesday, "
                    "4 for Thursday, 5 for Friday, 6 for Saturday, 7 for Sunday.",
    "q_help": "If you need help now, press 2. If you are okay, press 1.",
    "reprompt": "Sorry, I didn't catch that.",
    "advice": "Please drink a glass of water now, and stay in the coolest part of your home.",
    "close_ok": "Thank you. We will check on you again later today.",
    "close_help": "Thank you. Someone from your area is being informed now.",
    "code_mallige": "Mallige.", "code_sampige": "Sampige.", "code_sevanthige": "Sevanthige.",
    "code_tulasi": "Tulasi.", "code_maavu": "Maavu.", "code_bevu": "Bevu.",
    "code_kaveri": "Kaveri.", "code_chandra": "Chandra.", "code_nakshatra": "Nakshatra.",
    "code_gulabi": "Gulabi.",
}

HI = {
    "greet": "नमस्ते। यह नेरलु है, आपके वार्ड ऑफ़िस की गर्मी में देखभाल सेवा।",
    "name_kamala": "कमला जी,",
    "code_intro": "आपके परिवार का कोड शब्द है:",
    "safety": "नेरलु कभी भी पैसे, ओटीपी, आधार या बैंक की जानकारी नहीं माँगेगा।",
    "q_water": "क्या आपने पिछले एक घंटे में पानी पिया है? हाँ के लिए 1 दबाइए, नहीं के लिए 2।",
    "q_symptoms": "क्या आपको चक्कर, कमज़ोरी या उलझन महसूस हो रही है? हाँ के लिए 1 दबाइए, नहीं के लिए 2।",
    "q_room": "क्या इस समय आपका कमरा बहुत गरम है? हाँ के लिए 1 दबाइए, नहीं के लिए 2।",
    "q_fan": "क्या आपका पंखा या कूलर चल रहा है? हाँ के लिए 1 दबाइए, नहीं के लिए 2।",
    "q_orientation": "कृपया बताइए, आज कौन सा दिन है?",
    "q_day_keypad": "आज कौन सा दिन है? सोमवार के लिए 1, मंगलवार के लिए 2, बुधवार के लिए 3, "
                    "गुरुवार के लिए 4, शुक्रवार के लिए 5, शनिवार के लिए 6, रविवार के लिए 7 दबाइए।",
    "q_help": "अगर आपको अभी मदद चाहिए तो 2 दबाइए। अगर आप ठीक हैं तो 1 दबाइए।",
    "reprompt": "माफ़ कीजिए, मैं समझ नहीं पाई।",
    "advice": "कृपया अभी एक गिलास पानी पीजिए, और घर की सबसे ठंडी जगह में रहिए।",
    "close_ok": "धन्यवाद। हम आज बाद में फिर से आपका हाल पूछेंगे।",
    "close_help": "धन्यवाद। आपके इलाके के किसी व्यक्ति को अभी सूचना दी जा रही है।",
    "code_mallige": "मल्लिगे।", "code_sampige": "संपिगे।", "code_sevanthige": "सेवंतिगे।",
    "code_tulasi": "तुलसी।", "code_maavu": "मावु।", "code_bevu": "बेवु।",
    "code_kaveri": "कावेरी।", "code_chandra": "चंद्र।", "code_nakshatra": "नक्षत्र।",
    "code_gulabi": "गुलाबी।",
}
