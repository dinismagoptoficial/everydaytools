export type User = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  csrf: string;
  created: number;
  name: string;
  language: "pt-PT" | "en" | null;
};
export type Status = {
  setup: boolean;
  name: string;
  registration: boolean;
  retention_minutes: number;
  max_upload_mb: number;
  smtp: boolean;
  version: string;
  legal_version: string;
};
export type Tool = {
  id: string;
  extensions: string[];
  class: string;
  available: boolean;
  batch: boolean;
};
export type Job = {
  id: string;
  created: number;
  expires: number;
  state: string;
  ready: number;
  operation: string;
  class: string;
  error?: string;
  queue_ahead?: number;
  files: { name: string; size: number; ext: string; uploaded: boolean }[];
  outputs: { name: string; size: number; path: string }[];
};
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "EverydayTools",
      "X-CSRF-Token": csrf,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ detail: "internal_error" }));
  if (!response.ok) {
    if (response.status === 401 && path !== "/login" && path !== "/me")
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.detail || "internal_error");
  }
  return data;
}
export function uploadFile(
  jobId: string,
  index: number,
  file: File,
  progress: (n: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/jobs/${jobId}/files/${index}`);
    xhr.setRequestHeader("X-Requested-With", "EverydayTools");
    xhr.setRequestHeader("X-CSRF-Token", csrf);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    // Matches the server-side allowance: roughly 1 MB/s with a generous floor.
    xhr.timeout = Math.max(185000, Math.round(file.size / 1024) + 5000);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        try {
          reject(new Error(JSON.parse(xhr.responseText).detail));
        } catch {
          reject(new Error("upload_failed"));
        }
      }
    };
    xhr.onerror = () => reject(new Error("network_error"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.send(file);
  });
}
export function fileSize(bytes: number) {
  return bytes < 1024 ** 2
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
