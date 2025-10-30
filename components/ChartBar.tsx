"use client";
import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

export default function ChartBar({ labels, values }: { labels: string[]; values: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const chart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ data: values }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
    return () => chart.destroy();
  }, [labels.join(","), values.join(",")]);
  return <canvas ref={canvasRef} />;
}
