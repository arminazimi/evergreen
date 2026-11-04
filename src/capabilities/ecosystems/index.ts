import android from "./android.js";
import bun from "./bun.js";
import ciImages from "./ci-images.js";
import container from "./container.js";
import cpp from "./cpp.js";
import dart from "./dart.js";
import deno from "./deno.js";
import dotnet from "./dotnet.js";
import elixir from "./elixir.js";
import githubActions from "./github-actions.js";
import go from "./go.js";
import java from "./java.js";
import kubernetes from "./kubernetes.js";
import nodejs from "./nodejs.js";
import npm from "./npm.js";
import php from "./php.js";
import python from "./python.js";
import ruby from "./ruby.js";
import rust from "./rust.js";
import scala from "./scala.js";
import serverless from "./serverless.js";
import swift from "./swift.js";
import terraform from "./terraform.js";
import database from "./database.js";
import shell from "./shell.js";

/**
 * Every ecosystem the manifest lists, in manifest order. Adding an ecosystem imports its file
 * here and nothing else: the item's status, maturity, and detectors live in the file above.
 */
export const ecosystems = [
  android,
  bun,
  ciImages,
  container,
  cpp,
  dart,
  deno,
  dotnet,
  elixir,
  githubActions,
  go,
  java,
  kubernetes,
  nodejs,
  npm,
  php,
  python,
  ruby,
  rust,
  scala,
  serverless,
  swift,
  terraform,
  database,
  shell,
] as const;

/**
 * The ecosystems the scan capabilities cover, as a sorted id list. Every listed ecosystem is
 * scannable today, so a new one joins the scan capabilities without editing their files. The
 * sort keeps the list stable whatever order the manifest lists items in.
 */
export const scanEcosystemIds: readonly string[] = ecosystems.map((ecosystem) => ecosystem.id).sort();
