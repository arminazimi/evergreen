import cli from "./cli.js";
import mcp from "./mcp.js";
import skill from "./skill.js";
import plugin from "./plugin.js";
import ciGithubActions from "./ci.github-actions.js";
import ciGitlab from "./ci.gitlab.js";

/** Every surface the manifest lists, in manifest order. Adding one imports its file here. */
export const surfaces = [cli, mcp, skill, plugin, ciGithubActions, ciGitlab] as const;
