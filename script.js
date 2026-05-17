/* =========================================================
   Civics Prep Quiz — script.js
   Vanilla JavaScript. No frameworks.
   ========================================================= */

(function () {
  "use strict";

  const TOTAL_QUESTIONS = 1;
  const TOTAL_SECONDS = TOTAL_QUESTIONS * 60; // 100 minutes cumulative

  // ----- DOM refs -----
  const startScreen   = document.getElementById("start-screen");
  const quizScreen    = document.getElementById("quiz-screen");
  const resultScreen  = document.getElementById("result-screen");
  const practiceOpts  = document.getElementById("practice-options");

  const startForm     = document.getElementById("start-form");
  const nameInput     = document.getElementById("student-name");

  const progressText  = document.getElementById("progress-text");
  const progressFill  = document.getElementById("progress-fill");
  const progressBar   = progressFill.parentElement;
  const scoreText     = document.getElementById("score-text");
  const timerEl       = document.getElementById("timer");

  const questionText  = document.getElementById("question-text");
  const optionsList   = document.getElementById("options-list");
  const feedbackEl    = document.getElementById("feedback");
  const nextBtn       = document.getElementById("next-btn");

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
  let allQuestions   = [];   // loaded from questions.json
  let quizQuestions  = [];   // active sequence (shuffled main quiz or missed-only practice)
  let currentIndex   = 0;
  let correctCount   = 0;
  let incorrectCount = 0;
  let answered       = false;
  let missed         = [];   // missed questions from main quiz (for hard practice)
  let lastResult     = null; // payload for CSV
  let studentName    = "";
  let mode           = "main"; // "main" | "practice"
  let useTimerInPractice = false;

  // Timer state
  let timerId        = null;
  let remainingSecs  = 0;
  let timerActive    = false;
  let autoSubmitted  = false;

  // ----- Init -----
  loadQuestions();

  startForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    studentName = name;
    beginMainQuiz();
  });

  nextBtn.addEventListener("click", handleNext);
  downloadBtn.addEventListener("click", downloadCsv);
  practiceBtn.addEventListener("click", showPracticeOptions);
  restartBtn.addEventListener("click", function () {
    location.reload();
  });
  startPractice.addEventListener("click", beginPractice);
  backToResult.addEventListener("click", function () {
    show(resultScreen);
    hide(practiceOpts);
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
          'Please serve this page over HTTP (e.g. via Docker or a local server).</p>';
      });
  }

  // =====================================================
  //  Main quiz
  // =====================================================
  function beginMainQuiz() {
    mode = "main";
    quizQuestions = shuffle(allQuestions.slice());
    currentIndex = 0;
    correctCount = 0;
    incorrectCount = 0;
    missed = [];
    autoSubmitted = false;

    hide(startScreen);
    show(quizScreen);

    startTimer(TOTAL_SECONDS);
    renderQuestion();
  }

  // =====================================================
  //  Practice mode
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
    if (missed.length === 0) {
      hide(practiceOpts);
      show(resultScreen);
      return;
    }
    const choice = document.querySelector('input[name="practice-timer"]:checked');
    useTimerInPractice = choice && choice.value === "on";

    mode = "practice";
    quizQuestions = shuffle(missed.slice());
    currentIndex = 0;
    correctCount = 0;
    incorrectCount = 0;
    autoSubmitted = false;

    hide(practiceOpts);
    show(quizScreen);

    if (useTimerInPractice) {
      startTimer(quizQuestions.length * 60);
    } else {
      stopTimer();
      timerEl.textContent = "Practice mode (no timer)";
      timerEl.classList.remove("warning");
    }
    renderQuestion();
  }

  // =====================================================
  //  Question rendering
  // =====================================================
  function renderQuestion() {
    answered = false;
    feedbackEl.textContent = "";
    feedbackEl.className = "feedback";
    nextBtn.disabled = true;

    const total = quizQuestions.length;
    const q = quizQuestions[currentIndex];

    progressText.textContent = "Question " + (currentIndex + 1) + " of " + total;
    const pct = Math.round(((currentIndex) / total) * 100);
    progressFill.style.width = pct + "%";
    progressBar.setAttribute("aria-valuenow", String(pct));
    updateScoreText();

    questionText.textContent = q.question;
    optionsList.innerHTML = "";

    const letters = ["a", "b", "c", "d"];
    letters.forEach(function (letter) {
      const li = document.createElement("li");
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

    // On the LAST question of the main quiz, the Submit button must remain
    // visible regardless of remaining time. We swap the label and force-enable
    // it only after an answer is selected (consistent with prior questions).
    if (mode === "main" && currentIndex === total - 1) {
      nextBtn.textContent = "Submit Quiz";
    } else if (currentIndex === total - 1) {
      nextBtn.textContent = "Finish";
    } else {
      nextBtn.textContent = "Next";
    }
  }

  function selectAnswer(letter, btnEl) {
    if (answered) return;
    answered = true;

    const q = quizQuestions[currentIndex];
    const correct = q.correct_answer;
    const isCorrect = letter === correct;

    // Lock all buttons; highlight correct + selection.
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
      feedbackEl.textContent =
        "Incorrect. Correct answer: " + q.options[correct];
      feedbackEl.classList.add("wrong");
      if (mode === "main") missed.push(q);
    }

    updateScoreText();
    nextBtn.disabled = false;
  }

  function handleNext() {
    if (!answered) return;
    if (currentIndex < quizQuestions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      finishQuiz(false);
    }
  }

  function updateScoreText() {
    const total = mode === "main" ? TOTAL_QUESTIONS : quizQuestions.length;
    scoreText.textContent =
      "Score: " + correctCount + " out of " + total + " correct";
  }

  // =====================================================
  //  Timer (cumulative, carry-forward by design)
  //  Single global countdown — unused time naturally carries
  //  forward because we never reset between questions.
  // =====================================================
  function startTimer(seconds) {
    stopTimer();
    remainingSecs = seconds;
    timerActive = true;
    updateTimerDisplay();
    timerId = setInterval(function () {
      remainingSecs--;
      if (remainingSecs <= 0) {
        remainingSecs = 0;
        updateTimerDisplay();
        stopTimer();
        autoSubmitOnTimeout();
        return;
      }
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    timerActive = false;
  }

  function updateTimerDisplay() {
    const m = Math.floor(remainingSecs / 60);
    const s = remainingSecs % 60;
    timerEl.textContent =
      "Time left: " + m + ":" + (s < 10 ? "0" : "") + s;
    if (remainingSecs <= 60) {
      timerEl.classList.add("warning");
    } else {
      timerEl.classList.remove("warning");
    }
  }

  function autoSubmitOnTimeout() {
    autoSubmitted = true;
    // Any unanswered remaining questions count as incorrect.
    const unanswered = quizQuestions.length - (correctCount + incorrectCount);
    if (unanswered > 0) {
      // Track them as missed (so practice still picks them up after a timeout).
      for (let i = currentIndex; i < quizQuestions.length; i++) {
        const q = quizQuestions[i];
        if (i === currentIndex && answered) continue; // current already counted
        if (mode === "main") missed.push(q);
      }
      incorrectCount += unanswered;
    }
    finishQuiz(true);
  }

  // =====================================================
  //  Finish + result
  // =====================================================
  function finishQuiz(viaTimeout) {
    stopTimer();
    hide(quizScreen);
    show(resultScreen);

    const total = mode === "main" ? TOTAL_QUESTIONS : quizQuestions.length;
    const correct = correctCount;
    const incorrect = total - correct;
    const percent = total === 0 ? 0 : Math.round((correct / total) * 100);

    const now = new Date();
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
      resultNote.textContent =
        "Time expired. Unanswered questions were counted as incorrect.";
      show(resultNote);
    } else {
      resultNote.textContent = "";
      hide(resultNote);
    }

    // Only the main quiz produces a downloadable CSV and a hard-practice option.
    if (mode === "main") {
      lastResult = {
        student_name: studentName,
        total_questions: total,
        correct_answers: correct,
        incorrect_answers: incorrect,
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
    } else {
      // Practice run: hide CSV download (the brief scopes CSV to the main result).
      downloadBtn.classList.add("hidden");
      practiceBtn.classList.add("hidden");
    }
  }

  // =====================================================
  //  CSV download
  // =====================================================
  function downloadCsv() {
    if (!lastResult) return;
    const header = [
      "student_name", "total_questions", "correct_answers",
      "incorrect_answers", "percentage_score", "date", "time"
    ];
    const row = header.map(function (h) { return csvEscape(lastResult[h]); });
    const csv = header.join(",") + "\n" + row.join(",") + "\n";

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filenameFor(lastResult);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function filenameFor(r) {
    const safeName = (r.student_name || "student")
      .replace(/[^a-z0-9_\-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "student";
    return "civics_result_" + safeName + "_" + r.date + ".csv";
  }

  function csvEscape(value) {
    const s = String(value == null ? "" : value);
    if (/[",\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
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
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
