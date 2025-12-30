"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";

type WeeklyData = {
  week: string;
  prs: number;
  reviews: number;
  commits: number;
};

type ContributionTrendChartProps = {
  data: WeeklyData[];
};

export function ContributionTrendChart({ data }: ContributionTrendChartProps) {
  const option = useMemo(() => {
    const weeks = data.map((d) => d.week);
    const prsData = data.map((d) => d.prs);
    const reviewsData = data.map((d) => d.reviews);
    const commitsData = data.map((d) => d.commits);

    return {
      title: {
        text: "贡献趋势",
        left: "center",
        textStyle: {
          fontSize: 16,
          fontWeight: 600,
          color: "#18181b",
        },
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderColor: "#e4e4e7",
        borderWidth: 1,
        textStyle: {
          color: "#18181b",
        },
      },
      legend: {
        data: ["PRs", "Reviews", "Commits"],
        bottom: 10,
        textStyle: {
          color: "#71717a",
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        top: "15%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: weeks,
        axisLine: {
          lineStyle: {
            color: "#e4e4e7",
          },
        },
        axisLabel: {
          color: "#71717a",
          fontSize: 11,
        },
      },
      yAxis: {
        type: "value",
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: "#71717a",
          fontSize: 11,
        },
        splitLine: {
          lineStyle: {
            color: "#f4f4f5",
          },
        },
      },
      series: [
        {
          name: "PRs",
          type: "line",
          smooth: true,
          data: prsData,
          lineStyle: {
            color: "#a855f7",
            width: 2,
          },
          itemStyle: {
            color: "#a855f7",
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: "rgba(168, 85, 247, 0.3)",
                },
                {
                  offset: 1,
                  color: "rgba(168, 85, 247, 0.05)",
                },
              ],
            },
          },
        },
        {
          name: "Reviews",
          type: "line",
          smooth: true,
          data: reviewsData,
          lineStyle: {
            color: "#f97316",
            width: 2,
          },
          itemStyle: {
            color: "#f97316",
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: "rgba(249, 115, 22, 0.3)",
                },
                {
                  offset: 1,
                  color: "rgba(249, 115, 22, 0.05)",
                },
              ],
            },
          },
        },
        {
          name: "Commits",
          type: "line",
          smooth: true,
          data: commitsData,
          lineStyle: {
            color: "#3b82f6",
            width: 2,
          },
          itemStyle: {
            color: "#3b82f6",
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                {
                  offset: 0,
                  color: "rgba(59, 130, 246, 0.3)",
                },
                {
                  offset: 1,
                  color: "rgba(59, 130, 246, 0.05)",
                },
              ],
            },
          },
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
