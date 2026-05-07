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
var SCREENS = ["home", "teacherCreate", "teacherDashboard", "studentJoin", "studentChat", "studentFeedback"];
var currentClassId = "";
var currentPassword = "";
var endTimeGlobal = 0;
var timerInterval = null;
var html5QrCode = null;
var scannerRunning = false;
var questionsUnsubscribe = null;
var studentUnsubscribe = null;
var classUnsubscribe = null;
var feedbackUnsubscribe = null;
var liveStudentsUnsubscribe = null;
var presenceInterval = null;
var userRole = ""; // "teacher" or "student"
var currentQuestionFilter = "all"; // "all", "pending", "solved"
var currentFeedbackFilter = "all"; // "all", "positive", "negative"

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
function showScreen(id, skipHistory) {
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
  
  if (!skipHistory) {
    history.pushState({ screen: id }, "", "");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goHome() { 
  // Cleanup
  if (timerInterval) clearInterval(timerInterval);
  if (presenceInterval) clearInterval(presenceInterval);
  if (questionsUnsubscribe) questionsUnsubscribe();
  if (studentUnsubscribe) studentUnsubscribe();
  if (classUnsubscribe) classUnsubscribe();
  if (feedbackUnsubscribe) feedbackUnsubscribe();
  if (liveStudentsUnsubscribe) liveStudentsUnsubscribe();
  
  allQuestions = [];
  studentQuestionsCache = [];
  allFeedback = [];
  
  clearState();
  showScreen("home"); 
}
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
  listenFeedback();
  listenLiveStudents();

  // Save state

  // Save state
  userRole = "teacher";
  saveState();
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
    listenFeedback();
    listenLiveStudents();

    // Save state

    // Save state
    userRole = "teacher";
    saveState();

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
// ===== TEACHER: FILTERS =====
function setFilter(filter) {
  currentQuestionFilter = filter;
  // Update UI buttons
  document.querySelectorAll(".filter-btn").forEach(function(btn) {
    btn.classList.toggle("active", btn.id === "filter" + filter.charAt(0).toUpperCase() + filter.slice(1));
  });
  // Refresh the display (we'll just re-run the render logic)
  renderQuestions();
}

var allQuestions = []; // Local cache for teacher questions

function listenQuestions() {
  if (questionsUnsubscribe) questionsUnsubscribe();

  questionsUnsubscribe = db.collection("questions")
    .where("classId", "==", currentClassId)
    .onSnapshot(function (snapshot) {
      snapshot.docChanges().forEach(function(change) {
        var docId = change.doc.id;
        var data = change.doc.data();
        
        if (change.type === "added") {
          allQuestions.push({ id: docId, data: data });
        } else if (change.type === "modified") {
          var index = allQuestions.findIndex(q => q.id === docId);
          if (index !== -1) allQuestions[index].data = data;
        } else if (change.type === "removed") {
          allQuestions = allQuestions.filter(q => q.id !== docId);
        }
      });

      renderQuestions();
    });
}

function renderQuestions() {
  var total = allQuestions.length;
  var solved = allQuestions.filter(q => q.data.solved).length;
  var pending = total - solved;

  $("statTotal").textContent = total;
  $("statSolved").textContent = solved;
  $("statPending").textContent = pending;

  var container = $("questionsContainer");
  
  // Filter
  var filtered = allQuestions.filter(function(q) {
    if (currentQuestionFilter === "pending") return !q.data.solved;
    if (currentQuestionFilter === "solved") return q.data.solved;
    return true;
  });

  // Sort by timestamp descending
  filtered.sort(function(a, b) {
    var timeA = a.data.timestamp ? a.data.timestamp.toMillis() : 0;
    var timeB = b.data.timestamp ? b.data.timestamp.toMillis() : 0;
    return timeB - timeA;
  });

  if (filtered.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-icon">💬</div>' +
      "<p>" + (currentQuestionFilter === "all" ? "No questions yet." : "No " + currentQuestionFilter + " questions.") + "</p>" +
      "</div>";
    return;
  }

  // Efficient DOM management: instead of innerHTML = "", we update elements
  // For simplicity and to avoid complex diffing, we'll rebuild if length changed significantly, 
  // or just clear and rebuild for now BUT since we have the data locally it's much faster.
  // Real optimization: update only changed ones.
  
  container.innerHTML = "";
  filtered.forEach(function (item) {
    var d = item.data;
    var docId = item.id;

    var card = document.createElement("div");
    card.className = "question-card fade-in";
    card.id = "q-card-" + docId;

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
      visibilityBtn.style.padding = "8px 12px";
      visibilityBtn.style.fontSize = "12px";
      visibilityBtn.textContent = d.isPublic ? "🙈 Hide" : "👁️ Public";
      visibilityBtn.onclick = function() { toggleVisibility(docId, d.isPublic); };

      var input = document.createElement("input");
      input.className = "form-input";
      input.id = "ans-" + docId;
      input.placeholder = "Type answer...";
      if (d.answer) input.value = d.answer;

      var replyBtn = document.createElement("button");
      replyBtn.className = "btn btn-secondary";
      replyBtn.style.padding = "8px 16px";
      replyBtn.textContent = "Reply";
      replyBtn.onclick = function() { answerQuestion(docId); };

      var solveBtn = document.createElement("button");
      solveBtn.className = "btn btn-success";
      solveBtn.style.padding = "8px 16px";
      solveBtn.textContent = "✓";
      solveBtn.onclick = function() { solveQuestion(docId); };

      actions.appendChild(visibilityBtn);
      actions.appendChild(input);
      actions.appendChild(replyBtn);
      actions.appendChild(solveBtn);
      
      card.appendChild(actions);
    }

    container.appendChild(card);
  });
}

// ===== TEACHER: FEEDBACK =====
function requestFeedback() {
  if (!currentClassId) return;
  db.collection("classes").doc(currentClassId).update({
    feedbackRequested: true,
    feedbackRequestedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    toast("Feedback form sent to all students! 📢");
    $("requestFeedbackBtn").classList.add("hidden");
    $("feedbackResultsSection").classList.remove("hidden");
  }).catch(function(err) {
    console.error(err);
    toast("Failed to send feedback request", "error");
  });
}

var allFeedback = [];

function setFeedbackFilter(filter) {
  currentFeedbackFilter = filter;
  var btns = $("feedbackResultsSection").querySelectorAll(".filter-btn");
  btns.forEach(function(b) {
    var txt = b.textContent.toLowerCase();
    b.classList.toggle("active", 
      (filter === "all" && txt === "all") ||
      (filter === "positive" && txt === "positive") ||
      (filter === "negative" && txt.includes("attention"))
    );
  });
  renderFeedback();
}

function listenFeedback() {
  if (feedbackUnsubscribe) feedbackUnsubscribe();

  feedbackUnsubscribe = db.collection("feedback")
    .where("classId", "==", currentClassId)
    .onSnapshot(function(snapshot) {
      snapshot.docChanges().forEach(function(change) {
        var docId = change.doc.id;
        var data = change.doc.data();
        if (change.type === "added") allFeedback.push({ id: docId, data: data });
        else if (change.type === "modified") {
          var idx = allFeedback.findIndex(f => f.id === docId);
          if (idx !== -1) allFeedback[idx].data = data;
        }
        else if (change.type === "removed") allFeedback = allFeedback.filter(f => f.id !== docId);
      });
      renderFeedback();
    });
}

function renderFeedback() {
  var container = $("feedbackContainer");
  container.innerHTML = "";

  if (allFeedback.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><p>No feedback received yet.</p></div>';
    return;
  }

  $("feedbackResultsSection").classList.remove("hidden");
  $("requestFeedbackBtn").classList.add("hidden");

  var filtered = allFeedback.filter(function(f) {
    if (currentFeedbackFilter === "positive") return parseInt(f.data.rating) >= 4;
    if (currentFeedbackFilter === "negative") return parseInt(f.data.rating) <= 2;
    return true;
  });

  filtered.forEach(function(item) {
    var d = item.data;
    var card = document.createElement("div");
    card.className = "feedback-card fade-in";
    var stars = "⭐".repeat(parseInt(d.rating, 10));
    card.innerHTML = 
      '<div class="f-header">' +
        '<div>' +
          '<div class="f-name">' + d.studentName + '</div>' +
          '<div class="f-usn">' + (d.usn || "No USN") + '</div>' +
        '</div>' +
        '<div class="f-rating">' + stars + '</div>' +
      '</div>' +
      '<div class="f-comment">' + (d.comment || "No comment provided.") + '</div>';
    container.appendChild(card);
  });
}

function listenLiveStudents() {
  if (liveStudentsUnsubscribe) liveStudentsUnsubscribe();

  liveStudentsUnsubscribe = db.collection("students")
    .where("classId", "==", currentClassId)
    .onSnapshot(function(snapshot) {
      var now = Date.now();
      var liveCount = 0;
      
      snapshot.forEach(function(doc) {
        var d = doc.data();
        // Count as live if seen in the last 60 seconds
        var lastSeen = d.lastSeen ? d.lastSeen.toMillis() : 0;
        if (now - lastSeen < 60000) {
          liveCount++;
        }
      });
      
      $("statLive").textContent = liveCount;
    });
}

function exportFeedbackToCSV() {
  if (!currentClassId) return;
  db.collection("feedback")
    .where("classId", "==", currentClassId)
    .get()
    .then(function(snapshot) {
      if (snapshot.empty) {
        toast("No feedback to export!", "error");
        return;
      }

      var csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Student Name,USN,Rating,Comment,Timestamp\n";

      snapshot.forEach(function(doc) {
        var d = doc.data();
        var row = [
          '"' + (d.studentName || "") + '"',
          '"' + (d.usn || "") + '"',
          '"' + (d.rating || "") + '"',
          '"' + (d.comment || "").replace(/"/g, '""') + '"',
          '"' + (d.timestamp ? d.timestamp.toDate().toLocaleString() : "") + '"'
        ].join(",");
        csvContent += row + "\n";
      });

      var encodedUri = encodeURI(csvContent);
      var link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "feedback_" + currentClassId + ".csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast("Exported feedback successfully! 📥");
    }).catch(function(err) {
      console.error(err);
      toast("Export failed", "error");
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
    if (d.password !== pass) { toast("Wrong password", "error"); return; }

    currentClassId = id;
    $("studentClassLabel").textContent = 'Joined "' + d.className + '" as ' + name;
    $("feedbackName").value = name; // Pre-fill feedback name
    showScreen("studentChat");
    toast("Welcome to " + d.className + "!");
    
    // Save state
    userRole = "student";
    saveState();

    listenStudentQuestions();
    listenClassStatus();
    startPresence();
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
// ===== STUDENT: FILTERS & RENDERING =====
var studentQuestionsCache = [];

function listenStudentQuestions() {
  if (studentUnsubscribe) studentUnsubscribe();

  // Optimizing: Use two listeners or filter carefully. 
  // For compat v10, we'll keep one listener for now but optimize the CACHE and RENDERING.
  studentUnsubscribe = db.collection("questions")
    .where("classId", "==", currentClassId)
    .onSnapshot(function (snapshot) {
      var currentStudentName = $("joinName").value.trim();
      
      snapshot.docChanges().forEach(function(change) {
        var docId = change.doc.id;
        var d = change.doc.data();
        
        // Only keep if public or mine
        if (d.isPublic || d.studentName === currentStudentName) {
          if (change.type === "added") {
            studentQuestionsCache.push({ id: docId, data: d });
          } else if (change.type === "modified") {
            var idx = studentQuestionsCache.findIndex(q => q.id === docId);
            if (idx !== -1) studentQuestionsCache[idx].data = d;
            else studentQuestionsCache.push({ id: docId, data: d }); // Might have become public
          } else if (change.type === "removed") {
            studentQuestionsCache = studentQuestionsCache.filter(q => q.id !== docId);
          }
        } else {
          // If it was in cache but no longer public/mine (e.g. hidden by teacher)
          studentQuestionsCache = studentQuestionsCache.filter(q => q.id !== docId);
        }
      });

      renderStudentQuestions();
    });
}

function renderStudentQuestions() {
  var container = $("studentResponses");
  var currentStudentName = $("joinName").value.trim();

  if (studentQuestionsCache.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-icon">🤔</div>' +
      "<p>No questions yet. Your questions and public ones will appear here.</p>" +
      "</div>";
    return;
  }

  // Sort
  studentQuestionsCache.sort(function(a, b) {
    var timeA = a.data.timestamp ? a.data.timestamp.toMillis() : 0;
    var timeB = b.data.timestamp ? b.data.timestamp.toMillis() : 0;
    return timeB - timeA;
  });

  container.innerHTML = "";
  studentQuestionsCache.forEach(function (item) {
    var d = item.data;
    var card = document.createElement("div");
    card.className = "student-q-card fade-in";

    var header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "flex-start";
    header.style.marginBottom = "8px";

    var isMine = (d.studentName === currentStudentName);

    var question = document.createElement("div");
    question.className = "sq-question";
    question.textContent = (isMine ? "🙋‍♂️ You: " : "❓ ") + d.question;
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
    } else if (!d.isPublic) {
      answer.textContent = "⏳ Hidden from class (Only visible to you)";
    } else {
      answer.textContent = "⏳ Waiting for teacher...";
    }

    card.appendChild(header);
    card.appendChild(answer);
    container.appendChild(card);
  });
}

function listenClassStatus() {
  if (classUnsubscribe) classUnsubscribe();

  classUnsubscribe = db.collection("classes").doc(currentClassId)
    .onSnapshot(function(doc) {
      if (!doc.exists) return;
      var d = doc.data();
      if (d.feedbackRequested) {
        $("studentGiveFeedbackBtn").classList.remove("hidden");
        // Ensure student feedback form name is always up to date
        if (!$("feedbackName").value) {
          $("feedbackName").value = $("joinName").value.trim();
        }
      } else {
        $("studentGiveFeedbackBtn").classList.add("hidden");
      }
    }, function(error) {
      console.error("Status Listener Error:", error);
    });
}

function submitFeedback() {
  var usn = $("feedbackUsn").value.trim();
  var rating = $("feedbackRating").value;
  var comment = $("feedbackComment").value.trim();
  var name = $("feedbackName").value;

  if (!usn) { toast("Please enter your USN", "error"); return; }

  db.collection("feedback").add({
    classId: currentClassId,
    studentName: name,
    usn: usn,
    rating: rating,
    comment: comment,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    $("studentFeedback").querySelector(".glass-card").classList.add("hidden");
    $("feedbackThanks").classList.remove("hidden");
    toast("Feedback submitted! Thank you.");
    if (presenceInterval) clearInterval(presenceInterval);
  }).catch(function(err) {
    console.error(err);
    toast("Failed to submit feedback", "error");
  });
}

function startPresence() {
  if (presenceInterval) clearInterval(presenceInterval);
  
  var name = $("joinName").value.trim();
  var studentDocId = currentClassId + "_" + name.replace(/\s+/g, "_");

  function update() {
    db.collection("students").doc(studentDocId).set({
      classId: currentClassId,
      studentName: name,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  update(); // Immediate update
  presenceInterval = setInterval(update, 30000); // Every 30 seconds
}

function setQuickFeedback(text) {
  var area = $("feedbackComment");
  if (area.value) {
    area.value += " | " + text;
  } else {
    area.value = text;
  }
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

  // Teacher: request feedback
  $("requestFeedbackBtn").addEventListener("click", requestFeedback);

  // Teacher: export feedback
  $("exportFeedbackBtn").addEventListener("click", exportFeedbackToCSV);

  // Student: submit feedback
  $("submitFeedbackBtn").addEventListener("click", submitFeedback);

  // Student: feedback button toggle
  $("studentGiveFeedbackBtn").addEventListener("click", function() {
    showScreen("studentFeedback");
  });

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

  // Back Button Logic
  window.onpopstate = function(event) {
    if (event.state && event.state.screen) {
      showScreen(event.state.screen, true);
    } else {
      showScreen("home", true);
    }
  };

  // State Persistence: Try to auto-rejoin
  tryRestoreState();
});

// ===== STATE PERSISTENCE =====
function saveState() {
  var state = {
    classId: currentClassId,
    password: currentPassword,
    role: userRole,
    name: $("joinName").value.trim()
  };
  localStorage.setItem("doubtbox_state", JSON.stringify(state));
}

function clearState() {
  localStorage.removeItem("doubtbox_state");
}

function tryRestoreState() {
  var saved = localStorage.getItem("doubtbox_state");
  if (!saved) return;
  try {
    var s = JSON.parse(saved);
    if (s.role === "teacher") {
      $("rejoinClassId").value = s.classId;
      $("rejoinPassword").value = s.password;
      // We don't auto-rejoin teacher because it's safer to ask for password again 
      // but we fill the fields.
    } else if (s.role === "student") {
      $("joinId").value = s.classId;
      $("joinPassword").value = s.password;
      $("joinName").value = s.name;
      // Auto-join student if name is present
      if (s.name && s.classId && s.password) {
        joinClass();
      }
    }
  } catch(e) { console.error(e); }
}
