import ugosProxyHandler from "./proxy";

const POOL_STATUS = { 0: "Healthy", 1: "Degraded", 2: "Failed" };

const widget = {
  api: "{url}/ugreen/{endpoint}",
  proxyHandler: ugosProxyHandler,

  mappings: {
    stats: {
      endpoint: "stats",
      ugosPath: "/ugreen/v1/taskmgr/stat/get_all",
      map: (data) => {
        const cpu = data?.overview?.cpu?.[0] ?? {};
        const mem = data?.mem?.structure ?? {};
        const netOverview = data?.net?.series?.find((s) => s.name === "overview") ?? {};
        const diskOverview = data?.disk?.series?.find((s) => s.name === "overview") ?? {};
        return {
          cpuPercent: cpu.used_percent ?? 0,
          cpuTemp: cpu.temp ?? 0,
          memTotal: mem.total ?? 0,
          memUsed: mem.used ?? 0,
          netTx: netOverview.send_rate ?? 0,
          netRx: netOverview.recv_rate ?? 0,
          diskRead: diskOverview.read_rate ?? 0,
          diskWrite: diskOverview.write_rate ?? 0,
        };
      },
    },
    system: {
      endpoint: "system",
      ugosPath: "/ugreen/v1/desktop/components/data?id=desktop.component.SystemStatus",
      map: (data) => ({
        uptime: data?.total_run_time ?? 0,
      }),
    },
    pools: {
      endpoint: "pools",
      ugosPath: "/ugreen/v1/storage/pool/list",
      map: (data) =>
        (data?.result ?? []).map((pool) => {
          // Pool-level used/free reflect raw block device accounting (used === total,
          // free === 0). Real filesystem usage lives in the first volume.
          const vol = pool.volumes?.[0] ?? {};
          return {
            name: pool.label || pool.name,
            health: POOL_STATUS[pool.status] ?? "Unknown",
            healthy: pool.status === 0,
            total: pool.total ?? 0,
            used: vol.used ?? 0,
            free: vol.available ?? 0,
          };
        }),
    },
  },
};

export default widget;
