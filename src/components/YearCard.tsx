import React from "react";

interface YearCardProps {
  year: string;
  data: { [uploads: string]: number };
}

const YearCard: React.FC<YearCardProps> = ({ year, data }) => {
  const maxFreq = Object.values(data).reduce((m, v) => (v > m ? v : m), 0) || 1;
  const maxHeight = 200; // px
  const entries = Object.entries(data)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .filter(([uploads]) => parseInt(uploads) > 0);

  return (
    <div className="year-card">
      <h3>{year}年</h3>
      <div className="histogram-bars">
        {entries.map(([uploads, days]) => {
          const relativeHeight = (days / maxFreq) * maxHeight;
          const height = Math.max(1, relativeHeight);
          return (
            <div key={uploads} className="histogram-bar-container">
              <div
                className="histogram-bar"
                style={{ height: `${height}px` }}
                title={`${uploads}件の投稿: ${days}日`}
              ></div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default YearCard;
