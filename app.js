/**
 * DoubtBox — App Logic
 * All event handlers, Firebase operations, QR scanner, and navigation.
 */

// ===== FIREBASE INIT =====
firebase.initializeApp({
  apiKey: "AIzaSyD11uz413rw8NcDi0l3kEBVBUptt2wOXO4",
  authDomain: "doubtbox-39044.firebaseapp.com",
  projectId: "doubtbox-39044",
  storageBucket: "doubtbox-39044.firebasestorage.app",
  messagingSenderId: "52945713156",
  appId: "1:52945713156:web:dcf8414861c07435bf9d51",
  measurementId: "G-VW7WGT2S7C"
});
var db = firebase.firestore();

// ===== DOM HELPERS =====
function $(id) { return document.getElementById(id); }

// ===== STATE =====
var SCREENS = ["home", "teacherCreate", "teacherDashboard", "studentJoin", "studentChat"];
var currentClassId = "";
var currentPassword = "";
var endTimeGlobal = 0;
var timerInterval = null;
var html5QrCode = null;
var scannerRunning = false;
var questionsUnsubscribe = null;
var studentUnsubscribe = null;

// ===== TOAST =====
function toast(msg, type) {
  type = type || "success";
  var el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  $("toastContainer").appendChild(el);
  setTimeout(function () {
    el.style.opacity = "0";
    setTimeout(function () { el.remove(); }, 300);
  }, 3000);
}

// ===== NAVIGATION =====
function showScreen(id) {
  // Stop QR scanner if leaving student join
  if (scannerRunning && id !== "studentJoin") {
    stopScanner();
  }
  for (var i = 0; i < SCREENS.length; i++) {
    var el = $(SCREENS[i]);
    if (el) el.classList.add("hidden");
  }
  var target = $(id);
  if (target) target.classList.remove("hidden");
  $("backBtn").classList.toggle("hidden", id === "home");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goHome() { showScreen("home"); }
function showTeacher() { showScreen("teacherCreate"); }
function showStudent() { showScreen("studentJoin"); }

// ===== TEACHER: TOGGLE CUSTOM DURATION =====
function toggleCustom() {
  var isCustom = $("durationSelect").value === "custom";
  $("customGroup").classList.toggle("hidden", !isCustom);
  if (isCustom) $("customDuration").focus();
}

// ===== URL HELPERS =====
function isLocalHost() {
  return ["localhost", "127.0.0.1", "::1"].indexOf(location.hostname) !== -1;
}

function getShareUrl() {
  if ((location.protocol === "http:" || location.protocol === "https:") && !isLocalHost()) {
    return location.origin + location.pathname + "?class=" + currentClassId + "&pass=" + currentPassword;
  }
  return "CLASS:" + currentClassId + " | PASS:" + currentPassword;
}

// ===== TEACHER: CREATE CLASS =====
function createClass() {
  var name = $("className").value.trim();
  var password = $("classPassword").value.trim();
  var sel = $("durationSelect").value;
  var duration;

  if (sel === "custom") {
    duration = parseInt($("customDuration").value, 10);
  } else {
    duration = parseInt(sel, 10);
  }

  if (!name) { toast("Enter a class name", "error"); return; }
  if (!password) { toast("Set a password for students", "error"); return; }
  if (!duration || duration <= 0) { toast("Enter a valid duration", "error"); return; }

  currentClassId = Math.random().toString(36).substring(2, 7).toUpperCase();
  currentPassword = password.toUpperCase();
  var startTime = Date.now();
  var endTime = startTime + duration * 60000;
  endTimeGlobal = endTime;

  db.collection("classes").doc(currentClassId).set({
    className: name,
    password: currentPassword,
    duration: duration,
    startTime: startTime,
    endTime: endTime
  }).then(function () {
    toast("Room created successfully!");
  }).catch(function () {
    toast("Failed to create room", "error");
  });

  // Show dashboard
  $("dashClassName").textContent = name;
  $("displayClassId").textContent = currentClassId;
  $("displayPassword").textContent = currentPassword;

  showScreen("teacherDashboard");

  // QR Code
  var qrData = getShareUrl();
  QRCode.toCanvas($("qrCanvas"), qrData, { width: 180, margin: 1 }, function (err) {
    if (err) console.error("QR Error:", err);
  });

  startTimer();
  listenQuestions();
}

// ===== TEACHER: RE-JOIN CLASS =====
function rejoinClassTeacher() {
  var id = $("rejoinClassId").value.trim().toUpperCase();
  var pass = $("rejoinPassword").value.trim();

  if (!id) { toast("Enter the class ID", "error"); return; }
  if (!pass) { toast("Enter the password", "error"); return; }

  db.collection("classes").doc(id).get().then(function (doc) {
    if (!doc.exists) { toast("Invalid Class ID", "error"); return; }
    
    var d = doc.data();
    if (d.password !== pass) { toast("Wrong password", "error"); return; }
    if (Date.now() > d.endTime) { toast("This class has already expired ⛔", "error"); return; }

    // Restore state
    currentClassId = id;
    currentPassword = d.password;
    endTimeGlobal = d.endTime;

    // Show dashboard
    $("dashClassName").textContent = d.className;
    $("displayClassId").textContent = currentClassId;
    $("displayPassword").textContent = currentPassword;

    showScreen("teacherDashboard");

    // QR Code
    var qrData = getShareUrl();
    QRCode.toCanvas($("qrCanvas"), qrData, { width: 180, margin: 1 }, function (err) {
      if (err) console.error("QR Error:", err);
    });

    startTimer();
    listenQuestions();
    toast("Welcome back!");
  }).catch(function (err) {
    console.error(err);
    toast("Connection error. Try again.", "error");
  });
}

// ===== COPY & SHARE =====
function copyId() {
  navigator.clipboard.writeText(currentClassId).then(function () { toast("Class ID copied!"); });
}

function copyPass() {
  navigator.clipboard.writeText(currentPassword).then(function () { toast("Password copied!"); });
}

function copyLink() {
  var url = getShareUrl();
  navigator.clipboard.writeText(url).then(function () { toast("Invite link copied!"); });
}

function shareWhatsApp() {
  var url = getShareUrl();
  var text = "📚 Join my DoubtBox class!\n\nClass ID: " + currentClassId + "\nPassword: " + currentPassword + "\n\n" + url;
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}

// ===== TIMER =====
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  var display = $("timerDisplay");

  timerInterval = setInterval(function () {
    var diff = endTimeGlobal - Date.now();
    if (diff <= 0) {
      display.textContent = "⛔ Class Ended";
      display.classList.add("expired");
      clearInterval(timerInterval);
      timerInterval = null;
      return;
    }
    var min = Math.floor(diff / 60000);
    var sec = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
    display.textContent = "⏳ " + min + ":" + sec;
  }, 1000);
}

// ===== LISTEN QUESTIONS (Teacher) =====
function listenQuestions() {
  // Unsubscribe from previous listener if any
  if (questionsUnsubscribe) questionsUnsubscribe();

  questionsUnsubscribe = db.collection("questions")
    .where("classId", "==", currentClassId)
    .onSnapshot(function (snapshot) {
      var total = 0, solved = 0, pending = 0;
      var container = $("questionsContainer");
      container.innerHTML = "";

      if (snapshot.empty) {
        container.innerHTML =
          '<div class="empty-state">' +
          '<div class="empty-icon">💬</div>' +
          "<p>No questions yet. Share the code and wait for students!</p>" +
          "</div>";
        $("statTotal").textContent = "0";
        $("statSolved").textContent = "0";
        $("statPending").textContent = "0";
        return;
      }

      var docsArray = [];
      snapshot.forEach(function (doc) {
        docsArray.push({ id: doc.id, data: doc.data() });
      });

      // Sort by timestamp descending (latest on top)
      docsArray.sort(function(a, b) {
        var timeA = a.data.timestamp ? a.data.timestamp.toMillis() : 0;
        var timeB = b.data.timestamp ? b.data.timestamp.toMillis() : 0;
        return timeB - timeA;
      });

      docsArray.forEach(function (item) {
        var d = item.data;
        var docId = item.id;
        total++;
        if (d.solved) solved++;
        else pending++;

        var card = document.createElement("div");
        card.className = "question-card";

        var header = document.createElement("div");
        header.className = "q-header";

        var qText = document.createElement("div");
        qText.className = "q-text";
        qText.textContent = d.question;

        var pill = document.createElement("span");
        pill.className = "q-pill " + (d.solved ? "solved" : "pending");
        pill.textContent = d.solved ? "✓ Solved" : "● Pending";

        header.appendChild(qText);
        header.appendChild(pill);

        var answerDiv = document.createElement("div");
        answerDiv.className = "q-answer";
        answerDiv.textContent = d.answer ? "💡 " + d.answer : "No answer yet";

        card.appendChild(header);
        card.appendChild(answerDiv);

        if (!d.solved) {
          var actions = document.createElement("div");
          actions.className = "q-actions";

          var visibilityBtn = document.createElement("button");
          visibilityBtn.className = "btn " + (d.isPublic ? "btn-secondary" : "btn-primary");
          visibilityBtn.textContent = d.isPublic ? "🙈 Hide" : "👁️ Make Public";
          visibilityBtn.addEventListener("click", (function(id, currentState) {
            return function() { toggleVisibility(id, currentState); };
          })(docId, d.isPublic));

          var input = document.createElement("input");
          input.className = "form-input";
          input.id = "ans-" + docId;
          input.placeholder = "Type your answer...";

          var replyBtn = document.createElement("button");
          replyBtn.className = "btn btn-secondary";
          replyBtn.textContent = "Reply";
          replyBtn.addEventListener("click", (function (id) {
            return function () { answerQuestion(id); };
          })(docId));

          var solveBtn = document.createElement("button");
          solveBtn.className = "btn btn-success";
          solveBtn.textContent = "✓";
          solveBtn.addEventListener("click", (function (id) {
            return function () { solveQuestion(id); };
          })(docId));

          actions.appendChild(visibilityBtn);
          actions.appendChild(input);
          actions.appendChild(replyBtn);
          actions.appendChild(solveBtn);
          
          card.appendChild(actions);
        }

        container.appendChild(card);
      });

      $("statTotal").textContent = total;
      $("statSolved").textContent = solved;
      $("statPending").textContent = pending;
    });
}

function answerQuestion(id) {
  var input = $("ans-" + id);
  if (!input) return;
  var ans = input.value.trim();
  if (!ans) { toast("Write an answer first", "error"); return; }
  db.collection("questions").doc(id).update({ answer: ans }).then(function () {
    toast("Answer sent!");
  }).catch(function () {
    toast("Failed to send answer", "error");
  });
}

function solveQuestion(id) {
  db.collection("questions").doc(id).update({ solved: true }).then(function () {
    toast("Marked as solved!");
  }).catch(function () {
    toast("Failed to update", "error");
  });
}

function toggleVisibility(id, currentState) {
  var newState = !currentState;
  db.collection("questions").doc(id).update({ isPublic: newState }).then(function () {
    toast(newState ? "Question is now public!" : "Question hidden from students.");
  }).catch(function () {
    toast("Failed to change visibility", "error");
  });
}

// ===== STUDENT: JOIN =====
function joinClass(e) {
  if (e) e.preventDefault();
  var name = $("joinName").value.trim();
  var id = $("joinId").value.trim().toUpperCase();
  var pass = $("joinPassword").value.trim().toUpperCase();

  if (!name) { toast("Enter your name", "error"); return; }
  if (!id) { toast("Enter the class ID", "error"); return; }
  if (!pass) { toast("Enter the password", "error"); return; }

  db.collection("classes").doc(id).get().then(function (doc) {
    if (!doc.exists) { toast("Invalid Class ID", "error"); return; }

    var d = doc.data();
    if (Date.now() > d.endTime) { toast("This class has expired ⛔", "error"); return; }
    if (d.password !== pass) { toast("Wrong password", "error"); return; }

    currentClassId = id;
    $("studentClassLabel").textContent = 'Joined "' + d.className + '" as ' + name;
    showScreen("studentChat");
    toast("Welcome to " + d.className + "!");
    listenStudentQuestions();
  }).catch(function () {
    toast("Connection error. Try again.", "error");
  });
}

// ===== STUDENT: SEND QUESTION =====
function sendQuestion() {
  var q = $("questionInput").value.trim();
  var name = $("joinName").value.trim();
  if (!q) { toast("Type a question first", "error"); return; }

  db.collection("questions").add({
    classId: currentClassId,
    studentName: name,
    question: q,
    answer: "",
    solved: false,
    isPublic: false,
    timestamp: new Date()
  }).then(function () {
    toast("Question sent privately to the teacher!");
    $("questionInput").value = "";
  }).catch(function () {
    toast("Failed to send question", "error");
  });
}

// ===== STUDENT: LISTEN =====
function listenStudentQuestions() {
  if (studentUnsubscribe) studentUnsubscribe();

  studentUnsubscribe = db.collection("questions")
    .where("classId", "==", currentClassId)
    .onSnapshot(function (snapshot) {
      var container = $("studentResponses");
      container.innerHTML = "";

      var docsArray = [];
      snapshot.forEach(function (doc) {
        var d = doc.data();
        if (d.isPublic) {
          docsArray.push(d);
        }
      });

      if (docsArray.length === 0) {
        container.innerHTML =
          '<div class="empty-state">' +
          '<div class="empty-icon">🤔</div>' +
          "<p>Questions are hidden until approved by the teacher.</p>" +
          "</div>";
        return;
      }

      // Sort by timestamp descending (latest on top)
      docsArray.sort(function(a, b) {
        var timeA = a.timestamp ? a.timestamp.toMillis() : 0;
        var timeB = b.timestamp ? b.timestamp.toMillis() : 0;
        return timeB - timeA;
      });

      docsArray.forEach(function (d) {
        var card = document.createElement("div");
        card.className = "student-q-card fade-up";

        var header = document.createElement("div");
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "flex-start";
        header.style.marginBottom = "8px";

        var question = document.createElement("div");
        question.className = "sq-question";
        question.textContent = "❓ " + d.question;
        question.style.marginBottom = "0";

        var pill = document.createElement("span");
        pill.className = "q-pill " + (d.solved ? "solved" : "pending");
        pill.textContent = d.solved ? "✓ Solved" : "● Pending";
        pill.style.fontSize = "10px";

        header.appendChild(question);
        header.appendChild(pill);

        var answer = document.createElement("div");
        answer.className = "sq-answer" + (d.answer || d.solved ? " answered" : "");
        
        if (d.answer) {
          answer.textContent = "💡 " + d.answer;
        } else if (d.solved) {
          answer.textContent = "✅ Marked as solved by teacher";
        } else {
          answer.textContent = "⏳ Waiting for teacher...";
        }

        card.appendChild(header);
        card.appendChild(answer);
        container.appendChild(card);
      });
    });
}

// ===== QR SCANNER =====
function toggleScanner() {
  if (scannerRunning) {
    stopScanner();
    return;
  }

  var container = $("qrScannerContainer");
  var btn = $("scanToggleBtn");

  container.classList.remove("hidden");
  btn.textContent = "Close Scanner";

  html5QrCode = new Html5Qrcode("qrReader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    function (decodedText) {
      handleScannedQR(decodedText);
      stopScanner();
    },
    function () { /* ignore scan errors */ }
  ).catch(function () {
    toast("Camera access denied or not available", "error");
    stopScanner();
  });

  scannerRunning = true;
}

function stopScanner() {
  var container = $("qrScannerContainer");
  var btn = $("scanToggleBtn");

  if (html5QrCode) {
    html5QrCode.stop().then(function () {
      html5QrCode.clear();
    }).catch(function () { /* ignore */ });
  }

  container.classList.add("hidden");
  btn.textContent = "Open Scanner";
  scannerRunning = false;
}

function handleScannedQR(text) {
  // Try to parse as a URL with ?class=...&pass=...
  try {
    var url = new URL(text);
    var classId = url.searchParams.get("class");
    var pass = url.searchParams.get("pass");
    if (classId) {
      $("joinId").value = classId.toUpperCase();
      if (pass) $("joinPassword").value = pass;
      toast("QR scanned! Enter your name and join.", "success");
      return;
    }
  } catch (e) {
    // Not a URL — try other formats
  }

  // Try CLASS:XXXXX | PASS:YYYYYY format (for local/file usage)
  var classMatch = text.match(/CLASS:\s*([A-Z0-9]+)/i);
  var passMatch = text.match(/PASS:\s*([A-Z0-9]+)/i);
  if (classMatch) {
    $("joinId").value = classMatch[1].toUpperCase();
    if (passMatch) $("joinPassword").value = passMatch[1];
    toast("QR scanned! Enter your name and join.", "success");
    return;
  }

  // Fallback: treat the whole text as class ID
  $("joinId").value = text.toUpperCase();
  toast("QR scanned! Enter password and your name.", "success");
}

// ===== EVENT LISTENERS =====
document.addEventListener("DOMContentLoaded", function () {

  // Navigation
  $("logoBtn").addEventListener("click", goHome);
  $("backBtn").addEventListener("click", goHome);
  $("teacherCard").addEventListener("click", showTeacher);
  $("teacherBtn").addEventListener("click", function (e) { e.stopPropagation(); showTeacher(); });
  $("studentCard").addEventListener("click", showStudent);
  $("studentBtn").addEventListener("click", function (e) { e.stopPropagation(); showStudent(); });

  // Teacher: duration toggle
  $("durationSelect").addEventListener("change", toggleCustom);

  // Teacher: create class
  var genBtn = $("generateRoomBtn");
  if (genBtn) genBtn.addEventListener("click", createClass);

  var rejoinBtn = $("rejoinRoomBtn");
  if (rejoinBtn) rejoinBtn.addEventListener("click", rejoinClassTeacher);

  // Teacher: share buttons
  $("copyIdBtn").addEventListener("click", copyId);
  $("copyPassBtn").addEventListener("click", copyPass);
  $("copyLinkBtn").addEventListener("click", copyLink);
  $("whatsappBtn").addEventListener("click", shareWhatsApp);

  // Student: join form
  $("joinForm").addEventListener("submit", joinClass);

  // Student: QR scanner toggle
  $("scanToggleBtn").addEventListener("click", toggleScanner);

  // Student: send question
  $("sendQuestionBtn").addEventListener("click", sendQuestion);

  // Student: enter key to send
  $("questionInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendQuestion();
    }
  });

  // URL params: auto-fill from invite link
  var params = new URLSearchParams(location.search);
  if (params.has("class")) {
    var classId = params.get("class").toUpperCase();
    var pass = params.has("pass") ? params.get("pass") : "";
    $("joinId").value = classId;
    if (pass) $("joinPassword").value = pass;
    showScreen("studentJoin");
    if (pass) {
      toast("Invite link detected! Enter your name and hit Join.", "success");
    }
  }
});
