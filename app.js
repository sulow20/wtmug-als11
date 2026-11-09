
"use strict";

// ==========================================
// GENEL DEĞİŞKENLER
// ==========================================

const $ = id => document.getElementById(id);

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

const FONT_SIZES = [
  150, 120, 95, 75,
  58, 45, 35, 28
];

let peer = null;
let connection = null;
let scanner = null;

let connected = false;
let currentRole = null;

let currentEye = "";
let currentQuestion = 0;
let currentLetter = "";

let questionInterval = null;
let phaseInterval = null;

let questionSeconds = 5;
let phaseSeconds = 0;

let results = {
  left: [],
  right: []
};

// ==========================================
// EKRAN YÖNETİMİ
// ==========================================

function showScreen(id) {
  const screens = [
    "roleScreen",
    "doctorScreen",
    "patientConsent",
    "patientTest",
    "patientResult"
  ];

  screens.forEach(screen => {
    $(screen).classList.add("hidden");
  });

  $(id).classList.remove("hidden");
}

$("doctorRole").onclick = () => {
  currentRole = "doctor";
  showScreen("doctorScreen");
};

$("patientRole").onclick = () => {
  currentRole = "patient";
  showScreen("patientConsent");
};

// ==========================================
// SERVICE WORKER
// ==========================================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .catch(error => console.error("SW:", error));
  });
}

// ==========================================
// YARDIMCI FONKSİYONLAR
// ==========================================

function randomLetter() {
  return LETTERS[
    Math.floor(Math.random() * LETTERS.length)
  ];
}

function send(data) {
  if (connection && connection.open) {
    connection.send(data);
  }
}

function clearTimers() {
  clearInterval(questionInterval);
  clearInterval(phaseInterval);

  questionInterval = null;
  phaseInterval = null;
}

function showTimer(seconds, elementId) {
  $(elementId).textContent = seconds;
}

// ==========================================
// DOKTOR: PEERJS BAĞLANTISI
// ==========================================

$("startTest").onclick = () => {

  $("startTest").disabled = true;

  $("doctorStatus").textContent =
    "Bağlantı oluşturuluyor...";

  peer = new Peer({
    debug: 1
  });

  peer.on("open", id => {

    $("doctorStatus").textContent =
      "Hasta bağlantısı bekleniyor.";

    $("qrArea").classList.remove("hidden");

    $("doctorId").textContent =
      "Bağlantı ID: " + id;

    $("qrcode").innerHTML = "";

    new QRCode($("qrcode"), {
      text: id,
      width: 230,
      height: 230,
      correctLevel: QRCode.CorrectLevel.M
    });
  });

  peer.on("connection", conn => {

    if (connection || connected) {
      conn.close();
      return;
    }

    connection = conn;

    connection.on("open", () => {
      connected = true;

      $("doctorStatus").textContent =
        "Hasta başarıyla bağlandı.";

      $("qrArea").classList.add("hidden");

      $("doctorTest").classList.remove("hidden");

      startDoctorPhase(60, "Hazırlık süresi");
    });

    connection.on("data", handleDoctorData);

    connection.on("close", () => {
      connected = false;
      $("doctorStatus").textContent =
        "Hasta bağlantısı kesildi.";
      clearTimers();
    });

    connection.on("error", error => {
      console.error("Bağlantı:", error);
    });
  });

  peer.on("error", error => {
    $("doctorStatus").textContent =
      "Bağlantı hatası: " + error.message;

    $("startTest").disabled = false;
  });
};

// ==========================================
// DOKTOR: GERİ SAYIM
// ==========================================

function startDoctorPhase(seconds, message) {

  clearTimers();

  phaseSeconds = seconds;

  $("doctorPhase").textContent = message;

  $("doctorLetter").textContent = "";

  $("doctorQuestion").textContent = "";

  $("doctorTimer").textContent = phaseSeconds;

  send({
    type: "phase",
    message,
    seconds
  });

  phaseInterval = setInterval(() => {

    phaseSeconds--;

    showTimer(phaseSeconds, "doctorTimer");

    send({
      type: "phase_tick",
      seconds: phaseSeconds
    });

    if (phaseSeconds <= 0) {

      clearInterval(phaseInterval);
      phaseInterval = null;

      if (message === "Hazırlık süresi") {
        startEyeTest("left");
      }

      else if (message === "Göz değiştirme süresi") {
        startEyeTest("right");
      }
    }

  }, 1000);
}

// ==========================================
// DOKTOR: GÖZ TESTİ
// ==========================================

function startEyeTest(eye) {

  clearTimers();

  currentEye = eye;
  currentQuestion = 0;

  results[eye] = [];

  send({
    type: "eye_start",
    eye
  });

  nextQuestion();
}

function nextQuestion() {

  clearInterval(questionInterval);

  currentQuestion++;

  if (currentQuestion > 8) {

    $("doctorLetter").textContent = "";
    $("doctorQuestion").textContent =
      "Bu gözün testi tamamlandı.";

    send({
      type: "eye_complete",
      eye: currentEye
    });

    if (currentEye === "left") {

      startDoctorPhase(
        30,
        "Göz değiştirme süresi"
      );

    } else {

      finishTest();
    }

    return;
  }

  currentLetter = randomLetter();

  questionSeconds = 5;

  const fontSize = FONT_SIZES[currentQuestion - 1];

  $("doctorPhase").textContent =
    currentEye === "left"
      ? "SOL GÖZ TESTİ"
      : "SAĞ GÖZ TESTİ";

  $("doctorLetter").textContent = currentLetter;

  $("doctorLetter").style.fontSize =
    fontSize + "px";

  $("doctorQuestion").textContent =
    "Kalan süre: " + questionSeconds + " saniye";

  $("doctorProgress").textContent =
    currentQuestion + " / 8";

  send({
    type: "question",
    eye: currentEye,
    number: currentQuestion,
    letter: currentLetter,
    fontSize,
    seconds: 5
  });

  questionInterval = setInterval(() => {

    questionSeconds--;

    $("doctorQuestion").textContent =
      "Kalan süre: " + questionSeconds + " saniye";

    send({
      type: "question_tick",
      seconds: questionSeconds
    });

    if (questionSeconds <= 0) {

      clearInterval(questionInterval);

      results[currentEye].push({
        expected: currentLetter,
        answer: "",
        correct: false,
        fontSize
      });

      send({
        type: "question_timeout"
      });

      nextQuestion();
    }

  }, 1000);
}

// ==========================================
// DOKTOR: HASTA CEVABI
// ==========================================

function handleDoctorData(data) {

  if (!data || typeof data !== "object") return;

  if (data.type === "answer") {

    if (!questionInterval || !currentLetter) return;

    clearInterval(questionInterval);
    questionInterval = null;

    const answer = String(data.answer || "")
      .trim()
      .toUpperCase()
      .slice(0, 1);

    const correct = answer === currentLetter;

    const fontSize =
      FONT_SIZES[currentQuestion - 1];

    results[currentEye].push({
      expected: currentLetter,
      answer,
      correct,
      fontSize
    });

    send({
      type: "answer_result",
      correct
    });

    nextQuestion();
  }
}

// ==========================================
// HASTA: ONAY VE KAMERA
// ==========================================

$("consentCheck").onchange = event => {
  $("startCamera").disabled = !event.target.checked;
};

$("startCamera").onclick = async () => {

  if (!$("consentCheck").checked) return;

  $("startCamera").disabled = true;

  $("cameraStatus").textContent =
    "Kamera açılıyor...";

  try {

    scanner = new Html5Qrcode("reader");

    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: {
          width: 230,
          height: 230
        }
      },
      async decodedText => {

        await scanner.stop();

        scanner = null;

        $("reader").innerHTML = "";

        connectToDoctor(decodedText);
      }
    );

    $("cameraStatus").textContent =
      "Doktorun QR kodunu okutunuz.";

  } catch (error) {

    $("cameraStatus").textContent =
      "Kamera açılamadı: " + error.message;

    $("startCamera").disabled = false;
  }
};

// ==========================================
// HASTA: DOKTORA BAĞLAN
// ==========================================

function connectToDoctor(doctorId) {

  if (!/^[a-zA-Z0-9_-]+$/.test(doctorId)) {
    $("cameraStatus").textContent =
      "Geçersiz bağlantı kodu.";
    return;
  }

  $("cameraStatus").textContent =
    "Doktora bağlanılıyor...";

  peer = new Peer();

  peer.on("open", () => {

    connection = peer.connect(doctorId, {
      reliable: true
    });

    connection.on("open", () => {

      $("cameraStatus").textContent =
        "Doktor bağlantısı kuruldu.";

      $("patientConsent").classList.add("hidden");

      $("patientTest").classList.remove("hidden");

      $("patientConnection").textContent =
        "Bağlantı başarılı.";

    });

    connection.on("data", handlePatientData);

    connection.on("close", () => {

      $("patientConnection").textContent =
        "Doktor bağlantısı kesildi.";

      clearTimers();
    });
  });

  peer.on("error", error => {

    $("cameraStatus").textContent =
      "Bağlantı hatası: " + error.message;

    $("startCamera").disabled = false;
  });
}

// ==========================================
// HASTA: DOKTORDAN GELEN MESAJLAR
// ==========================================

function handlePatientData(data) {

  if (!data || typeof data !== "object") return;

  switch (data.type) {

    case "phase":

      $("patientPhase").textContent = data.message;

      $("patientTimer").textContent = data.seconds;

      $("patientLetter").textContent = "";

      $("patientAnswer").disabled = true;

      $("submitAnswer").disabled = true;

      $("patientAnswer").value = "";

      $("questionTimer").textContent =
        "Test başlamayı bekliyor.";

      break;

    case "phase_tick":

      $("patientTimer").textContent =
        data.seconds;

      break;

    case "eye_start":

      $("patientPhase").textContent =
        data.eye === "left"
          ? "SOL GÖZ TESTİ"
          : "SAĞ GÖZ TESTİ";

      break;

    case "question":

      $("patientLetter").textContent =
        data.letter;

      $("patientLetter").style.fontSize =
        data.fontSize + "px";

      $("patientAnswer").value = "";

      $("patientAnswer").disabled = false;

      $("submitAnswer").disabled = false;

      $("patientAnswer").focus();

      $("questionTimer").textContent =
        data.seconds + " saniyeniz var.";

      $("patientProgress").textContent =
        data.eye.toUpperCase() +
        " GÖZ: " + data.number + " / 8";

      break;

    case "question_tick":

      $("questionTimer").textContent =
        data.seconds + " saniye kaldı.";

      break;

    case "question_timeout":

      $("patientAnswer").disabled = true;

      $("submitAnswer").disabled = true;

      $("patientLetter").textContent = "";

      $("questionTimer").textContent =
        "Süre doldu. Sonraki harfe geçiliyor.";

      break;

    case "answer_result":

      $("patientAnswer").disabled = true;

      $("submitAnswer").disabled = true;

      $("patientLetter").textContent = "";

      $("questionTimer").textContent =
        data.correct
          ? "Cevabınız doğru."
          : "Cevabınız yanlış.";

      break;

    case "eye_complete":

      $("patientLetter").textContent = "";

      $("patientAnswer").disabled = true;

      $("submitAnswer").disabled = true;

      $("patientPhase").textContent =
        data.eye === "left"
          ? "Sol göz testi tamamlandı."
          : "Sağ göz testi tamamlandı.";

      break;

    case "results":

      clearTimers();

      $("patientTest").classList.add("hidden");

      displayResult(
        "patientResult",
        data.result
      );

      $("patientResult").classList.remove("hidden");

      break;
  }
}

// ==========================================
// HASTA: CEVAP GÖNDERME
// ==========================================

function submitPatientAnswer() {

  if (!connection || !connection.open) return;

  if ($("patientAnswer").disabled) return;

  const answer = $("patientAnswer").value
    .trim()
    .toUpperCase();

  if (!/^[A-Z]$/.test(answer)) {
    $("questionTimer").textContent =
      "Lütfen tek bir İngilizce büyük harf giriniz.";
    return;
  }

  send({
    type: "answer",
    answer
  });

  $("patientAnswer").disabled = true;

  $("submitAnswer").disabled = true;
}

$("submitAnswer").onclick = submitPatientAnswer;

$("patientAnswer").addEventListener("keydown", event => {

  if (event.key === "Enter") {
    submitPatientAnswer();
  }

});

// ==========================================
// TEŞHİS SİMÜLASYONU
// ==========================================

function calculateResults() {

  const all = [
    ...results.left,
    ...results.right
  ];

  const total = all.length;

  const correct = all.filter(
    item => item.correct
  ).length;

  const wrong = total - correct;

  const accuracy = total
    ? (correct / total) * 100
    : 0;

  const smallErrors = all.filter(
    item => !item.correct && item.fontSize <= 58
  ).length;

  const largeErrors = all.filter(
    item => !item.correct && item.fontSize >= 95
  ).length;



  const similarErrors = all.filter(item => {

    if (item.correct || !item.answer) return false;

    return confusionPairs.some(pair =>
      pair.includes(item.expected) &&
      pair.includes(item.answer)
    );
  }).length;

  let diagnosis = "Normal görme (simülasyon)";

  if (similarErrors >= 2) {
    diagnosis = "Astigmat şüphesi (simülasyon)";
  }

  else if (smallErrors > largeErrors && smallErrors >= 2) {
    diagnosis = "Miyop şüphesi (simülasyon)";
  }

  else if (largeErrors > smallErrors && largeErrors >= 2) {
    diagnosis = "Hipermetrop şüphesi (simülasyon)";
  }

  let degree;

  if (accuracy >= 95) degree = "-0.25";
  else if (accuracy >= 85) degree = "-0.50";
  else if (accuracy >= 75) degree = "-1.00";
  else if (accuracy >= 60) degree = "-1.50";
  else if (accuracy >= 45) degree = "-2.00";
  else if (accuracy >= 30) degree = "-3.00";
  else degree = "-4.00";

  return {
    total,
    correct,
    wrong,
    accuracy: accuracy.toFixed(1),
    diagnosis,
    degree,
    leftCorrect: results.left.filter(x => x.correct).length,
    rightCorrect: results.right.filter(x => x.correct).length
  };
}

// ==========================================
// TESTİ BİTİR
// ==========================================

function finishTest() {

  clearTimers();

  const result = calculateResults();

  $("doctorLetter").textContent = "";

  $("doctorTest").classList.add("hidden");

  displayResult("doctorResult", result);

  $("doctorResult").classList.remove("hidden");

  send({
    type: "results",
    result
  });

  $("doctorStatus").textContent =
    "Test tamamlandı.";
}

// ==========================================
// SONUÇ EKRANI
// ==========================================

function displayResult(elementId, result) {

  $(elementId).innerHTML = `
    <h2>Test Sonuçları</h2>

    <p><strong>Simülasyon teşhisi:</strong></p>
    <h2>${escapeHTML(result.diagnosis)}</h2>

    <p><strong>Sanal görme derecesi:</strong></p>
    <h2>${escapeHTML(result.degree)}</h2>

    <hr>

    <p>Toplam soru: ${result.total}</p>
    <p>Doğru cevap: ${result.correct}</p>
    <p>Yanlış cevap: ${result.wrong}</p>
    <p>Başarı oranı: %${result.accuracy}</p>

    <hr>

    <p>Sol göz: ${result.leftCorrect} / 8</p>
    <p>Sağ göz: ${result.rightCorrect} / 8</p>

    <p class="warning">
      Bu sonuçlar yalnızca eğitim amaçlı simülasyondur.
      Gerçek göz numarası veya tıbbi teşhis değildir.
    </p>
  `;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
