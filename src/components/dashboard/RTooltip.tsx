export const RTooltipContent = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  const color = value > 0 ? 'hsl(142 70% 45%)' : value < 0 ? 'hsl(0 72% 51%)' : '#fafafa';
  return (
    <div className="glass-card rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-bold font-mono" style={{ color }}>
        {value >= 0 ? '+' : ''}{value}R
      </div>
    </div>
  );
};

export const chartGridStroke = 'hsl(228 13% 15%)';
export const chartTickFill = 'hsl(215 15% 45%)';
