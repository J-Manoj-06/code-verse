let editor;
let questions = [];
let currentQuestionIdx = 0;
let codeStates = {};
let lastUsedLanguage = 'python';
const timerEl = document.getElementById('timer');
const questionTitleEl = document.getElementById('question-title');
const inputEl = document.getElementById('input');
const expectedEl = document.getElementById('expected');
const outputEl = document.getElementById('output');
const messageEl = document.getElementById('message');
const runBtn = document.getElementById('run-btn');
const submitBtn = document.getElementById('submit-btn');
const alertEl = document.getElementById('anti-cheat-alert');
const languageSelector = document.getElementById('language-selector');
const switcherEl = document.getElementById('question-switcher');

// Default code templates for each language
const DEFAULT_TEMPLATES = {
  python: '# Write your Python code here\n',
  c: '#include <stdio.h>\nint main() {\n    // Write your C code here\n    return 0;\n}',
  cpp: '#include <iostream>\nint main() {\n    // Write your C++ code here\n    return 0;\n}',
  java: 'public class Main {\n    public static void main(String[] args) {\n        // Write your Java code here\n    }\n}',
  javascript: '// Write your JavaScript code here\n'
};

// Load codeStates from localStorage if available
function loadCodeStatesFromStorage() {
  try {
    const saved = localStorage.getItem('automatafix_codeStates');
    if (saved) {
      codeStates = JSON.parse(saved);
    }
    const lastLang = localStorage.getItem('automatafix_lastLanguage');
    if (lastLang) lastUsedLanguage = lastLang;
  } catch (e) { codeStates = {}; }
}

// Save codeStates to localStorage
function saveCodeStatesToStorage() {
  try {
    localStorage.setItem('automatafix_codeStates', JSON.stringify(codeStates));
    localStorage.setItem('automatafix_lastLanguage', lastUsedLanguage);
  } catch (e) {}
}

// Cheating flag persistence
function setCheatingFlag() {
  localStorage.setItem('automatafix_cheating', '1');
}
function getCheatingFlag() {
  return localStorage.getItem('automatafix_cheating') === '1';
}
function clearCheatingFlag() {
  localStorage.removeItem('automatafix_cheating');
}

// Monaco Editor setup
require.config({ paths: { vs: "https://unpkg.com/monaco-editor@latest/min/vs" } });
require(["vs/editor/editor.main"], function () {
  editor = monaco.editor.create(document.getElementById("editor"), {
    value: "",
    language: "python",
    theme: "vs-dark",
    fontSize: 16,
    automaticLayout: true,
    minimap: { enabled: false }
  });

  // If cheating was detected previously, lock everything
  if (getCheatingFlag()) {
    showCheatAlert();
  }

  fetch('questions.json')
    .then(res => res.json())
    .then(data => {
      questions = data;
      loadCodeStatesFromStorage();
      questions.forEach(q => {
        if (!codeStates[q.id]) codeStates[q.id] = {};
        ['python','c','cpp','java','javascript'].forEach(lang => {
          if (typeof q.buggy_code === 'object' && q.buggy_code[lang]) {
            if (!codeStates[q.id][lang]) codeStates[q.id][lang] = q.buggy_code[lang];
          } else if (typeof q.buggy_code === 'string' && lang === q.language) {
            if (!codeStates[q.id][lang]) codeStates[q.id][lang] = q.buggy_code;
          } else {
            if (!codeStates[q.id][lang]) codeStates[q.id][lang] = DEFAULT_TEMPLATES[lang];
          }
        });
      });
      renderSwitcher();
      renderQuestion(0, lastUsedLanguage);
    });
});

// Question switcher
function renderSwitcher() {
  switcherEl.innerHTML = '';
  questions.forEach((q, idx) => {
    const btn = document.createElement('button');
    btn.className = 'question-btn' + (idx === currentQuestionIdx ? ' active' : '');
    btn.textContent = `Q${idx + 1}`;
    btn.onclick = () => {
      // Save current code state for current question/language
      const curQ = questions[currentQuestionIdx];
      codeStates[curQ.id][lastUsedLanguage] = editor.getValue();
      saveCodeStatesToStorage();
      renderQuestion(idx, lastUsedLanguage);
    };
    switcherEl.appendChild(btn);
  });
}

// Track submitted questions
let submittedQuestions = new Set();

// Update question count display
function updateQuestionCount() {
  const countEl = document.getElementById('question-count');
  countEl.textContent = `Q${currentQuestionIdx + 1}/3`;
}

// Render question (keep language unless first load)
function renderQuestion(idx, langToUse) {
  currentQuestionIdx = idx;
  const q = questions[idx];
  questionTitleEl.textContent = q.title;
  inputEl.textContent = q.input;
  expectedEl.textContent = q.expected_output;
  outputEl.textContent = "// Output will appear here";
  showMessage('', '');
  submitBtn.disabled = true;
  // Use lastUsedLanguage or default
  const lang = langToUse || lastUsedLanguage || q.language;
  lastUsedLanguage = lang;
  languageSelector.value = lang;
  if (editor) {
    editor.setValue(codeStates[q.id][lang] || DEFAULT_TEMPLATES[lang]);
    monaco.editor.setModelLanguage(editor.getModel(), getMonacoLang(lang));
  }
  Array.from(switcherEl.children).forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
  saveCodeStatesToStorage();
  updateQuestionCount();
}

// Language selector
languageSelector.onchange = () => {
  const lang = languageSelector.value;
  lastUsedLanguage = lang;
  const q = questions[currentQuestionIdx];
  // Save current code state for previous language
  const prevLang = editor.getModel().getLanguageId();
  codeStates[q.id][prevLang] = editor.getValue();
  saveCodeStatesToStorage();
  // Set editor value to code for new language
  editor.setValue(codeStates[q.id][lang] || DEFAULT_TEMPLATES[lang]);
  monaco.editor.setModelLanguage(editor.getModel(), getMonacoLang(lang));
};

// Save code on every editor change
function setupEditorAutoSave() {
  if (!editor) return;
  editor.onDidChangeModelContent(() => {
    const q = questions[currentQuestionIdx];
    const lang = languageSelector.value;
    codeStates[q.id][lang] = editor.getValue();
    saveCodeStatesToStorage();
  });
}
(function waitForEditor() {
  if (window.monaco && editor) {
    setupEditorAutoSave();
  } else {
    setTimeout(waitForEditor, 100);
  }
})();

// Timer
let seconds = 1800;
setInterval(() => {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
  if (seconds > 0) seconds--;
}, 1000);

// Anti-cheat
let cheatingDetected = false;
window.addEventListener('blur', showCheatAlert);
document.addEventListener('paste', showCheatAlert);
function showCheatAlert(e) {
  cheatingDetected = true;
  setCheatingFlag();
  alertEl.style.display = 'block';
  if (editor) editor.updateOptions({ readOnly: true });
  runBtn.disabled = true;
  submitBtn.disabled = true;
}
function preventCopyPaste(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }
  showCheatAlert();
}
if (editor) {
  editor.onDidPaste(preventCopyPaste);
}
document.addEventListener('copy', preventCopyPaste);
document.addEventListener('cut', preventCopyPaste);
document.addEventListener('paste', preventCopyPaste);
(function waitForEditorForCopyPaste() {
  if (window.monaco && editor) {
    editor.onKeyDown(function(e) {
      if ((e.ctrlKey || e.metaKey) && (e.keyCode === 33 || e.keyCode === 46)) {
        e.preventDefault();
        showCheatAlert();
      }
    });
    editor.onDidPaste(preventCopyPaste);
  } else {
    setTimeout(waitForEditorForCopyPaste, 100);
  }
})();

// Run/Submit
// Gemini API Key placeholder (DO NOT hardcode your key here)
let GEMINI_API_KEY = 'AIzaSyBfU7oIphxoN_0N0T0hNpzP74CRZJXNv2Y';
// Set your Gemini API key in the variable above, e.g. from a secure input or environment variable

// Gemini-powered code output simulation
async function runGemini(source_code, lang, stdin) {
  // Map language names to display names for prompt clarity
  const langDisplay = { python: 'Python', java: 'Java', c: 'C', cpp: 'C++', javascript: 'JavaScript' }[lang] || lang;
  // Construct strict prompt for Gemini
  const prompt = `You are a strict code compiler and executor. Given the following code and input, return ONLY the output as if it was run in a real terminal. No explanations, no markdown, no commentary. If there is a compile error, return only the error message as a compiler would.\n\nLanguage: ${langDisplay}\nCode:\n${source_code}\nInput:\n${stdin}\n\nOutput:`;
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    // Gemini's response format
    let output = '';
    if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
      output = data.candidates[0].content.parts[0].text.trim();
    }
    if (!output) output = '(No response from Gemini)';
    return { stdout: output };
  } catch (error) {
    showMessage(`⚠️ Gemini Error: ${error.message}`, 'error');
    return { stdout: '', stderr: error.message };
  }
}

runBtn.onclick = async () => {
  const q = questions[currentQuestionIdx];
  const lang = languageSelector.value;
  const code = editor.getValue();
  codeStates[q.id][lang] = code;
  saveCodeStatesToStorage();
  outputEl.textContent = '// AI is compiling...';
  showMessage('', '');
  submitBtn.disabled = true;
  // Scroll to output for better UX
  outputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const result = await runGemini(code, lang, q.input);
  const userOutput = (result.stdout || result.stderr || '').trim();
  outputEl.textContent = userOutput || '(No response from Gemini)';
  if (userOutput === q.expected_output.trim()) {
    showMessage('✅ Output matches expected!', 'success');
    submitBtn.disabled = false;
  } else {
    showMessage('❌ Output does not match.', 'error');
  }
};

submitBtn.onclick = () => {
  showMessage("🎉 Code submitted!", "success");
  submitBtn.disabled = true;
  // Track submission
  const q = questions[currentQuestionIdx];
  submittedQuestions.add(q.id);
  // If all 3 questions are submitted
  if (submittedQuestions.size === 3) {
    if (!getCheatingFlag()) {
      // Hide anti-cheat alert if visible
      alertEl.style.display = 'none';
      showMessage('No cheating detected! 🎉', 'success');
      triggerCelebration();
    }
  }
};

// Colorful spray celebration
function triggerCelebration() {
  const container = document.getElementById('celebration');
  container.innerHTML = '';
  container.style.display = 'block';
  // Spray from both sides
  for (let i = 0; i < 60; i++) {
    const sprayL = document.createElement('div');
    const sprayR = document.createElement('div');
    sprayL.className = 'spray';
    sprayR.className = 'spray';
    const color = `hsl(${Math.random()*360},90%,60%)`;
    sprayL.style.background = color;
    sprayR.style.background = color;
    sprayL.style.left = '0';
    sprayR.style.right = '0';
    sprayL.style.top = sprayR.style.top = `${Math.random()*100}vh`;
    sprayL.style.width = sprayR.style.width = '12px';
    sprayL.style.height = sprayR.style.height = '12px';
    sprayL.style.position = sprayR.style.position = 'absolute';
    sprayL.style.borderRadius = sprayR.style.borderRadius = '50%';
    sprayL.style.opacity = sprayR.style.opacity = '0.85';
    // Animate
    sprayL.animate([
      { transform: 'translateX(0)', opacity: 1 },
      { transform: `translateX(${window.innerWidth/2-40}px)`, opacity: 0 }
    ], { duration: 1200 + Math.random()*800, fill: 'forwards' });
    sprayR.animate([
      { transform: 'translateX(0)', opacity: 1 },
      { transform: `translateX(-${window.innerWidth/2-40}px)`, opacity: 0 }
    ], { duration: 1200 + Math.random()*800, fill: 'forwards' });
    container.appendChild(sprayL);
    container.appendChild(sprayR);
  }
  setTimeout(() => { container.style.display = 'none'; }, 2200);
}

// Add spray CSS
(function addSprayCSS() {
  const style = document.createElement('style');
  style.textContent = `.spray { pointer-events:none; z-index:2001; }`;
  document.head.appendChild(style);
})();

function showMessage(msg, type) {
  messageEl.textContent = msg;
  messageEl.className = "message" + (type ? " " + type : "");
  messageEl.style.display = msg ? "block" : "none";
}

function getMonacoLang(lang) {
  return { "python": "python", "java": "java", "c": "c", "cpp": "cpp", "javascript": "javascript" }[lang];
}

// Update question count on load
(function waitForQuestions() {
  if (questions && questions.length) {
    updateQuestionCount();
  } else {
    setTimeout(waitForQuestions, 100);
  }
})();
