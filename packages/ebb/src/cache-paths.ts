import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where downloaded lifecycle data is cached. Imports only Node built-ins, so a command that must start fast can
 * locate the cache without loading the data and signature code.
 */

/** Where downloaded data lives: `EVERGREEN_DATA_DIR`, else the platform's cache directory. */
export function defaultCacheDirectory(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (env.EVERGREEN_DATA_DIR) return env.EVERGREEN_DATA_DIR;
  if (platform === "darwin") return join(home, "Library", "Caches", "evergreen");
  if (platform === "win32") return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "evergreen", "Cache");
  return join(env.XDG_CACHE_HOME ?? join(home, ".cache"), "evergreen");
}
