/* ==========================================================================
   VALYUTA APP — Kirish / Ro'yxatdan o'tish tizimi
   Eslatma: bu tizim server ishlatmaydi — hisob faqat shu qurilma/brauzerda
   saqlanadi (localStorage orqali). Parol oddiy xesh (SHA-256) bilan saqlanadi.
   ========================================================================== */

const ACCOUNT_KEY = "valyuta_account_v1";
const SESSION_KEY = "valyuta_session_v1";

let appStarted = false;

/* -------------------------- Kripto yordamchilari -------------------------- */

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  return sha256Hex(salt + ":" + password);
}

/* -------------------------- Validatsiya -------------------------- */

function validateLogin(login) {
  if (!login) return "Login kiritilishi shart.";
  if (/^\d/.test(login)) return "Login raqam bilan boshlanmasligi kerak.";
  if (!/^[A-Za-z_][A-Za-z0-9_]{2,}$/.test(login)) return "Login kamida 3 ta harf/raqamdan iborat bo'lsin.";
  return null;
}

function validatePassword(password) {
  if (!password || password.length < 8) return "Parol kamida 8 ta belgidan iborat bo'lishi kerak.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Parolda kamida bitta harf va bitta raqam bo'lishi kerak.";
  return null;
}

/* -------------------------- Holatni saqlash -------------------------- */

function getAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setAccount(acc) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
}

function clearAccount() {
  localStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(SESSION_KEY);
}

function setSession(active) {
  if (active) localStorage.setItem(SESSION_KEY, "1");
  else localStorage.removeItem(SESSION_KEY);
}

function hasActiveSession() {
  return localStorage.getItem(SESSION_KEY) === "1";
}

/* -------------------------- Ekranlarni almashtirish -------------------------- */

function showApp() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("pageWrap").style.display = "";
  if (!appStarted) {
    appStarted = true;
    window.startMainApp();
  }
}

function showAuth() {
  document.getElementById("authScreen").style.display = "flex";
  document.getElementById("pageWrap").style.display = "none";

  const hasAccount = !!getAccount();
  document.getElementById("showRegisterLink").style.display = hasAccount ? "none" : "";
  switchAuthView("login");

  // Formalarni tozalash
  document.getElementById("loginForm").reset();
  document.getElementById("registerForm").reset();
  clearError("loginError");
  clearError("registerError");
}

function switchAuthView(view) {
  document.getElementById("authLoginView").classList.toggle("active", view === "login");
  document.getElementById("authRegisterView").classList.toggle("active", view === "register");
  clearError("loginError");
  clearError("registerError");
}

function showError(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.classList.add("visible");
}

function clearError(id) {
  const el = document.getElementById(id);
  el.textContent = "";
  el.classList.remove("visible");
}

/* -------------------------- Amallar -------------------------- */

async function handleRegisterSubmit(e) {
  e.preventDefault();
  clearError("registerError");

  if (getAccount()) {
    showError("registerError", "Bu qurilmada allaqachon profil mavjud. Avval uni o'chiring.");
    return;
  }

  const ism = document.getElementById("regIsm").value.trim();
  const familiya = document.getElementById("regFamiliya").value.trim();
  const login = document.getElementById("regLogin").value.trim();
  const password = document.getElementById("regPassword").value;
  const password2 = document.getElementById("regPassword2").value;

  if (!ism) return showError("registerError", "Ism kiritilishi shart.");
  if (!familiya) return showError("registerError", "Familiya kiritilishi shart.");

  const loginErr = validateLogin(login);
  if (loginErr) return showError("registerError", loginErr);

  const passErr = validatePassword(password);
  if (passErr) return showError("registerError", passErr);

  if (password !== password2) return showError("registerError", "Parollar mos kelmadi.");

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  setAccount({ ism, familiya, login, salt, hash });
  setSession(true);
  showApp();
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  clearError("loginError");

  const login = document.getElementById("loginLogin").value.trim();
  const password = document.getElementById("loginPassword").value;
  const acc = getAccount();

  if (!acc) {
    showError("loginError", "Bu qurilmada ro'yxatdan o'tilmagan. Avval ro'yxatdan o'ting.");
    return;
  }
  if (acc.login !== login) {
    showError("loginError", "Login yoki parol noto'g'ri.");
    return;
  }
  const hash = await hashPassword(password, acc.salt);
  if (hash !== acc.hash) {
    showError("loginError", "Login yoki parol noto'g'ri.");
    return;
  }
  setSession(true);
  showApp();
}

async function handleDeleteProfile() {
  clearError("loginError");
  const acc = getAccount();
  if (!acc) {
    showError("loginError", "O'chiriladigan profil topilmadi.");
    return;
  }

  const login = document.getElementById("loginLogin").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (acc.login !== login) {
    showError("loginError", "Profilni o'chirish uchun avval to'g'ri login va parolni kiriting.");
    return;
  }
  const hash = await hashPassword(password, acc.salt);
  if (hash !== acc.hash) {
    showError("loginError", "Profilni o'chirish uchun avval to'g'ri login va parolni kiriting.");
    return;
  }

  const sure = confirm("Profilni butunlay o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.");
  if (!sure) return;

  clearAccount();
  localStorage.removeItem("valyuta_app_history_v1");
  showAuth();
}

function handleLogout() {
  setSession(false);
  showAuth();
}

/* -------------------------- Ishga tushirish -------------------------- */

function initAuth() {
  document.getElementById("showRegisterLink").addEventListener("click", (e) => {
    e.preventDefault();
    switchAuthView("register");
  });
  document.getElementById("showLoginLink").addEventListener("click", (e) => {
    e.preventDefault();
    switchAuthView("login");
  });

  document.getElementById("loginForm").addEventListener("submit", handleLoginSubmit);
  document.getElementById("registerForm").addEventListener("submit", handleRegisterSubmit);
  document.getElementById("deleteProfileBtn").addEventListener("click", handleDeleteProfile);

  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("logoutBtnSide").addEventListener("click", handleLogout);

  if (getAccount() && hasActiveSession()) {
    showApp();
  } else {
    showAuth();
  }
}

document.addEventListener("DOMContentLoaded", initAuth);
