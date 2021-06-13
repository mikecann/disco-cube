import { updateFirebaseState, listenForFirebaseSnapshots, setFirebaseState } from "./firebase";
import { AppExecution, AppNames } from "../sharedTypes";
import { ChildProcessWithoutNullStreams, spawn, fork, ChildProcess } from "child_process";
import * as log4js from "log4js";
import kill from "tree-kill";
import { config } from "../config/config";
import { getNodePath } from "../utils/misc";

const logger = log4js.getLogger(`apps`);

export const initAppState = () =>
  setFirebaseState("apps", {
    command: null,
    runningApp: null,
  });

export const startAppService = () => {
  let app: RunningApp | undefined = undefined;

  logger.debug(`listening for snapshots`);

  listenForFirebaseSnapshots("apps", async (state) => {
    if (!state) return;
    if (!state.command) return;

    const { command } = state;

    logger.debug(`handling command`, command);

    if (command.kind == "start-app") {
      if (!apps[command.name]) throw new Error(`Cannot start unknown app '${command.name}'`);
      if (app) throw new Error(`cannot start app, one is already running`);

      if (config.MOCK_RUNNING_APPS == "true") app = startMockApp();
      else app = apps[command.name](command.args);

      updateFirebaseState("apps", {
        command: null,
        runningApp: AppExecution({
          error: "",
          name: "debug",
          status: "running",
          stderr: "",
          stdout: "",
        }),
      });
    }

    if (command.kind == "stop-app") {
      if (app) app.stop();
      app = undefined;
      updateFirebaseState("apps", {
        command: null,
        runningApp: null,
      });
    }

    if (command.kind == "update-app-state") {
      if (!app) return;

      app.send(command);

      updateFirebaseState("apps", {
        command: null,
      });
    }
  });
};


const startNodeApp = (name: string) => (args: string[]) =>
  spawnApp(name, getNodePath(), [`${process.cwd()}/apps/dist/apps/src/${name}/index.js`, ...args]);

const startMockApp = () => forkApp("mock", `${process.cwd()}/mock/dist/mock/src/index.js`, []);

const apps: Record<AppNames, (args: string[]) => RunningApp> = {
  rpiDemos: (args) =>
    spawnApp(`rpiDemos`, `/home/pi/rpi-rgb-led-matrix/examples-api-use/demo`, [
      `--led-rows=64`,
      `--led-cols=64`,
      `--led-chain=2`,
      `--led-parallel=3`,
      `--led-slowdown-gpio=2`,
      ...args,
    ]),

  video: (args) =>
    spawnApp(`video`, `/home/pi/rpi-rgb-led-matrix/utils/video-viewer`, [
      `--led-rows=64`,
      `--led-cols=64`,
      `--led-chain=2`,
      `--led-parallel=3`,
      `--led-slowdown-gpio=2`,
      `-f`,
      `-F`,
      `${process.cwd()}/apps/videos/${args[0]}`
    ]),

  cubemap: startNodeApp(`cubemap`),
  sparkle: startNodeApp(`sparkle`),
  debug: startNodeApp(`debug`),
  paint: () => forkApp(`paint`, `${process.cwd()}/apps/dist/apps/src/paint.js`, []),
  sprinkles: startNodeApp(`sprinkles`),

  particles: startNodeApp(`particles`),
  particleFlow: startNodeApp(`particleFlow`),
  maze: startNodeApp(`maze`),
  tilt: startNodeApp(`tilt`),
};

const spawnApp = (name: string, command: string, args: string[]): RunningApp => {
  const logger = log4js.getLogger(name);
  logger.debug(`spawning app`, { name, command, args });

  let proc: ChildProcessWithoutNullStreams | undefined = undefined;
  try {
    proc = spawn(command, args);

    proc.stdout.on("data", (data) => {
      logger.debug(`stdout: ${data}`);
    });

    proc.stderr.on("data", (data) => {
      logger.error(`stderr: ${data}`);
    });

    proc.on("close", (code) => {
      logger.debug(`child process exited with code ${code}`);
    });
  } catch (e) {
    logger.error(`spawn error`, e);
  }

  return {
    send: (data: any) => {
      logger.warn(`cannot send data to a spawned app, must be forked.`);
    },
    stop: () => {
      logger.debug(`stopping..`);
      if (proc) kill(proc.pid);
    },
  };
};

const forkApp = (name: string, jsFilePath: string, args: string[]): RunningApp => {
  const logger = log4js.getLogger(name);
  logger.debug(`starting..`);

  let proc: ChildProcess | undefined = undefined;
  try {
    proc = fork(jsFilePath, args, {
      stdio: "pipe",
    });

    if (!proc) throw new Error(`fork failed, no proc`);
    if (!proc.stdout) throw new Error(`fork failed, no proc.stdout`);
    if (!proc.stderr) throw new Error(`fork failed, no proc.stderr`);

    proc.stdout.on("data", (data) => {
      logger.debug(`stdout: ${data}`);
    });

    proc.stderr.on("data", (data) => {
      logger.error(`stderr: ${data}`);
    });

    proc.on("close", (code) => {
      logger.debug(`child process exited with code ${code}`);
    });
  } catch (e) {
    logger.error(`spawn error`, e);
  }

  return {
    send: (data: any) => {
      proc?.send(data);
    },
    stop: () => {
      logger.debug(`stopping..`);
      if (proc) kill(proc.pid);
    },
  };
};

export type RunningApp = {
  stop: () => any;
  send: (data: any) => any;
};
