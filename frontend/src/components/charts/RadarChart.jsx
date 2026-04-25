import { useEffect, useRef } from "react";
import * as d3 from "d3";

const DEFAULT_METRICS = [
  "Goals",
  "Assists",
  "Key Passes",
  "Dribbles",
  "Aerials",
  "Tackles",
  "Interceptions",
  "Pass Accuracy",
];

export default function RadarChart({
  series = [],
  metrics = DEFAULT_METRICS,
  title = "Radar Comparison",
  subtitle = "Normalized profile across eight metrics.",
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    element.innerHTML = "";

    const width = 420;
    const height = 360;
    const radius = 115;
    const centerX = width / 2;
    const centerY = 190;
    const angleSlice = (Math.PI * 2) / metrics.length;

    const svg = d3
      .select(element)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("class", "w-full");

    const group = svg.append("g");

    d3.range(1, 6).forEach((level) => {
      const levelRadius = (radius * level) / 5;
      const points = metrics.map((_, index) => {
        const angle = angleSlice * index - Math.PI / 2;
        return [centerX + Math.cos(angle) * levelRadius, centerY + Math.sin(angle) * levelRadius];
      });

      group
        .append("polygon")
        .attr("points", points.map((point) => point.join(",")).join(" "))
        .attr("fill", "none")
        .attr("stroke", "rgba(148,173,195,0.18)");
    });

    metrics.forEach((metric, index) => {
      const angle = angleSlice * index - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const labelX = centerX + Math.cos(angle) * (radius + 24);
      const labelY = centerY + Math.sin(angle) * (radius + 24);

      group
        .append("line")
        .attr("x1", centerX)
        .attr("y1", centerY)
        .attr("x2", x)
        .attr("y2", y)
        .attr("stroke", "rgba(148,173,195,0.22)");

      group
        .append("text")
        .attr("x", labelX)
        .attr("y", labelY)
        .attr("fill", "#94adc3")
        .attr("font-size", "11")
        .attr("text-anchor", "middle")
        .text(metric);
    });

    series.forEach((item, seriesIndex) => {
      const points = metrics.map((metric, index) => {
        const angle = angleSlice * index - Math.PI / 2;
        const value = Number(item.values?.[metric] ?? 0) / 100;
        return [centerX + Math.cos(angle) * radius * value, centerY + Math.sin(angle) * radius * value];
      });

      group
        .append("polygon")
        .attr("points", points.map((point) => point.join(",")).join(" "))
        .attr("fill", item.fill || "rgba(245,158,11,0.2)")
        .attr("stroke", item.stroke || "#f59e0b")
        .attr("stroke-width", 2);

      group
        .selectAll(`.radar-point-${seriesIndex}`)
        .data(points)
        .enter()
        .append("circle")
        .attr("cx", (point) => point[0])
        .attr("cy", (point) => point[1])
        .attr("r", 2.5)
        .attr("fill", item.stroke || "#f59e0b");
    });
  }, [metrics, series]);

  return (
    <div className="panel p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-[color:var(--color-text-muted)]">{subtitle}</p>
      </div>

      {series.length ? (
        <div className="mb-4 flex flex-wrap gap-4">
          {series.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex items-center gap-2 text-sm text-white">
              <span
                className="h-4 w-4 rounded-full"
                style={{ backgroundColor: item.stroke || "#f59e0b" }}
              />
              <span>{item.label || `Series ${index + 1}`}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div ref={containerRef} />
    </div>
  );
}
