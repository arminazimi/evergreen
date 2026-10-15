import request from "request";

export function fetchStatus(url, callback) {
  request.get(url, callback);
}
