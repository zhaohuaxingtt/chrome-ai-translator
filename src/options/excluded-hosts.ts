/** 排除站点列表的增删（纯函数，主机名统一小写便于匹配） */

export function addExcludedHost(hosts: string[], host: string): string[] {
  const normalized = host.trim().toLowerCase();

  if (normalized === '' || hosts.includes(normalized)) {
    return hosts;
  }

  return [...hosts, normalized];
}

export function removeExcludedHost(hosts: string[], host: string): string[] {
  return hosts.filter((item) => item !== host);
}
