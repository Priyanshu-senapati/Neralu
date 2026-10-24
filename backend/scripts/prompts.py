"""Call prompt texts per language (plan §7.3). Each key becomes static/audio/<lang>/<key>.mp3.

English and Hindi use Sarvam's Indian voices, which say Indian words correctly as written.
If English is generated with Kokoro instead (--kokoro), en() pins pronunciations with
[word](/phonemes/), since Kokoro would otherwise say e.g. Mallige as "malij".
Kannada uses Sarvam's Kannada voice as a stopgap. Plan §7.3 wants native-speaker recordings: a native
Kannada speaker must review KN below (and ideally record it, same file names) before the demo.
Have a native speaker review every non-English line before the demo.

"lang_menu" is the language menu at the start of each call; every language says its own option.
"cg_*" / "q_cg_*" are the caregiver check: people with memory difficulty are checked through their
caregiver. Until these clips are generated, calls speak the English text instead (telephony.py).
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
    "lang_menu": "For English, press 3.",
    "cg_intro": "We are calling about the person in your care who is registered with Neralu.",
    "q_cg_seen": "Are you with them now, or have you seen them in the last hour? Press 1 for yes, 2 for no.",
    "q_cg_water": "Have they had water in the last hour? Press 1 for yes, 2 for no.",
    "q_cg_unwell": "Do they seem more confused, drowsy or unwell than usual? Press 1 for yes, 2 for no.",
    "q_cg_room": "Is their room very hot, with no fan or cooler working? Press 1 for yes, 2 for no.",
    "q_cg_help": "If they need help now, press 2. If they are okay, press 1.",
    "cg_advice_check": "Please go and see them in person now.",
    "cg_advice_water": "Please give them a glass of water now, and keep them in the coolest part of the home.",
    "cg_close_ok": "Thank you. We will call you again later today.",
    "cg_close_help": "Thank you. Someone from your area is being informed now. "
                     "If they cannot be woken, or they collapse, call 108.",
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
    "lang_menu": "हिंदी के लिए 2 दबाइए।",
    "cg_intro": "हम आपकी देखरेख में रहने वाले उस व्यक्ति के बारे में फ़ोन कर रहे हैं, जो नेरलु में पंजीकृत हैं।",
    "q_cg_seen": "क्या आप अभी उनके साथ हैं, या पिछले एक घंटे में आपने उन्हें देखा है? हाँ के लिए 1 दबाइए, नहीं के लिए 2।",
    "q_cg_water": "क्या उन्होंने पिछले एक घंटे में पानी पिया है? हाँ के लिए 1 दबाइए, नहीं के लिए 2।",
    "q_cg_unwell": "क्या वे आम दिनों से ज़्यादा उलझन में, सुस्त या बीमार लग रहे हैं? हाँ के लिए 1 दबाइए, नहीं के लिए 2।",
    "q_cg_room": "क्या उनका कमरा बहुत गरम है, और कोई पंखा या कूलर नहीं चल रहा? हाँ के लिए 1 दबाइए, नहीं के लिए 2।",
    "q_cg_help": "अगर उन्हें अभी मदद चाहिए तो 2 दबाइए। अगर वे ठीक हैं तो 1 दबाइए।",
    "cg_advice_check": "कृपया अभी जाकर उन्हें खुद देखिए।",
    "cg_advice_water": "कृपया उन्हें अभी एक गिलास पानी पिलाइए, और उन्हें घर की सबसे ठंडी जगह में रखिए।",
    "cg_close_ok": "धन्यवाद। हम आज बाद में आपको फिर फ़ोन करेंगे।",
    "cg_close_help": "धन्यवाद। आपके इलाके के किसी व्यक्ति को अभी सूचना दी जा रही है। "
                     "अगर वे जाग न पाएँ या गिर पड़ें, तो 108 पर फ़ोन कीजिए।",
    "code_mallige": "मल्लिगे।", "code_sampige": "संपिगे।", "code_sevanthige": "सेवंतिगे।",
    "code_tulasi": "तुलसी।", "code_maavu": "मावु।", "code_bevu": "बेवु।",
    "code_kaveri": "कावेरी।", "code_chandra": "चंद्र।", "code_nakshatra": "नक्षत्र।",
    "code_gulabi": "गुलाबी।",
}

# Needs native Kannada review before the demo (plan §7.3).
KN = {
    "greet": "ನಮಸ್ಕಾರ. ಇದು ನೆರಳು, ನಿಮ್ಮ ವಾರ್ಡ್ ಕಚೇರಿಯ ಬಿಸಿಗಾಳಿ ಆರೈಕೆ ಸೇವೆ.",
    "name_kamala": "ಕಮಲ ಅವರೇ,",
    "code_intro": "ನಿಮ್ಮ ಮನೆಯವರು ಆರಿಸಿದ ಸಂಕೇತ ಪದ:",
    "safety": "ನೆರಳು ಯಾವತ್ತೂ ಹಣ, ಓಟಿಪಿ, ಆಧಾರ್ ಅಥವಾ ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಕೇಳುವುದಿಲ್ಲ.",
    "q_water": "ಕಳೆದ ಒಂದು ಗಂಟೆಯಲ್ಲಿ ನೀರು ಕುಡಿದಿದ್ದೀರಾ? ಹೌದು ಎಂದರೆ 1 ಒತ್ತಿ, ಇಲ್ಲ ಎಂದರೆ 2 ಒತ್ತಿ.",
    "q_symptoms": "ನಿಮಗೆ ತಲೆ ಸುತ್ತು, ಸುಸ್ತು ಅಥವಾ ಗೊಂದಲ ಆಗುತ್ತಿದೆಯಾ? ಹೌದು ಎಂದರೆ 1, ಇಲ್ಲ ಎಂದರೆ 2 ಒತ್ತಿ.",
    "q_room": "ಈಗ ನಿಮ್ಮ ಕೋಣೆ ತುಂಬಾ ಬಿಸಿಯಾಗಿದೆಯಾ? ಹೌದು ಎಂದರೆ 1, ಇಲ್ಲ ಎಂದರೆ 2 ಒತ್ತಿ.",
    "q_fan": "ನಿಮ್ಮ ಫ್ಯಾನ್ ಅಥವಾ ಕೂಲರ್ ಕೆಲಸ ಮಾಡುತ್ತಿದೆಯಾ? ಹೌದು ಎಂದರೆ 1, ಇಲ್ಲ ಎಂದರೆ 2 ಒತ್ತಿ.",
    "q_orientation": "ದಯವಿಟ್ಟು ಹೇಳಿ, ಇವತ್ತು ಯಾವ ವಾರ?",
    "q_day_keypad": "ಇವತ್ತು ಯಾವ ವಾರ? ಸೋಮವಾರ 1, ಮಂಗಳವಾರ 2, ಬುಧವಾರ 3, ಗುರುವಾರ 4, "
                    "ಶುಕ್ರವಾರ 5, ಶನಿವಾರ 6, ಭಾನುವಾರ 7 ಒತ್ತಿ.",
    "q_help": "ನಿಮಗೆ ಈಗಲೇ ಸಹಾಯ ಬೇಕಿದ್ದರೆ 2 ಒತ್ತಿ. ನೀವು ಚೆನ್ನಾಗಿದ್ದರೆ 1 ಒತ್ತಿ.",
    "reprompt": "ಕ್ಷಮಿಸಿ, ನನಗೆ ಸರಿಯಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ.",
    "advice": "ದಯವಿಟ್ಟು ಈಗಲೇ ಒಂದು ಲೋಟ ನೀರು ಕುಡಿಯಿರಿ, ಮತ್ತು ಮನೆಯ ತಣ್ಣಗಿರುವ ಜಾಗದಲ್ಲಿ ಇರಿ.",
    "close_ok": "ಧನ್ಯವಾದಗಳು. ಇವತ್ತು ಮತ್ತೆ ನಿಮ್ಮನ್ನು ವಿಚಾರಿಸುತ್ತೇವೆ.",
    "close_help": "ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಹತ್ತಿರದ ಒಬ್ಬರಿಗೆ ಈಗಲೇ ತಿಳಿಸುತ್ತಿದ್ದೇವೆ.",
    "lang_menu": "ಕನ್ನಡಕ್ಕಾಗಿ 1 ಒತ್ತಿ.",
    "cg_intro": "ನೆರಳು ಸೇವೆಯಲ್ಲಿ ನೋಂದಾಯಿಸಿರುವ, ನಿಮ್ಮ ಆರೈಕೆಯಲ್ಲಿರುವ ವ್ಯಕ್ತಿಯ ಬಗ್ಗೆ ಕರೆ ಮಾಡುತ್ತಿದ್ದೇವೆ.",
    "q_cg_seen": "ನೀವು ಈಗ ಅವರ ಜೊತೆ ಇದ್ದೀರಾ, ಅಥವಾ ಕಳೆದ ಒಂದು ಗಂಟೆಯಲ್ಲಿ ಅವರನ್ನು ನೋಡಿದ್ದೀರಾ? "
                 "ಹೌದು ಎಂದರೆ 1, ಇಲ್ಲ ಎಂದರೆ 2 ಒತ್ತಿ.",
    "q_cg_water": "ಕಳೆದ ಒಂದು ಗಂಟೆಯಲ್ಲಿ ಅವರು ನೀರು ಕುಡಿದಿದ್ದಾರಾ? ಹೌದು ಎಂದರೆ 1, ಇಲ್ಲ ಎಂದರೆ 2 ಒತ್ತಿ.",
    "q_cg_unwell": "ಅವರು ಎಂದಿಗಿಂತ ಹೆಚ್ಚು ಗೊಂದಲದಲ್ಲಿ, ಮಂಕಾಗಿ ಅಥವಾ ಅಸ್ವಸ್ಥರಾಗಿ ಕಾಣುತ್ತಿದ್ದಾರಾ? "
                   "ಹೌದು ಎಂದರೆ 1, ಇಲ್ಲ ಎಂದರೆ 2 ಒತ್ತಿ.",
    "q_cg_room": "ಅವರ ಕೋಣೆ ತುಂಬಾ ಬಿಸಿಯಾಗಿದ್ದು, ಫ್ಯಾನ್ ಅಥವಾ ಕೂಲರ್ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲವಾ? "
                 "ಹೌದು ಎಂದರೆ 1, ಇಲ್ಲ ಎಂದರೆ 2 ಒತ್ತಿ.",
    "q_cg_help": "ಅವರಿಗೆ ಈಗಲೇ ಸಹಾಯ ಬೇಕಿದ್ದರೆ 2 ಒತ್ತಿ. ಅವರು ಚೆನ್ನಾಗಿದ್ದರೆ 1 ಒತ್ತಿ.",
    "cg_advice_check": "ದಯವಿಟ್ಟು ಈಗಲೇ ಹೋಗಿ ಅವರನ್ನು ಖುದ್ದಾಗಿ ನೋಡಿ.",
    "cg_advice_water": "ದಯವಿಟ್ಟು ಈಗಲೇ ಅವರಿಗೆ ಒಂದು ಲೋಟ ನೀರು ಕೊಡಿ, ಮತ್ತು ಅವರನ್ನು ಮನೆಯ ತಣ್ಣಗಿರುವ ಜಾಗದಲ್ಲಿ ಇರಿಸಿ.",
    "cg_close_ok": "ಧನ್ಯವಾದಗಳು. ಇವತ್ತು ಮತ್ತೆ ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತೇವೆ.",
    "cg_close_help": "ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಹತ್ತಿರದ ಒಬ್ಬರಿಗೆ ಈಗಲೇ ತಿಳಿಸುತ್ತಿದ್ದೇವೆ. "
                     "ಅವರು ಎಚ್ಚರಗೊಳ್ಳದಿದ್ದರೆ ಅಥವಾ ಕುಸಿದು ಬಿದ್ದರೆ, 108ಕ್ಕೆ ಕರೆ ಮಾಡಿ.",
    "code_mallige": "ಮಲ್ಲಿಗೆ.", "code_sampige": "ಸಂಪಿಗೆ.", "code_sevanthige": "ಸೇವಂತಿಗೆ.",
    "code_tulasi": "ತುಳಸಿ.", "code_maavu": "ಮಾವು.", "code_bevu": "ಬೇವು.",
    "code_kaveri": "ಕಾವೇರಿ.", "code_chandra": "ಚಂದ್ರ.", "code_nakshatra": "ನಕ್ಷತ್ರ.",
    "code_gulabi": "ಗುಲಾಬಿ.",
}
