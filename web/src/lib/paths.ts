const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";

export const basePath = configuredBasePath === "/"
  ? ""
  : configuredBasePath.replace(/\/$/, "");

export function withBasePath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${normalizedPath}`;
}
