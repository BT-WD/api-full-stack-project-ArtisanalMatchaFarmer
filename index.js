// ---------- GLOBALS ----------
let currentQuestionData = null;
let currentCorrectAnswer = '';
let currentAnswersArray = [];
let currentQuestionIndex = 1;
const TOTAL_QUESTIONS = 10;
let currentScore = 0;
let questionAnswered = false;
let isFetching = false;

// DOM elements
const questionTextEl = document.getElementById('question-text');
const answersContainer = document.getElementById('answers-container');
const categoryDisplay = document.getElementById('category-display');
const difficultyDisplay = document.getElementById('difficulty-display');
const questionCounterEl = document.getElementById('question-counter');
const scoreSpan = document.getElementById('quiz-score');
const submitBtn = document.getElementById('submit-btn');
const nextBtn = document.getElementById('next-btn');
const resetBtn = document.getElementById('reset-btn');
const feedbackDiv = document.getElementById('feedback-message');

function updateScoreUI() {
    scoreSpan.textContent = currentScore;
}

function updateCounterUI() {
    questionCounterEl.innerHTML = `<span class="meta-icon">🔢</span> Question: <strong>${currentQuestionIndex} / ${TOTAL_QUESTIONS}</strong>`;
}

let feedbackTimeout = null;
function showFeedback(message, isError = false) {
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    feedbackDiv.textContent = message;
    feedbackDiv.style.background = isError ? '#ffe6e5' : '#fef9e6';
    feedbackDiv.style.color = isError ? '#b13e3e' : '#8a6e2f';
    feedbackTimeout = setTimeout(() => {
        if (feedbackDiv) feedbackDiv.textContent = '';
    }, 2000);
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function renderAnswerOptions() {
    if (!answersContainer) return;
    answersContainer.innerHTML = '';
    currentAnswersArray.forEach((answerText) => {
        const label = document.createElement('label');
        label.className = 'answer-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'quiz-answer';
        radio.value = answerText;
        radio.disabled = questionAnswered;  // only disabled after answering
        label.appendChild(radio);
        label.appendChild(document.createTextNode(answerText));
        answersContainer.appendChild(label);
    });
}

function setAnswersEnabled(enabled) {
    const radios = document.querySelectorAll('#answers-container input[type="radio"]');
    radios.forEach(radio => radio.disabled = !enabled);
}

function clearSelectedAnswer() {
    const selected = document.querySelector('#answers-container input[type="radio"]:checked');
    if (selected) selected.checked = false;
}

function decodeHtml(html) {
    if (!html) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
}

// Fetch with retry (up to 3 attempts)
async function fetchQuestionWithRetry(attempts = 3) {
    for (let i = 0; i < attempts; i++) {
        try {
            const response = await fetch('https://opentdb.com/api.php?amount=1&type=multiple');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.response_code === 0 && data.results && data.results.length > 0) {
                const result = data.results[0];
                return {
                    question: decodeHtml(result.question),
                    correctAnswer: decodeHtml(result.correct_answer),
                    incorrectAnswers: result.incorrect_answers.map(decodeHtml),
                    category: decodeHtml(result.category),
                    difficulty: result.difficulty.charAt(0).toUpperCase() + result.difficulty.slice(1)
                };
            } else {
                console.warn(`Attempt ${i+1}: API returned response_code ${data.response_code}`);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (err) {
            console.error(`Attempt ${i+1} failed:`, err);
            if (i === attempts - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    throw new Error('Could not fetch a valid question after multiple attempts');
}

async function fetchQuestion() {
    if (isFetching) return null;
    isFetching = true;
    try {
        questionTextEl.textContent = 'Loading next question...';
        submitBtn.disabled = true;
        nextBtn.disabled = true;
        setAnswersEnabled(false);

        const questionObj = await fetchQuestionWithRetry(3);
        return questionObj;
    } catch (err) {
        console.error('Fetch error:', err);
        showFeedback('❌ Failed to load question. Please check your connection or try again.', true);
        questionTextEl.textContent = '⚠️ Unable to fetch question. Click "Restart quiz" to retry.';
        submitBtn.disabled = true;
        nextBtn.disabled = true;
        return null;
    } finally {
        isFetching = false;
        submitBtn.disabled = false;
        nextBtn.disabled = false;
    }
}

async function loadNewQuestion() {
    questionAnswered = false;
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    feedbackDiv.textContent = '';
    clearSelectedAnswer();

    const qData = await fetchQuestion();
    if (!qData) return;

    currentQuestionData = qData;
    currentCorrectAnswer = qData.correctAnswer;
    const allAnswers = [qData.correctAnswer, ...qData.incorrectAnswers];
    currentAnswersArray = shuffleArray([...allAnswers]);

    questionTextEl.textContent = qData.question;
    categoryDisplay.innerHTML = `<span class="meta-icon">📂</span> Category: <strong>${escapeHtml(qData.category)}</strong>`;
    difficultyDisplay.innerHTML = `<span class="meta-icon">⚙️</span> Difficulty: <strong>${escapeHtml(qData.difficulty)}</strong>`;

    renderAnswerOptions();
    setAnswersEnabled(true);
    submitBtn.disabled = false;
    nextBtn.disabled = false;
}

async function proceedToNextQuestion() {
    if (currentQuestionIndex === TOTAL_QUESTIONS) {
        endGame();
        return;
    }
    currentQuestionIndex++;
    updateCounterUI();
    await loadNewQuestion();
}

function endGame() {
    questionTextEl.textContent = `🏆 Quiz completed! Your final score: ${currentScore} / ${TOTAL_QUESTIONS}`;
    answersContainer.innerHTML = '<div style="text-align:center; padding:1rem;">🎉 Great job! Press Restart to play again.</div>';
    submitBtn.disabled = true;
    nextBtn.disabled = true;
    setAnswersEnabled(false);
    showFeedback(`Game over! Final score: ${currentScore} out of ${TOTAL_QUESTIONS}`, false);
}

// Submit: only checks answer, no auto-advance
function handleSubmit() {
    if (questionAnswered) {
        showFeedback('You already answered this question! Click Next to continue.', false);
        return;
    }
    if (isFetching) {
        showFeedback('Please wait, loading question...', false);
        return;
    }

    const selectedRadio = document.querySelector('#answers-container input[type="radio"]:checked');
    if (!selectedRadio) {
        showFeedback('Please select an answer before submitting.', true);
        return;
    }

    const userAnswer = selectedRadio.value;
    const isCorrect = (userAnswer === currentCorrectAnswer);

    if (isCorrect) {
        currentScore++;
        updateScoreUI();
        showFeedback(`✅ Correct! +1 point. Answer: ${currentCorrectAnswer}`, false);
    } else {
        showFeedback(`❌ Wrong! The correct answer is: ${currentCorrectAnswer}`, false);
    }

    // Mark as answered, disable radios & submit button
    questionAnswered = true;
    setAnswersEnabled(false);
    submitBtn.disabled = true;
    // Next button remains enabled – user must click it manually
}

// Next button: moves to next question (no penalty, no auto-advance)
function handleNext() {
    if (isFetching) {
        showFeedback('Please wait, loading question...', false);
        return;
    }
    if (currentQuestionIndex === TOTAL_QUESTIONS) {
        // If game already finished, do nothing or restart? We'll just ignore.
        if (questionTextEl.textContent.includes('Quiz completed')) {
            showFeedback('Quiz is already finished. Press Restart to play again.', false);
            return;
        }
    }
    // Allow moving even if question not answered (no penalty)
    proceedToNextQuestion();
}

async function resetQuiz() {
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    isFetching = false;
    currentScore = 0;
    currentQuestionIndex = 1;
    questionAnswered = false;
    updateScoreUI();
    updateCounterUI();
    feedbackDiv.textContent = '';

    submitBtn.disabled = false;
    nextBtn.disabled = false;
    await loadNewQuestion();
    showFeedback('🔄 Quiz restarted! Good luck.', false);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Event listeners
submitBtn.addEventListener('click', handleSubmit);
nextBtn.addEventListener('click', handleNext);
resetBtn.addEventListener('click', resetQuiz);

// Initial load
(async function init() {
    await loadNewQuestion();
    updateCounterUI();
    updateScoreUI();
})();