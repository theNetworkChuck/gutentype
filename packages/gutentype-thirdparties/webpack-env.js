import { execFileSync } from "node:child_process";

/*
 * Build-time constants for the browser and server bundles. GIT_SHA names the deployed commit: the footer's
 * Source link and the page's version meta both read it (ISC-1, ISC-3). A Docker build passes it as a build arg
 * because the image has no .git.
 */
function gitSha() {
  if (process.env.GIT_SHA) {
    return process.env.GIT_SHA;
  }
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
    }).trim();
  } catch {
    return "dev";
  }
}

const ENV = {
  "process.env.GIT_SHA": JSON.stringify(gitSha()),
};

export { ENV };
