const STEP = 60;
const MAX_SECONDS = 99 * 3600 + 59 * 60 + 59;
const BASE_TITLE = "Pomodoro";

let seconds = 0;
let endTime = 0;
let running = false;
let audioCtx: AudioContext | null = null;

const workerCode = `
let id = null;
self.onmessage = (e) => {
  if (e.data === "start") {
    clearInterval(id);
    id = setInterval(() => self.postMessage("tick"), 250);
  } else if (e.data === "stop") {
    clearInterval(id);
    id = null;
  }
};
`;

const worker = new Worker(
  URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }))
);

const display = document.querySelector<HTMLHeadingElement>("#time-display")!;
const hoursInput = document.querySelector<HTMLInputElement>("#hours-input")!;
const minutesInput = document.querySelector<HTMLInputElement>("#minutes-input")!;
const secondsInput = document.querySelector<HTMLInputElement>("#seconds-input")!;
const addBtn = document.querySelector<HTMLButtonElement>(".add-time")!;
const removeBtn = document.querySelector<HTMLButtonElement>(".remove-time")!;
const pauseBtn = document.querySelector<HTMLButtonElement>(".pause-time")!;

const inputs = [hoursInput, minutesInput, secondsInput];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function format(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(pad).join(":");
}

function render() {
  display.textContent = format(seconds);
  document.title = running ? `${format(seconds)} - ${BASE_TITLE}` : BASE_TITLE;
}

function clamp(value: number, max: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(max, Math.max(0, Math.floor(value)));
}

function readInputs(): number {
  const h = clamp(Number(hoursInput.value), 99);
  const m = clamp(Number(minutesInput.value), 59);
  const s = clamp(Number(secondsInput.value), 59);
  return Math.min(MAX_SECONDS, h * 3600 + m * 60 + s);
}

function clearInputs() {
  inputs.forEach((el) => (el.value = ""));
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

function notify(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/favicon.svg" });
}

function beep() {
  if (!audioCtx) return;
  const ctx = audioCtx;

  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + i * 0.35;

    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

function tick() {
  if (!running) return;
  seconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  render();
  if (seconds <= 0) finish();
}

function stop() {
  running = false;
  worker.postMessage("stop");
  pauseBtn.textContent = "Start";
  render();
}

function finish() {
  stop();
  notify("Pomodoro", "Time Over");
  beep();
  document.title = "Time Over";
  if (Notification.permission !== "granted") {
    alert("Time Over");
  }
}

function start() {
  if (running) return;

  requestNotificationPermission();
  audioCtx ??= new AudioContext();
  audioCtx.resume();

  const typed = readInputs();
  if (typed > 0) {
    seconds = typed;
    clearInputs();
  }

  if (seconds === 0) return;

  endTime = Date.now() + seconds * 1000;
  running = true;
  worker.postMessage("start");
  pauseBtn.textContent = "Stop";
  render();
}

function adjust(delta: number) {
  seconds = Math.min(MAX_SECONDS, Math.max(0, seconds + delta));
  if (running) {
    endTime = Date.now() + seconds * 1000;
    if (seconds === 0) {
      finish();
      return;
    }
  }
  render();
}

worker.onmessage = tick;

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick();
});

inputs.forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      el.blur();
      start();
    }
  });
});

document.querySelectorAll<HTMLButtonElement>(".spin-up, .spin-down").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target!) as HTMLInputElement;
    if (btn.classList.contains("spin-up")) {
      target.stepUp();
    } else {
      target.stepDown();
    }
  });
});

addBtn.addEventListener("click", () => adjust(STEP));
removeBtn.addEventListener("click", () => adjust(-STEP));

pauseBtn.addEventListener("click", () => {
  if (running) {
    stop();
  } else {
    start();
  }
});

render();
pauseBtn.textContent = "Start";