"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";

type RepoData = {
  repo: string;
  total: number;
};

type RepoContributionChartProps = {
  data: RepoData[];
  maxRepos?: number;
};

export function RepoContributionChart({ data, maxRepos = 10 }: RepoContributionChartProps) {
  const option = useMemo(() => {
    // Take top N repos
    const topRepos = data.slice(0, maxRepos);
    const chartData = topRepos.map((item) => ({
      name: item.repo.split("/").pop() || item.repo,
      value: item.total,
    }));

    return {
      title: {
        text: "仓库贡献分布",
        left: "center",
        textStyle: {
          fontSize: 16,
          fontWeight: 600,
          color: "#18181b",
        },
      },
      tooltip: {
        trigger: "item",
        formatter: "{b}: {c} ({d}%)",
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderColor: "#e4e4e7",
        borderWidth: 1,
        textStyle: {
          color: "#18181b",
        },
      },
      legend: {
        orient: "vertical",
        right: 10,
        top: "middle",
        textStyle: {
          color: "#71717a",
          fontSize: 11,
        },
        formatter: (name: string) => {
          const maxLength = 15;
          return name.length > maxLength ? name.slice(0, maxLength) + "..." : name;
        },
      },
      series: [
        {
          name: "仓库贡献",
          type: "pie",
          radius: ["40%", "70%"],
          center: ["35%", "50%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: {
            show: false,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: "bold",
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
          labelLine: {
            show: false,
          },
          data: chartData,
          color: [
            "#3b82f6",
            "#a855f7",
            "#f97316",
            "#10b981",
            "#ef4444",
            "#06b6d4",
            "#8b5cf6",
            "#f59e0b",
            "#14b8a6",
            "#ec4899",
          ],
        },
      ],
    };
  }, [data, maxRepos]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <ReactECharts option={option} style={{ height: "300px" }} opts={{ renderer: "svg" }} />
    </div>
  );
}
