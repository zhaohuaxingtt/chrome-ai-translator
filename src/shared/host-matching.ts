/**
 * 主机名匹配：命中自身，或作为子域名后缀。
 * example.com 覆盖 www.example.com，但不覆盖 notexample.com。
 */
export function isExcluded(hostname: string, excludedHosts: string[]): boolean {
  return excludedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}
