type StatCardsProps = {
  items: {
    title: string;
    value: string;
    detail: string;
    tone?: "up" | "down" | "flat";
  }[];
};

export default function StatCards({ items }: StatCardsProps) {
  return (
    <div className="metric-grid">
      {items.map((item) => (
        <article className="panel metric-card" key={item.title}>
          <div className="muted">{item.title}</div>
          <strong className={item.tone ? `trend-${item.tone}` : undefined}>{item.value}</strong>
          <div className={item.tone ? `trend-${item.tone}` : "muted"}>{item.detail}</div>
        </article>
      ))}
    </div>
  );
}
