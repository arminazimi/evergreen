import request from "request";
import { get as fetchIt } from "request";
import type { Options } from "request";

export function load(url: string, options?: Options) {
  fetchIt(url);
  return request.get(url, options);
}
