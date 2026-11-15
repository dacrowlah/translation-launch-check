import { spawn } from "node:child_process";

// Runs a command under a wall-clock limit: node scripts/time-limit.mjs <seconds> <command...>.
// Vitest cannot stop synchronous work that hangs, so a gate needs a limit from outside.
//
// The wrapper starts a guard (this script with --guard) in a new process group and holds a
// pipe to it. The guard runs the command in that group. When the command exits, or the pipe
// closes because the wrapper died (even by SIGKILL or a kill of the caller's group), the guard
// kills the whole group, so no worker is ever left running. At the limit the wrapper kills the
// group and exits 124; a bad limit exits 2 and a command that cannot start exits 127.
const USAGE = "usage: time-limit.mjs <seconds: a positive whole number> <command> [args...]";
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];

const killGroup = (pid, signal) => {
  try {
    process.kill(-pid, signal);
  } catch {
    // the group has already exited
  }
};

const cannotRun = (command) => {
  console.error(`time limit: cannot run ${command}`);
  report(127);
};

/** The exit status of a command that ended, sent to the wrapper, then the group is killed. */
const report = (code) => process.send?.(code, () => killGroup(process.pid, "SIGKILL"));

/** The guard kills its whole group when the wrapper's pipe closes (the wrapper died). */
const watchWrapper = () => {
  process.stdin.on("end", () => killGroup(process.pid, "SIGKILL"));
  process.stdin.resume();
};

const guard = (command, args) => {
  const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
  watchWrapper();
  child.on("error", () => cannotRun(command));
  child.on("exit", (code, signal) => report(code ?? (signal ? 1 : 0)));
};

const startGuard = (command, args) =>
  spawn(process.execPath, [new URL(import.meta.url).pathname, "--guard", command, ...args], {
    stdio: ["pipe", "inherit", "inherit", "ipc"],
    detached: true,
  });

/** At the limit, the guard's group is killed and the gate fails with 124. */
const limitTimer = (child, seconds, command) =>
  setTimeout(() => {
    console.error(`time limit: ${command} ran over ${seconds} s and was stopped`);
    killGroup(child.pid, "SIGKILL");
    process.exit(124);
  }, seconds * 1000);

/** The wrapper exits with the status the guard reported once the guard has exited. */
const exitWith = (child, timer) => {
  let status = 1;
  child.on("message", (code) => (status = code));
  child.on("exit", () => {
    clearTimeout(timer);
    process.exit(status);
  });
};

const run = (seconds, command, args) => {
  const child = startGuard(command, args);
  exitWith(child, limitTimer(child, seconds, command));
  SIGNALS.forEach((signal) => process.on(signal, () => killGroup(child.pid, signal)));
};

const [first, ...rest] = process.argv.slice(2);
if (first === "--guard") {
  guard(rest[0], rest.slice(1));
} else if (!/^[1-9]\d*$/u.test(first ?? "") || rest.length === 0) {
  console.error(USAGE);
  process.exit(2);
} else {
  run(Number(first), rest[0], rest.slice(1));
}
