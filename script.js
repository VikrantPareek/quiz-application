/* =========================================================
   Civics Prep Quiz — script.js
   Vanilla JavaScript. No frameworks.
   ========================================================= */

(function () {
  "use strict";

  const TOTAL_QUESTIONS = 100;
  const SECS_PER_Q      = 60; // 1 minute per question for ALL modes

  // ----- DOM refs -----
  const startScreen   = document.getElementById("start-screen");
  const quizScreen    = document.getElementById("quiz-screen");
  const resultScreen  = document.getElementById("result-screen");
  const practiceOpts  = document.getElementById("practice-options");

  const startForm     = document.getElementById("start-form");
  const nameInput     = document.getElementById("student-name");
  const hardModeStart = document.getElementById("hard-mode-start");
  const hardModeResult= document.getElementById("hard-mode-result");

  const progressText  = document.getElementById("progress-text");
  const progressFill  = document.getElementById("progress-fill");
  const progressBar   = progressFill.parentElement;
  const scoreText     = document.getElementById("score-text");
  const timerEl       = document.getElementById("timer");

  const questionText  = document.getElementById("question-text");
  const optionsList   = document.getElementById("options-list");
  const feedbackEl    = document.getElementById("feedback");
  const nextBtn       = document.getElementById("next-btn");
  const quitBtn       = document.getElementById("quit-btn");

  const rName         = document.getElementById("r-name");
  const rTotal        = document.getElementById("r-total");
  const rCorrect      = document.getElementById("r-correct");
  const rIncorrect    = document.getElementById("r-incorrect");
  const rPercent      = document.getElementById("r-percent");
  const rDate         = document.getElementById("r-date");
  const rTime         = document.getElementById("r-time");
  const resultNote    = document.getElementById("result-note");

  const downloadBtn   = document.getElementById("download-csv");
  const practiceBtn   = document.getElementById("practice-hard");
  const restartBtn    = document.getElementById("restart");

  const practiceCount = document.getElementById("practice-count");
  const startPractice = document.getElementById("start-practice");
  const backToResult  = document.getElementById("back-to-result");

  // ----- State -----
  let allQuestions   = [];
  let quizQuestions  = [];
  let currentIndex   = 0;
  let correctCount   = 0;
  let incorrectCount = 0;
  let answered       = false;
  let missed         = [];
  let lastResult     = null;
  let studentName    = "";
  let mode           = "main"; // "main" | "hard" | "practice"

  // Timer state
  let timerId       = null;
  let remainingSecs = 0;
  let timerActive   = false;

  // ----- Init -----
  loadQuestions();

  startForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    studentName = name;
    beginQuiz("main");
  });

  hardModeStart.addEventListener("click", function () {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    studentName = name;
    beginQuiz("hard");
  });

  hardModeResult.addEventListener("click", function () {
    // Combine is_hard questions + missed questions (deduplicated)
    const hardQs   = allQuestions.filter(function (q) { return q.is_hard === true; });
    const missedMap = {};
    missed.forEach(function (q) { missedMap[q.question] = q; });
    hardQs.forEach(function (q) { missedMap[q.question] = q; });
    const combined = Object.values(missedMap);

    hide(resultScreen);

    mode           = "hard";
    quizQuestions  = shuffle(combined);
    currentIndex   = 0;
    correctCount   = 0;
    incorrectCount = 0;
    missed         = [];

    show(quizScreen);
    renderQuestion();
  });

  nextBtn.addEventListener("click", handleNext);
  downloadBtn.addEventListener("click", downloadCsv);
  practiceBtn.addEventListener("click", showPracticeOptions);
  restartBtn.addEventListener("click", function () { location.reload(); });
  startPractice.addEventListener("click", beginPractice);
  backToResult.addEventListener("click", function () {
    show(resultScreen);
    hide(practiceOpts);
  });

  quitBtn.addEventListener("click", function () {
    if (!confirm("Quit the quiz? Your progress will be lost.")) return;
    stopTimer();
    location.reload();
  });

  // =====================================================
  //  Data loading
  // =====================================================
  function loadQuestions() {
    fetch("questions.json")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load questions.json: " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("questions.json is empty or invalid");
        }
        allQuestions = data;
      })
      .catch(function (err) {
        console.error(err);
        startForm.innerHTML =
          '<p style="color:#DC2626">Could not load questions.json. ' +
          "Please serve this page over HTTP.</p>";
      });
  }

  // =====================================================
  //  Begin quiz
  // =====================================================
  function beginQuiz(quizMode) {
    mode = quizMode;

    // Hard mode: only questions with is_hard === true
    const pool = (mode === "hard")
      ? allQuestions.filter(function (q) { return q.is_hard === true; })
      : allQuestions.slice();

    if (pool.length === 0) {
      alert("No questions found for this mode.");
      return;
    }

    quizQuestions  = shuffle(pool);
    currentIndex   = 0;
    correctCount   = 0;
    incorrectCount = 0;
    missed         = [];

    hide(startScreen);
    show(quizScreen);

    renderQuestion(); // renderQuestion starts the timer for Q1
  }

  // =====================================================
  //  Practice mode (after main/hard quiz)
  // =====================================================
  function showPracticeOptions() {
    practiceCount.textContent =
      "You missed " + missed.length +
      (missed.length === 1 ? " question." : " questions.") +
      " Review them below.";
    hide(resultScreen);
    show(practiceOpts);
  }

  function beginPractice() {
    if (missed.length === 0) { hide(practiceOpts); show(resultScreen); return; }

    const choice = document.querySelector('input[name="practice-timer"]:checked');
    const useTimer = choice && choice.value === "on";

    mode = "practice";
    quizQuestions  = shuffle(missed.slice());
    currentIndex   = 0;
    correctCount   = 0;
    incorrectCount = 0;

    hide(practiceOpts);
    show(quizScreen);

    if (useTimer) {
      renderQuestion(); // timer starts inside renderQuestion
    } else {
      stopTimer();
      timerEl.textContent = "No timer";
      timerEl.classList.remove("warning");
      renderQuestionNoTimer();
    }
  }

  // =====================================================
  //  Question rendering
  // =====================================================
  function renderQuestion() {
    setupQuestion();
    startPerQuestionTimer(); // fresh 60-second countdown every question
  }

  function renderQuestionNoTimer() {
    setupQuestion();
    // no timer started
  }

  function setupQuestion() {
    answered = false;
    feedbackEl.textContent = "";
    feedbackEl.className = "feedback";
    nextBtn.disabled = true;

    const total = quizQuestions.length;
    const q = quizQuestions[currentIndex];

    progressText.textContent = "Question " + (currentIndex + 1) + " of " + total;
    const pct = Math.round((currentIndex / total) * 100);
    progressFill.style.width = pct + "%";
    progressBar.setAttribute("aria-valuenow", String(pct));
    updateScoreText();

    questionText.textContent = q.question;
    optionsList.innerHTML = "";

    const letters = ["a", "b", "c", "d"];
    letters.forEach(function (letter) {
      const li  = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn";
      btn.dataset.letter = letter;
      btn.innerHTML =
        '<span class="option-letter">' + letter.toUpperCase() + ".</span>" +
        " " + escapeHtml(q.options[letter]);
      btn.addEventListener("click", function () { selectAnswer(letter, btn); });
      li.appendChild(btn);
      optionsList.appendChild(li);
    });

    const isLast = currentIndex === quizQuestions.length - 1;
    if (mode === "main" && isLast) {
      nextBtn.textContent = "Submit Quiz";
    } else if (isLast) {
      nextBtn.textContent = "Finish";
    } else {
      nextBtn.textContent = "Next";
    }
  }

  function selectAnswer(letter, btnEl) {
    if (answered) return;
    answered = true;
    stopTimer(); // stop the countdown as soon as they answer

    const q = quizQuestions[currentIndex];
    const correct = q.correct_answer;
    const isCorrect = letter === correct;

    const buttons = optionsList.querySelectorAll(".option-btn");
    buttons.forEach(function (b) {
      b.disabled = true;
      if (b.dataset.letter === correct) b.classList.add("correct");
    });
    if (!isCorrect) btnEl.classList.add("wrong");

    if (isCorrect) {
      correctCount++;
      feedbackEl.textContent = "Correct!";
      feedbackEl.classList.add("correct");
    } else {
      incorrectCount++;
      feedbackEl.textContent = "Incorrect. Correct answer: " + q.options[correct];
      feedbackEl.classList.add("wrong");
      missed.push(q);
    }

    updateScoreText();
    nextBtn.disabled = false;
  }

  function handleNext() {
    if (!answered) return;
    if (currentIndex < quizQuestions.length - 1) {
      currentIndex++;
      // Resume with timer or without depending on mode
      if (mode === "practice") {
        const choice = document.querySelector('input[name="practice-timer"]:checked');
        if (choice && choice.value === "on") {
          renderQuestion();
        } else {
          renderQuestionNoTimer();
        }
      } else {
        renderQuestion();
      }
    } else {
      finishQuiz(false);
    }
  }

  function updateScoreText() {
    scoreText.textContent = correctCount + " correct";
  }

  // =====================================================
  //  Per-question timer (1 min, no carry-forward)
  // =====================================================
  function startPerQuestionTimer() {
    stopTimer();
    remainingSecs = SECS_PER_Q;
    timerActive = true;
    updateTimerDisplay();
    timerId = setInterval(function () {
      remainingSecs--;
      if (remainingSecs <= 0) {
        remainingSecs = 0;
        updateTimerDisplay();
        stopTimer();
        autoSkipQuestion();
        return;
      }
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    if (timerId !== null) { clearInterval(timerId); timerId = null; }
    timerActive = false;
  }

  function updateTimerDisplay() {
    const m = Math.floor(remainingSecs / 60);
    const s = remainingSecs % 60;
    timerEl.textContent = m + ":" + (s < 10 ? "0" : "") + s;
    timerEl.classList.toggle("warning", remainingSecs <= 15);
  }

  // Time's up on this question — mark wrong, reveal answer, auto-advance after 2s
  function autoSkipQuestion() {
    if (answered) return;
    answered = true;

    incorrectCount++;
    missed.push(quizQuestions[currentIndex]);

    const correct = quizQuestions[currentIndex].correct_answer;
    const buttons = optionsList.querySelectorAll(".option-btn");
    buttons.forEach(function (b) {
      b.disabled = true;
      if (b.dataset.letter === correct) b.classList.add("correct");
    });

    feedbackEl.textContent = "Time's up! Correct: " + quizQuestions[currentIndex].options[correct];
    feedbackEl.className = "feedback wrong";
    updateScoreText();

    // Auto-advance to next question after 2 seconds
    setTimeout(function () {
      if (currentIndex < quizQuestions.length - 1) {
        currentIndex++;
        renderQuestion();
      } else {
        finishQuiz(false);
      }
    }, 2000);
  }

  // =====================================================
  //  Finish + result
  // =====================================================
  function finishQuiz(viaTimeout) {
    stopTimer();
    hide(quizScreen);
    show(resultScreen);

    const total     = quizQuestions.length;
    const correct   = correctCount;
    const incorrect = total - correct;
    const percent   = total === 0 ? 0 : Math.round((correct / total) * 100);

    const now     = new Date();
    const dateStr = formatDate(now);
    const timeStr = formatTime(now);

    rName.textContent      = studentName || "—";
    rTotal.textContent     = String(total);
    rCorrect.textContent   = String(correct);
    rIncorrect.textContent = String(incorrect);
    rPercent.textContent   = percent + "%";
    rDate.textContent      = dateStr;
    rTime.textContent      = timeStr;

    if (viaTimeout) {
      resultNote.textContent = "Time expired. Question was counted as incorrect.";
      show(resultNote);
    } else {
      resultNote.textContent = "";
      hide(resultNote);
    }

    lastResult = {
      student_name:     studentName,
      total_questions:  total,
      correct_answers:  correct,
      incorrect_answers:incorrect,
      percentage_score: percent + "%",
      date: dateStr,
      time: timeStr
    };

    downloadBtn.classList.remove("hidden");

    if (missed.length > 0) {
      practiceBtn.classList.remove("hidden");
    } else {
      practiceBtn.classList.add("hidden");
    }
  }

  // =====================================================
  //  CSV download
  // =====================================================
  function downloadCsv() {
    if (!lastResult) return;
    const header = [
      "student_name","total_questions","correct_answers",
      "incorrect_answers","percentage_score","date","time"
    ];
    const row = header.map(function (h) { return csvEscape(lastResult[h]); });
    const csv = header.join(",") + "\n" + row.join(",") + "\n";

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = filenameFor(lastResult);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function filenameFor(r) {
    const safeName = (r.student_name || "student")
      .replace(/[^a-z0-9_\-]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "student";
    return "civics_result_" + safeName + "_" + r.date + ".csv";
  }

  function csvEscape(value) {
    const s = String(value == null ? "" : value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // =====================================================
  //  Helpers
  // =====================================================
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function formatDate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function formatTime(d) {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return h + ":" + pad2(m) + " " + ampm;
  }

})();