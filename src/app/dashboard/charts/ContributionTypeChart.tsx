"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";

type ContributionTypeData = {
  prs: number;
  reviews: number;
  commits: number;
};

type ContributionTypeChartProps = {
  data: ContributionTypeData;
};

export function ContributionTypeChart({ data }: ContributionTypeChartProps) {
  const option = useMemo(() => {
    const chartData = [
      { name: "PRs Created", value: data.prs },
      { name: "PRs Reviewed", value: data.reviews },
      { name: "Commits", value: data.commits },
    ].filter((item) => item.value > 0);

    return {
      title: {
        text: "贡献类型分布",
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
        bottom: 10,
        left: "center",
        textStyle: {
          color: "#71717a",
        },
      },
      series: [
        {
          name: "贡献类型",
          type: "pie",
          radius: ["40%", "70%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 8,
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: {
            show: true,
            position: "outside",
            formatter: "{b}\n{d}%",
            color: "#71717a",
            fontSize: 12,
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
            show: true,
            lineStyle: {
              color: "#e4e4e7",
            },
          },
          data: chartData,
          color: ["#a855f7", "#f97316", "#3b82f6"],
        },
      ],
    };
  }, [data]);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <ReactECharts option={option} style={{ height: "300px" }} opts={{ renderer: "svg" }} />
    </div>
  );
}
